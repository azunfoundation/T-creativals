<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Mail\WelcomeUserMail;
use App\Models\ClientContact;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

/**
 * The Clients module's own API surface, gated on the `clients.*` permission
 * strings from RolesPermissionsSeeder.
 *
 * Before this controller existed, the Clients pages rode on
 * `reports/clients` (requires reports.view_sales/view_financial) and the
 * Users endpoints (require users.view/users.edit/users.create) — so the very
 * roles the module is built for (sales_exec holds clients.view, sales_head
 * holds clients.*) were 403'd on list, edit, and invite despite the sidebar
 * showing them the page.
 */
class ClientController extends Controller
{
    /** Delivery-in-progress statuses (see ReportController for rationale). */
    protected const RUNNING_PROJECT_STATUSES = ['active', 'in_progress'];
    protected const CLOSED_PROJECT_STATUSES = ['completed', 'cancelled'];

    /** Invoice statuses that count as billed revenue (matches FinancialReportService). */
    protected const REVENUE_INVOICE_STATUSES = ['approved', 'sent', 'paid', 'partially_paid', 'overdue'];

    protected function deny(): JsonResponse
    {
        return response()->json(['message' => 'This action is unauthorized.'], 403);
    }

    /** Clients are Users with the `client` role; anything else 404s here. */
    protected function assertIsClient(User $client): ?JsonResponse
    {
        if (!$client->hasRole('client')) {
            return response()->json(['message' => 'Client not found.'], 404);
        }
        return null;
    }

    /**
     * Client directory with lifetime billing aggregates + health score.
     * GET /api/v1/clients
     */
    public function index(Request $request): JsonResponse
    {
        if (!$request->user()->hasPermissionTo('clients.view')) {
            return $this->deny();
        }

        $clients = User::role('client')
            ->select('id', 'name', 'company_name', 'email', 'phone', 'status', 'is_client_portal_user')
            ->orderBy('name')
            ->get();
        $clientIds = $clients->pluck('id')->toArray();

        $projectsStatsMap = DB::table('projects')
            ->select(
                'client_id',
                DB::raw('count(id) as total_projects'),
                DB::raw("sum(case when status in ('active', 'in_progress') then 1 else 0 end) as active_projects"),
                DB::raw("sum(case when status = 'on_hold' then 1 else 0 end) as on_hold_projects"),
                DB::raw("sum(case when status = 'cancelled' then 1 else 0 end) as cancelled_projects")
            )
            ->whereIn('client_id', $clientIds)
            ->whereNull('deleted_at')
            ->groupBy('client_id')
            ->get()
            ->keyBy('client_id');

        $revenueList = "'" . implode("','", self::REVENUE_INVOICE_STATUSES) . "'";
        $invoiceStatsMap = DB::table('invoices')
            ->select(
                'client_id',
                DB::raw("sum(case when status in ({$revenueList}) then total_amount * exchange_rate else 0 end) as total_billed"),
                DB::raw("sum(case when status in ({$revenueList}) then paid_amount * exchange_rate else 0 end) as total_paid"),
                DB::raw("sum(case when status in ({$revenueList}) then due_amount * exchange_rate else 0 end) as total_outstanding"),
                DB::raw("sum(case when status = 'overdue' then 1 else 0 end) as overdue_count"),
                DB::raw('max(issue_date) as last_invoice_date')
            )
            ->whereIn('client_id', $clientIds)
            ->whereNull('deleted_at')
            ->groupBy('client_id')
            ->get()
            ->keyBy('client_id');

        $lastPaymentMap = DB::table('payments')
            ->join('invoices', 'payments.invoice_id', '=', 'invoices.id')
            ->select('invoices.client_id', DB::raw('max(payments.payment_date) as last_payment_date'))
            ->whereIn('invoices.client_id', $clientIds)
            ->whereNull('payments.deleted_at')
            ->groupBy('invoices.client_id')
            ->get()
            ->keyBy('client_id');

        $breakdown = [];
        $totalBilledAll = 0.0;
        $totalPaidAll = 0.0;
        $totalOutstandingAll = 0.0;
        $activeClientsCount = 0;

        foreach ($clients as $client) {
            $projStats = $projectsStatsMap->get($client->id);
            $invStats = $invoiceStatsMap->get($client->id);
            $activeProjects = (int) ($projStats->active_projects ?? 0);
            if ($activeProjects > 0) {
                $activeClientsCount++;
            }

            $totalBilled = (float) ($invStats->total_billed ?? 0.0);
            $totalPaid = (float) ($invStats->total_paid ?? 0.0);
            $totalOutstanding = (float) ($invStats->total_outstanding ?? 0.0);
            $totalBilledAll += $totalBilled;
            $totalPaidAll += $totalPaid;
            $totalOutstandingAll += $totalOutstanding;

            $health = $this->healthScore(
                (int) ($invStats->overdue_count ?? 0),
                (int) ($projStats->on_hold_projects ?? 0),
                (int) ($projStats->cancelled_projects ?? 0),
                $totalBilled,
                $totalOutstanding
            );

            $breakdown[] = [
                'client_id' => $client->id,
                'client_name' => $client->name,
                'company_name' => $client->company_name,
                'client_email' => $client->email,
                'phone' => $client->phone,
                'status' => $client->status,
                'is_client_portal_user' => (bool) $client->is_client_portal_user,
                'health_score' => $health['score'],
                'active_projects' => $activeProjects,
                'total_projects' => (int) ($projStats->total_projects ?? 0),
                'total_billed' => round($totalBilled, 2),
                'total_paid' => round($totalPaid, 2),
                'total_outstanding' => round($totalOutstanding, 2),
                'last_invoice_date' => $invStats->last_invoice_date ?? null,
                'last_payment_date' => $lastPaymentMap->get($client->id)->last_payment_date ?? null,
            ];
        }

        return response()->json([
            'summary' => [
                'total_clients' => $clients->count(),
                'total_active' => $activeClientsCount,
                'total_billed' => round($totalBilledAll, 2),
                'total_collected' => round($totalPaidAll, 2),
                'total_outstanding' => round($totalOutstandingAll, 2),
            ],
            'breakdown' => $breakdown,
        ]);
    }

