<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\LeadResource;
use App\Mail\WelcomeUserMail;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadFollowup;
use App\Models\Quote;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LeadController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Lead::class);

        $user = $request->user();
        $query = Lead::query();

        // Respect Policy view boundaries (limit results to own leads for sales exec)
        if (!$user->isFounder() && !$user->hasPermissionTo('leads.view_all')) {
            $query->where(function ($q) use ($user) {
                $q->where('sales_exec_id', $user->id)
                  ->orWhere('sales_head_id', $user->id);
            });
        }

        // Filters
        if ($request->filled('stage_id')) {
            $query->where('stage_id', $request->integer('stage_id'));
        }

        if ($request->filled('sales_exec_id')) {
            $query->where('sales_exec_id', $request->integer('sales_exec_id'));
        }

        if ($request->filled('sales_head_id')) {
            $query->where('sales_head_id', $request->integer('sales_head_id'));
        }

        if ($request->filled('source_id')) {
            $query->where('lead_source_id', $request->integer('source_id'));
        }

        if ($request->filled('priority')) {
            $query->where('priority', $request->string('priority')->toString());
        }

        if ($request->filled('temperature')) {
            $query->where('temperature', $request->string('temperature')->toString());
        }

        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->where(function ($q) use ($search) {
                $q->where('company_name', 'like', "%{$search}%")
                  ->orWhere('lead_number', 'like', "%{$search}%")
                  ->orWhereHas('contacts', function ($qc) use ($search) {
                      $qc->where('name', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%");
                  });
            });
        }

        $perPage = $request->integer('per_page', 15);
        $leads = $query->with(['stage', 'source', 'salesExec', 'salesHead', 'contacts', 'activities.user', 'followups', 'services'])
            ->latest()
            ->paginate($perPage);

        return LeadResource::collection($leads);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Lead::class);

        // Normalize frontend field aliases → backend DB column names
        $this->normalizeLeadPayload($request);

        $validated = $request->validate([
            'company_name'             => ['required', 'string', 'max:255'],
            'website_url'              => ['nullable', 'string', 'max:255'],
            'whatsapp_number'          => ['nullable', 'string', 'max:50'],
            'city'                     => ['nullable', 'string', 'max:100'],
            'country'                  => ['nullable', 'string', 'max:100'],
            'timezone'                 => ['nullable', 'string', 'max:50'],
            'lead_source_id'           => ['nullable', 'integer', 'exists:lead_sources,id'],
            'stage_id'                 => ['nullable', 'integer', 'exists:lead_stages,id'],
            'sales_exec_id'            => ['nullable', 'integer', 'exists:users,id'],
            'sales_head_id'            => ['nullable', 'integer', 'exists:users,id'],
            'priority'                 => ['required', 'string', 'in:low,medium,high,urgent'],
            'temperature'              => ['required', 'string', 'in:warm,hot,cold'],
            'estimated_monthly_budget' => ['nullable', 'numeric', 'min:0'],
            'expected_start_date'      => ['nullable', 'date'],
            'notes'                    => ['nullable', 'string'],
            'contacts'                 => ['nullable', 'array'],
            'contacts.*.name'         => ['required_with:contacts', 'string', 'max:255'],
            'contacts.*.designation'  => ['nullable', 'string', 'max:255'],
            'contacts.*.email'        => ['nullable', 'email', 'max:255'],
            'contacts.*.phone'        => ['nullable', 'string', 'max:50'],
            'contacts.*.whatsapp'     => ['nullable', 'string', 'max:50'],
            'contacts.*.notes'        => ['nullable', 'string'],
            'contacts.*.is_primary'   => ['nullable', 'boolean'],
            'interested_service_ids'  => ['nullable', 'array'],
            'interested_service_ids.*' => ['integer', 'exists:services,id'],
        ]);

        $lead = DB::transaction(function () use ($validated) {
            /** @var Lead $lead */
            $lead = Lead::create($validated);

            // Save contacts — first entry is always primary if is_primary not set
            if (!empty($validated['contacts'])) {
                foreach ($validated['contacts'] as $index => $contactData) {
                    $isPrimary = isset($contactData['is_primary'])
                        ? (bool) $contactData['is_primary']
                        : $index === 0;
                    $lead->contacts()->create(array_merge($contactData, [
                        'is_primary' => $isPrimary,
                    ]));
                }
            }

            // Attach interested services in lead_services
            if (!empty($validated['interested_service_ids'])) {
                $lead->services()->sync($validated['interested_service_ids']);
            }

            return $lead;
        });

        $lead->load(['stage', 'source', 'salesExec', 'salesHead', 'contacts', 'activities.user', 'followups', 'services']);

        return (new LeadResource($lead))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Lead $lead): LeadResource
    {
        $this->authorize('view', $lead);

        $lead->load(['stage', 'source', 'salesExec', 'salesHead', 'contacts', 'activities.user', 'followups', 'services']);

        return new LeadResource($lead);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Lead $lead): LeadResource
    {
        $this->authorize('update', $lead);

        // Normalize frontend field aliases → backend DB column names
        $this->normalizeLeadPayload($request);

        $validated = $request->validate([
            'company_name'             => ['sometimes', 'required', 'string', 'max:255'],
            'website_url'              => ['nullable', 'string', 'max:255'],
            'whatsapp_number'          => ['nullable', 'string', 'max:50'],
            'city'                     => ['nullable', 'string', 'max:100'],
            'country'                  => ['nullable', 'string', 'max:100'],
            'timezone'                 => ['nullable', 'string', 'max:50'],
            'lead_source_id'           => ['nullable', 'integer', 'exists:lead_sources,id'],
            'stage_id'                 => ['nullable', 'integer', 'exists:lead_stages,id'],
            'sales_exec_id'            => ['nullable', 'integer', 'exists:users,id'],
            'sales_head_id'            => ['nullable', 'integer', 'exists:users,id'],
            'priority'                 => ['sometimes', 'required', 'string', 'in:low,medium,high,urgent'],
            'temperature'              => ['sometimes', 'required', 'string', 'in:warm,hot,cold'],
            'estimated_monthly_budget' => ['nullable', 'numeric', 'min:0'],
            'expected_start_date'      => ['nullable', 'date'],
            'notes'                    => ['nullable', 'string'],
            'contacts'                 => ['nullable', 'array'],
            'contacts.*.name'         => ['required_with:contacts', 'string', 'max:255'],
            'contacts.*.designation'  => ['nullable', 'string', 'max:255'],
            'contacts.*.email'        => ['nullable', 'email', 'max:255'],
            'contacts.*.phone'        => ['nullable', 'string', 'max:50'],
            'contacts.*.whatsapp'     => ['nullable', 'string', 'max:50'],
            'contacts.*.notes'        => ['nullable', 'string'],
            'contacts.*.is_primary'   => ['nullable', 'boolean'],
            'interested_service_ids'  => ['nullable', 'array'],
            'interested_service_ids.*' => ['integer', 'exists:services,id'],
        ]);

        DB::transaction(function () use ($lead, $validated) {
            $lead->update($validated);

            // Sync contacts
            if (isset($validated['contacts'])) {
                $lead->contacts()->delete();
                foreach ($validated['contacts'] as $index => $contactData) {
                    $isPrimary = isset($contactData['is_primary'])
                        ? (bool) $contactData['is_primary']
                        : $index === 0;
                    $lead->contacts()->create(array_merge($contactData, [
                        'is_primary' => $isPrimary,
                    ]));
                }
            }

            // Sync interested services
            if (isset($validated['interested_service_ids'])) {
                $lead->services()->sync($validated['interested_service_ids']);
            }
        });

        $lead->load(['stage', 'source', 'salesExec', 'salesHead', 'contacts', 'activities.user', 'followups', 'services']);

        return new LeadResource($lead);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Lead $lead): JsonResponse
    {
        $this->authorize('delete', $lead);

        $lead->delete();

        return response()->json([
            'message' => 'Lead successfully deleted.',
        ]);
    }

    /**
     * Update the lead's stage.
     */
    public function updateStage(Request $request, Lead $lead): LeadResource
    {
        $this->authorize('update', $lead);

        $validated = $request->validate([
            'stage_id' => ['required', 'integer', 'exists:lead_stages,id'],
        ]);

        $lead->update([
            'stage_id' => $validated['stage_id'],
        ]);

        $lead->load(['stage', 'source', 'salesExec', 'salesHead', 'contacts', 'activities.user', 'followups', 'services']);

        return new LeadResource($lead);
    }

    /**
     * Convert the lead.
     */
    public function convert(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);

        if ($lead->is_converted) {
            return response()->json([
                'message' => 'This lead has already been converted to a quote.',
            ], 422);
        }

        $validated = $request->validate([
            'quote_title' => ['required', 'string', 'max:255'],
            'valid_until' => ['required', 'date', 'after_or_equal:today'],
            'client_id'   => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $quote = DB::transaction(function () use ($lead, $validated) {
            $client = $this->resolveClientForConversion($lead, $validated['client_id'] ?? null);

            // Find default currency or first currency, fallback to 1
            $currencyId = \App\Models\Currency::where('is_default', true)->first()->id
                ?? \App\Models\Currency::first()->id
                ?? 1;

            $budget = $lead->estimated_monthly_budget ?? 0.00;

            // Build itemized lines from the services the lead expressed interest in.
            $services = $lead->services()->get();
            $subtotal = 0.00;
            $taxAmount = 0.00;
            $items = [];

            foreach ($services as $service) {
                $price = (float) ($service->default_price ?? 0);
                $taxRate = $service->is_taxable ? (float) ($service->tax_rate ?? 0) : 0.0;
                $itemTax = $price * ($taxRate / 100);

                $subtotal += $price;
                $taxAmount += $itemTax;

                $items[] = [
                    'service_id' => $service->id,
                    'description' => $service->name,
                    'quantity' => 1,
                    'unit' => $service->unit,
                    'unit_price' => $price,
                    'tax_rate' => $taxRate,
                    'tax_amount' => $itemTax,
                    'total_amount' => $price + $itemTax,
                ];
            }

            // No services selected on the lead — fall back to the flat estimated budget.
            if (empty($items)) {
                $subtotal = $budget;
            }

            $quote = Quote::create([
                'lead_id' => $lead->id,
                'client_id' => $client->id,
                'title' => $validated['quote_title'],
                'valid_until' => $validated['valid_until'],
                'status' => 'draft',
                'created_by' => auth()->id() ?? $lead->sales_exec_id ?? $lead->sales_head_id ?? \App\Models\User::first()->id ?? 1,
                'currency_id' => $currencyId,
                'exchange_rate' => 1.0000,
                'subtotal' => $subtotal,
                'tax_amount' => $taxAmount,
                'total_amount' => $subtotal + $taxAmount,
            ]);

            foreach ($items as $item) {
                $quote->items()->create($item);
            }

            // Update lead status
            $lead->update([
                'is_converted' => true,
                'converted_client_id' => $client->id,
                'converted_at' => now(),
            ]);

            // Create lead activity
            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => auth()->id(),
                'type' => 'lead_converted',
                'description' => "Lead converted to Quote {$quote->quote_number}: {$quote->title} (client: {$client->name}).",
                'metadata' => [
                    'quote_id' => $quote->id,
                    'quote_number' => $quote->quote_number,
                    'client_id' => $client->id,
                ],
                'occurred_at' => now(),
            ]);

            return $quote;
        });

        return response()->json([
            'message' => 'Lead successfully converted to Quote.',
            'quote_id' => $quote->id,
            'quote_number' => $quote->quote_number,
            'client_id' => $quote->client_id,
        ], 201);
    }

    /**
     * Resolve (or create) the client User this lead should convert to.
     *
     * If $clientId is given, that existing user is linked (and given the
     * `client` role if it doesn't have it yet). Otherwise a client account is
     * found-or-created from the lead's primary contact email, using the same
     * restore-if-trashed dedupe pattern as UserController::store so this can
     * never collide with the soft-delete-spanning unique index on users.email.
     */
    private function resolveClientForConversion(Lead $lead, ?int $clientId): User
    {
        if ($clientId) {
            $client = User::findOrFail($clientId);

            if (! $client->hasRole('client')) {
                $client->assignRole('client');
            }

            return $client;
        }

        $primaryContact = $lead->contacts()->where('is_primary', true)->first()
            ?? $lead->contacts()->first();

        if (! $primaryContact || empty($primaryContact->email)) {
            throw ValidationException::withMessages([
                'client_id' => ['Add a primary contact with an email address, or select an existing client, before converting this lead.'],
            ]);
        }

        $existing = User::withTrashed()->where('email', $primaryContact->email)->first();

        if ($existing && ! $existing->trashed()) {
            if (! $existing->hasRole('client')) {
                $existing->assignRole('client');
            }

            return $existing;
        }

        $plainPassword = Str::password(12);
        $attributes = [
            'name' => $primaryContact->name ?: $lead->company_name,
            'email' => $primaryContact->email,
            'phone' => $primaryContact->phone,
            'password' => Hash::make($plainPassword),
            'status' => 'active',
            'is_client_portal_user' => false,
        ];

        if ($existing && $existing->trashed()) {
            $existing->restore();
            $existing->update($attributes + ['must_change_password' => true]);
            $client = $existing;
        } else {
            $client = User::create($attributes);
        }

        $client->assignRole('client');

        try {
            Mail::to($client->email)->queue(new WelcomeUserMail($client, $plainPassword));
        } catch (\Throwable $e) {
            Log::error('Failed to queue welcome email for new client ' . $client->email . ': ' . $e->getMessage());
        }

        return $client;
    }

    /**
     * Log custom timeline activity for a lead.
     */
    public function logActivity(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);

        $validated = $request->validate([
            'type'        => ['required', 'string', 'max:50'],
            'description' => ['required', 'string'],
            'due_at'      => ['nullable', 'date', 'after_or_equal:today'],
        ]);

        $currentUserId = auth()->id();

        $activity = DB::transaction(function () use ($lead, $validated, $currentUserId) {
            // Create LeadActivity
            $activity = LeadActivity::create([
                'lead_id'     => $lead->id,
                'user_id'     => $currentUserId,
                'type'        => $validated['type'],
                'description' => $validated['description'],
                'occurred_at' => now(),
            ]);

            // If due_at is set, create a follow-up record
            if (!empty($validated['due_at'])) {
                LeadFollowup::create([
                    'lead_id'      => $lead->id,
                    'assigned_to'  => $lead->sales_exec_id ?: $currentUserId,
                    'created_by'   => $currentUserId,
                    'description'  => 'Follow-up scheduled: ' . $validated['description'],
                    'type'         => $validated['type'],
                    'scheduled_at' => $validated['due_at'],
                    'is_completed' => false,
                ]);
            }

            return $activity;
        });

        $activity->load('user');

        return response()->json([
            'message'     => 'Activity logged successfully.',
            'activity_id' => $activity->id,
            'activity'    => [
                'id'          => $activity->id,
                'type'        => $activity->type,
                'description' => $activity->description,
                'occurred_at' => $activity->occurred_at?->toDateTimeString(),
                'user'        => $activity->user ? ['id' => $activity->user->id, 'name' => $activity->user->name] : null,
            ],
        ], 201);
    }

    /**
     * Mark a scheduled follow-up as completed.
     */
    public function completeFollowup(Request $request, Lead $lead, LeadFollowup $followup): JsonResponse
    {
        $this->authorize('update', $lead);

        if ($followup->lead_id !== $lead->id) {
            abort(404);
        }

        $validated = $request->validate([
            'completion_notes' => ['nullable', 'string'],
        ]);

        $followup->update([
            'is_completed' => true,
            'completed_at' => now(),
            'completion_notes' => $validated['completion_notes'] ?? $followup->completion_notes,
        ]);

        LeadActivity::create([
            'lead_id' => $lead->id,
            'user_id' => auth()->id(),
            'type' => 'system_event',
            'description' => "Follow-up completed: {$followup->description}",
            'occurred_at' => now(),
        ]);

        return response()->json([
            'message' => 'Follow-up marked as completed.',
        ]);
    }

    /**
     * Normalize frontend field name aliases to backend DB column names.
     * This allows the frontend to send either format without breaking.
     */
    private function normalizeLeadPayload(Request $request): void
    {
        $data = $request->all();
        $changed = false;

        // source_id → lead_source_id
        if (isset($data['source_id']) && !isset($data['lead_source_id'])) {
            $data['lead_source_id'] = $data['source_id'];
            $changed = true;
        }

        // budget → estimated_monthly_budget
        if (isset($data['budget']) && !isset($data['estimated_monthly_budget'])) {
            $data['estimated_monthly_budget'] = $data['budget'];
            $changed = true;
        }

        // primary_contact + secondary_contacts → contacts[]
        if (isset($data['primary_contact']) && !isset($data['contacts'])) {
            $contacts = [];
            $primary = $data['primary_contact'];
            $primary['is_primary'] = true;
            $contacts[] = $primary;

            if (!empty($data['secondary_contacts']) && is_array($data['secondary_contacts'])) {
                foreach ($data['secondary_contacts'] as $sc) {
                    $sc['is_primary'] = false;
                    $contacts[] = $sc;
                }
            }

            $data['contacts'] = $contacts;
            $changed = true;
        }

        if ($changed) {
            $request->replace($data);
        }
    }
}
