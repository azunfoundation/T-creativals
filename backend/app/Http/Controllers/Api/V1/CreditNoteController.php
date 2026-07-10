<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CreditNote;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class CreditNoteController extends Controller
{
    public function index()
    {
        Gate::authorize('viewAny', CreditNote::class);

        return response()->json(CreditNote::with('invoice')->paginate(10));
    }

    public function store(Request $request)
    {
        Gate::authorize('create', CreditNote::class);

        $validated = $request->validate([
            'invoice_id' => 'required|exists:invoices,id',
            'amount' => 'required|numeric|min:0.01',
            'reason' => 'nullable|string',
            'issue_date' => 'required|date',
        ]);

        $invoice = Invoice::findOrFail($validated['invoice_id']);

        if ($validated['amount'] > $invoice->total_amount) {
            return response()->json(['message' => 'Credit note amount cannot exceed invoice total amount.'], 422);
        }

        $validated['credit_note_number'] = 'CN-' . str_pad((string)(CreditNote::count() + 1), 6, '0', STR_PAD_LEFT);

        $creditNote = CreditNote::create($validated);

        return response()->json($creditNote, 201);
    }

    public function show(CreditNote $creditNote)
    {
        Gate::authorize('view', $creditNote);

        return response()->json($creditNote->load('invoice'));
    }
}