    /**
     * Create (invite) a client account. Assigns the `client` role itself —
     * callers never pass role ids here.
     * POST /api/v1/clients
     */
    public function store(Request $request): JsonResponse
    {
        if (!$request->user()->hasPermissionTo('clients.create')) {
            return $this->deny();
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:8'],
            'phone' => ['nullable', 'string', 'max:20'],
            'billing_address' => ['nullable', 'string', 'max:2000'],
            'tax_number' => ['nullable', 'string', 'max:50'],
            'default_currency_id' => ['nullable', 'exists:currencies,id'],
        ]);

        // Same soft-delete-spanning dedupe as UserController::store.
        $existing = User::withTrashed()->where('email', $validated['email'])->first();
        if ($existing && !$existing->trashed()) {
            return response()->json([
                'message' => 'A user with this email already exists.',
                'errors' => ['email' => ['A user with this email already exists.']],
                'existing_user_id' => $existing->id,
            ], 422);
        }

        $attributes = [
            'name' => $validated['name'],
            'company_name' => $validated['company_name'] ?? null,
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'phone' => $validated['phone'] ?? null,
            'billing_address' => $validated['billing_address'] ?? null,
            'tax_number' => $validated['tax_number'] ?? null,
            'default_currency_id' => $validated['default_currency_id'] ?? null,
            'status' => 'active',
            'is_client_portal_user' => true,
        ];

        if ($existing) {
            $existing->restore();
            $existing->update($attributes);
            $client = $existing;
        } else {
            $client = User::create($attributes);
        }
        $client->syncRoles(['client']);

