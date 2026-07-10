<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Expense;
use App\Models\ExpenseAttachment;
use App\Services\PdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ExpenseController extends Controller
{
    /**
     * Active expense categories for dropdowns.
     * GET /api/v1/expense-categories
     */
    public function categories(): JsonResponse
    {
        return response()->json([
            'data' => \App\Models\ExpenseCategory::where('is_active', true)
                ->orderBy('name')
                ->get(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!Gate::allows('viewAny', Expense::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $query = Expense::query()->with(['category', 'project', 'vendor', 'submitter', 'approver', 'currency', 'attachments']);

        if (!$user->hasRole('founder') && !$user->hasRole('director') && !$user->hasPermissionTo('expenses.view_all')) {
            // Everyone else sees only their own expenses or project-related expenses where they are the PM
            $query->where(function ($q) use ($user) {
                $q->where('submitted_by', $user->id)
                  ->orWhereHas('project', function ($projQ) use ($user) {
                      $projQ->where('manager_id', $user->id);
                  });
            });
        }

        // Apply filters
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->has('category_id')) {
            $query->where('category_id', $request->input('category_id'));
        }

        if ($request->has('project_id')) {
            $query->where('project_id', $request->input('project_id'));
        }

        $expenses = $query->orderBy('expense_date', 'desc')
            ->paginate($request->integer('per_page', 15));

        return response()->json($expenses);
    }

    public function store(Request $request): JsonResponse
    {
        if (!Gate::allows('create', Expense::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'category_id' => ['required', 'exists:expense_categories,id'],
            'project_id' => ['nullable', 'exists:projects,id'],
            'vendor_id' => ['nullable', 'exists:vendors,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'expense_date' => ['required', 'date'],
            'receipt_url' => ['nullable', 'string'],
            'payment_method' => ['nullable', 'string', 'in:bank_transfer,card,upi,cash,cheque'],
            'is_billable' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string'],
            'attachments' => ['nullable', 'array'],
            'attachments.*.title' => ['required', 'string', 'max:255'],
            'attachments.*.url' => ['required', 'string'],
            'attachments.*.type' => ['nullable', 'string', 'max:50'],
        ]);

        // Status always starts at 'draft' — status changes only happen through
        // the dedicated submit/approve/reject/reimburse endpoints below, never
        // as a free-form field on create/update.
        $expense = DB::transaction(function () use ($validated, $request) {
            $data = $validated;
            unset($data['attachments']);

            $data['submitted_by'] = $request->user()->id;
            $data['status'] = 'draft';
            $data['is_billable'] = $validated['is_billable'] ?? false;

            $expense = Expense::create($data);

            if (!empty($validated['attachments'])) {
                foreach ($validated['attachments'] as $att) {
                    $expense->attachments()->create($att);
                }
            }

            return $expense;
        });

        return response()->json($expense->load(['category', 'project', 'vendor', 'attachments']), 201);
    }

    public function show(Expense $expense): JsonResponse
    {
        if (!Gate::allows('view', $expense)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        return response()->json($expense->load(['category', 'project', 'vendor', 'submitter', 'approver', 'currency', 'attachments']));
    }

    public function update(Request $request, Expense $expense): JsonResponse
    {
        if (!Gate::allows('update', $expense)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'category_id' => ['required', 'exists:expense_categories,id'],
            'project_id' => ['nullable', 'exists:projects,id'],
            'vendor_id' => ['nullable', 'exists:vendors,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'expense_date' => ['required', 'date'],
            'receipt_url' => ['nullable', 'string'],
            'payment_method' => ['nullable', 'string', 'in:bank_transfer,card,upi,cash,cheque'],
            'is_billable' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string'],
            'attachments' => ['nullable', 'array'],
            'attachments.*.title' => ['required', 'string', 'max:255'],
            'attachments.*.url' => ['required', 'string'],
            'attachments.*.type' => ['nullable', 'string', 'max:50'],
        ]);

        // Status is deliberately not accepted here — it only changes via the
        // submit/approve/reject/reimburse endpoints below.
        $expense = DB::transaction(function () use ($expense, $validated) {
            $data = $validated;
            unset($data['attachments']);

            $expense->update($data);

            if (isset($validated['attachments'])) {
                $expense->attachments()->delete();
                foreach ($validated['attachments'] as $att) {
                    $expense->attachments()->create($att);
                }
            }

            return $expense;
        });

        return response()->json($expense->load(['category', 'project', 'vendor', 'attachments']));
    }

    public function destroy(Expense $expense): JsonResponse
    {
        if (!Gate::allows('delete', $expense)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $expense->delete();

        return response()->json(['message' => 'Expense deleted successfully.']);
    }

    public function approve(Request $request, Expense $expense): JsonResponse
    {
        if (!Gate::allows('approve', $expense)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($expense->status !== 'submitted') {
            return response()->json([
                'message' => 'Only submitted expenses can be approved.',
            ], 422);
        }

        $expense->update([
            'status'      => 'approved',
            'approved_by' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Expense approved successfully.',
            'expense' => $expense->load(['category', 'project', 'vendor', 'approver'])
        ]);
    }

    public function reject(Request $request, Expense $expense): JsonResponse
    {
        if (!Gate::allows('approve', $expense)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($expense->status !== 'submitted') {
            return response()->json([
                'message' => 'Only submitted expenses can be rejected.',
            ], 422);
        }

        $validated = $request->validate([
            'rejection_reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $expense->update([
            'status'           => 'rejected',
            'approved_by'      => $request->user()->id,
            'rejection_reason' => $validated['rejection_reason'] ?? null,
        ]);

        return response()->json([
            'message' => 'Expense rejected.',
            'expense' => $expense->load(['category', 'project', 'vendor', 'approver'])
        ]);
    }

    /**
     * Submit a draft (or rejected) expense for approval.
     * POST /api/v1/expenses/{expense}/submit
     */
    public function submit(Request $request, Expense $expense): JsonResponse
    {
        if (!Gate::allows('update', $expense)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if (!in_array($expense->status, ['draft', 'rejected'], true)) {
            return response()->json([
                'message' => 'Only draft or rejected expenses can be submitted for approval.',
            ], 422);
        }

        $expense->update([
            'status'           => 'submitted',
            'approved_by'      => null,
            'rejection_reason' => null,
        ]);

        return response()->json([
            'message' => 'Expense submitted for approval.',
            'expense' => $expense->load(['category', 'project', 'vendor', 'submitter', 'approver', 'currency', 'attachments']),
        ]);
    }

    /**
     * Mark an approved expense as reimbursed.
     * POST /api/v1/expenses/{expense}/reimburse
     */
    public function reimburse(Request $request, Expense $expense): JsonResponse
    {
        if (!Gate::allows('approve', $expense)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($expense->status !== 'approved') {
            return response()->json([
                'message' => 'Only approved expenses can be marked as reimbursed.',
            ], 422);
        }

        $expense->update(['status' => 'reimbursed']);

        return response()->json([
            'message' => 'Expense marked as reimbursed.',
            'expense' => $expense->load(['category', 'project', 'vendor', 'submitter', 'approver', 'currency', 'attachments']),
        ]);
    }

    /**
     * Audit timeline for a single expense (created / updated / status changes).
     * GET /api/v1/expenses/{expense}/timeline
     */
    public function timeline(Expense $expense): JsonResponse
    {
        if (!Gate::allows('view', $expense)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $logs = AuditLog::query()
            ->where('auditable_type', Expense::class)
            ->where('auditable_id', $expense->id)
            ->with('user:id,name,email')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $logs]);
    }

    /**
     * Download an expense voucher as PDF.
     * GET /api/v1/expenses/{expense}/download-pdf
     */
    public function downloadPdf(Expense $expense, PdfService $pdfService)
    {
        if (!Gate::allows('view', $expense)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $pdf = $pdfService->generateExpensePdf($expense);

        return $pdf->download("expense-{$expense->expense_number}.pdf");
    }
}