        Mail::to($client->email)->queue(new WelcomeUserMail($client, $validated['password']));

        return response()->json([
            'message' => 'Client account created. A welcome email with their portal login is on its way.',
            'data' => $client->only(['id', 'name', 'company_name', 'email', 'phone', 'status']),
        ], 201);
    }

    /**
     * Full client detail: profile + billing, contacts, projects, invoices,
     * quotes, 12-month revenue history, lifetime totals, health breakdown.
     * GET /api/v1/clients/{client}
     */
    public function show(Request $request, User $client): JsonResponse
    {
        if (!$request->user()->hasPermissionTo('clients.view')) {
            return $this->deny();
        }
        if ($resp = $this->assertIsClient($client)) {
            return $resp;
        }

        $client->load([
            'clientContacts' => function ($q) {
                $q->orderByDesc('is_primary')->orderBy('name');
            },
            'defaultCurrency:id,code,symbol,name',
        ]);

        $projects = DB::table('projects')
            ->where('client_id', $client->id)
            ->whereNull('deleted_at')
            ->select('id', 'project_number', 'name', 'status', 'completion_percentage', 'start_date', 'end_date', 'budget_amount')
            ->orderByDesc('created_at')
            ->get();

        // One lightweight full fetch for totals + monthly history; the
        // rendered list is capped separately below.
        $invoiceRows = DB::table('invoices')
            ->where('client_id', $client->id)
            ->whereNull('deleted_at')
            ->select('id', 'invoice_number', 'title', 'status', 'total_amount', 'paid_amount', 'due_amount', 'exchange_rate', 'issue_date', 'due_date')
            ->orderByDesc('issue_date')
            ->get();

        $paymentRows = DB::table('payments')
            ->join('invoices', 'payments.invoice_id', '=', 'invoices.id')
            ->where('invoices.client_id', $client->id)
            ->whereNull('payments.deleted_at')
            ->whereNull('invoices.deleted_at')
            ->select('payments.payment_date', 'payments.amount', 'invoices.exchange_rate')
            ->get();

        $quotes = DB::table('quotes')
            ->where('client_id', $client->id)
            ->whereNull('deleted_at')
            ->select('id', 'quote_number', 'status', 'total_amount', 'created_at', 'valid_until')
            ->orderByDesc('created_at')
            ->limit(25)
            ->get();
        $quotesTotal = DB::table('quotes')->where('client_id', $client->id)->whereNull('deleted_at')->count();

        // Lifetime totals (INR-normalized, revenue statuses only)
        $totalBilled = 0.0;
        $totalPaid = 0.0;
        $totalOutstanding = 0.0;
        $overdueCount = 0;
        foreach ($invoiceRows as $inv) {
            if (in_array($inv->status, self::REVENUE_INVOICE_STATUSES, true)) {
                $rate = (float) $inv->exchange_rate;
                $totalBilled += (float) $inv->total_amount * $rate;
                $totalPaid += (float) $inv->paid_amount * $rate;
                $totalOutstanding += (float) $inv->due_amount * $rate;
            }
            if ($inv->status === 'overdue') {
                $overdueCount++;
            }
        }

        // 12-month billed vs collected history
        $history = [];
        $monthKeys = [];
        for ($i = 11; $i >= 0; $i--) {
            $m = Carbon::now()->subMonths($i);
            $key = $m->format('Y-m');
            $monthKeys[$key] = count($history);
            $history[] = [
                'month_key' => $key,
                'month_name' => $m->format('M Y'),
                'billed' => 0.0,
                'collected' => 0.0,
            ];
        }
        foreach ($invoiceRows as $inv) {
            if (!$inv->issue_date || !in_array($inv->status, self::REVENUE_INVOICE_STATUSES, true)) {
                continue;
            }
            $key = substr((string) $inv->issue_date, 0, 7);
            if (isset($monthKeys[$key])) {
                $history[$monthKeys[$key]]['billed'] += (float) $inv->total_amount * (float) $inv->exchange_rate;
            }
        }
        foreach ($paymentRows as $pay) {
            $key = substr((string) $pay->payment_date, 0, 7);
            if (isset($monthKeys[$key])) {
                $history[$monthKeys[$key]]['collected'] += (float) $pay->amount * (float) $pay->exchange_rate;
            }
        }
        foreach ($history as &$h) {
            $h['billed'] = round($h['billed'], 2);
            $h['collected'] = round($h['collected'], 2);
        }
        unset($h);

        $onHold = $projects->where('status', 'on_hold')->count();
        $cancelled = $projects->where('status', 'cancelled')->count();
        $health = $this->healthScore($overdueCount, $onHold, $cancelled, $totalBilled, $totalOutstanding);

        return response()->json([
            'client' => [
                'id' => $client->id,
                'name' => $client->name,
                'company_name' => $client->company_name,
                'email' => $client->email,
                'phone' => $client->phone,
                'status' => $client->status,
                'is_client_portal_user' => (bool) $client->is_client_portal_user,
                'billing_address' => $client->billing_address,
                'tax_number' => $client->tax_number,
                'default_currency' => $client->defaultCurrency,
                'last_login_at' => $client->last_login_at?->toIso8601String(),
                'created_at' => $client->created_at?->toIso8601String(),
            ],
            'contacts' => $client->clientContacts,
            'projects' => [
                'active' => $projects->filter(fn ($p) => in_array($p->status, self::RUNNING_PROJECT_STATUSES, true))->values(),
                'pipeline' => $projects->filter(fn ($p) => in_array($p->status, ['planning', 'on_hold'], true))->values(),
                'closed' => $projects->filter(fn ($p) => in_array($p->status, self::CLOSED_PROJECT_STATUSES, true))->values(),
                'total_count' => $projects->count(),
            ],
            'invoices' => [
                'items' => $invoiceRows->take(25)->values(),
                'total_count' => $invoiceRows->count(),
            ],
            'quotes' => [
                'items' => $quotes,
                'total_count' => $quotesTotal,
            ],
            'totals' => [
                'total_billed' => round($totalBilled, 2),
                'total_paid' => round($totalPaid, 2),
                'total_outstanding' => round($totalOutstanding, 2),
            ],
            'revenue_history' => $history,
            'health' => $health,
        ]);
    }

    /**
     * Update a client's profile/billing/portal access. Role changes are NOT
     * possible here — those belong to the Users module and users.edit.
     * PUT /api/v1/clients/{client}
     */
    public function update(Request $request, User $client): JsonResponse
    {
        if (!$request->user()->hasPermissionTo('clients.edit')) {
            return $this->deny();
        }
        if ($resp = $this->assertIsClient($client)) {
            return $resp;
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($client->id)->whereNull('deleted_at')],
            'phone' => ['nullable', 'string', 'max:20'],
            'status' => ['sometimes', Rule::in(['active', 'inactive', 'suspended'])],
            'is_client_portal_user' => ['sometimes', 'boolean'],
            'billing_address' => ['nullable', 'string', 'max:2000'],
            'tax_number' => ['nullable', 'string', 'max:50'],
            'default_currency_id' => ['nullable', 'exists:currencies,id'],
        ]);

        $client->update($validated);

        return response()->json([
            'message' => 'Client updated successfully.',
            'data' => $client->fresh()->only([
                'id', 'name', 'company_name', 'email', 'phone', 'status',
                'is_client_portal_user', 'billing_address', 'tax_number', 'default_currency_id',
            ]),
        ]);
    }

    /**
     * Soft-delete a client account. Blocked while projects or invoices still
     * reference them — deactivate instead, so billing history stays intact.
     * DELETE /api/v1/clients/{client}
     */
    public function destroy(Request $request, User $client): JsonResponse
    {
        if (!$request->user()->hasPermissionTo('clients.delete')) {
            return $this->deny();
        }
        if ($resp = $this->assertIsClient($client)) {
            return $resp;
        }

        $projectCount = DB::table('projects')->where('client_id', $client->id)->whereNull('deleted_at')->count();
        $invoiceCount = DB::table('invoices')->where('client_id', $client->id)->whereNull('deleted_at')->count();
        if ($projectCount > 0 || $invoiceCount > 0) {
            return response()->json([
                'message' => "This client has {$projectCount} project(s) and {$invoiceCount} invoice(s) linked to them. Set their status to Inactive instead of deleting, so billing history stays traceable.",
            ], 422);
        }

        $client->delete();

        return response()->json(['message' => 'Client deleted. A founder can restore them from Settings → Backups & Recovery → Recovery Bin.']);
    }

    // ─── Contacts (PRD: multiple contacts per client) ───────────────────────

    public function storeContact(Request $request, User $client): JsonResponse
    {
        if (!$request->user()->hasPermissionTo('clients.edit')) {
            return $this->deny();
        }
        if ($resp = $this->assertIsClient($client)) {
            return $resp;
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'designation' => ['nullable', 'string', 'max:255'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);
        $validated['client_id'] = $client->id;

        if (!empty($validated['is_primary'])) {
            ClientContact::where('client_id', $client->id)->update(['is_primary' => false]);
        }

        $contact = ClientContact::create($validated);

        return response()->json(['message' => 'Contact added.', 'data' => $contact], 201);
    }

    public function updateContact(Request $request, User $client, ClientContact $contact): JsonResponse
    {
        if (!$request->user()->hasPermissionTo('clients.edit')) {
            return $this->deny();
        }
        if ($resp = $this->assertIsClient($client)) {
            return $resp;
        }
        if ($contact->client_id !== $client->id) {
            return response()->json(['message' => 'Contact does not belong to this client.'], 404);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'designation' => ['nullable', 'string', 'max:255'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);

        if (!empty($validated['is_primary'])) {
            ClientContact::where('client_id', $client->id)->where('id', '!=', $contact->id)->update(['is_primary' => false]);
        }

        $contact->update($validated);

        return response()->json(['message' => 'Contact updated.', 'data' => $contact->fresh()]);
    }

    public function destroyContact(Request $request, User $client, ClientContact $contact): JsonResponse
    {
        if (!$request->user()->hasPermissionTo('clients.edit')) {
            return $this->deny();
        }
        if ($resp = $this->assertIsClient($client)) {
            return $resp;
        }
        if ($contact->client_id !== $client->id) {
            return response()->json(['message' => 'Contact does not belong to this client.'], 404);
        }

        $contact->delete();

        return response()->json(['message' => 'Contact removed.']);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Health score, same formula the Client 360 report uses: 100 minus
     * 10/overdue invoice, 15/on-hold project, 30/cancelled project, and up to
     * 20 for the unpaid share of billing.
     *
     * @return array{score:int, components:array}
     */
    protected function healthScore(int $overdueInvoices, int $onHoldProjects, int $cancelledProjects, float $totalBilled, float $totalOutstanding): array
    {
        $outstandingPenalty = $totalBilled > 0
            ? (int) round(($totalOutstanding / $totalBilled) * 20)
            : 0;
        $score = 100
            - ($overdueInvoices * 10)
            - ($onHoldProjects * 15)
            - ($cancelledProjects * 30)
            - $outstandingPenalty;

        return [
            'score' => max(0, min(100, $score)),
            'components' => [
                'overdue_invoices' => $overdueInvoices,
                'overdue_penalty' => $overdueInvoices * 10,
                'on_hold_projects' => $onHoldProjects,
                'on_hold_penalty' => $onHoldProjects * 15,
                'cancelled_projects' => $cancelledProjects,
                'cancelled_penalty' => $cancelledProjects * 30,
                'outstanding_penalty' => $outstandingPenalty,
            ],
        ];
    }
}
