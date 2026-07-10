<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\InvoiceResource;
use App\Http\Resources\PaymentResource;
use App\Models\Invoice;
use App\Models\Quote;
use App\Models\DiscountCoupon;
use App\Models\Payment;
use App\Models\InvoiceApproval;
use App\Models\Project;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use App\Mail\InvoiceMail;
use App\Services\PdfService;
class InvoiceController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse|AnonymousResourceCollection
    {
        $user = $request->user();
        
        if (!Gate::allows('viewAny', Invoice::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if (!$user->isFounder() && !$user->hasPermissionTo('invoices.view_all')) {
            if ($user->hasRole('client') || $user->is_client_portal_user) {
                // Client sees only their own invoices
                $query = Invoice::where('client_id', $user->id);
            } elseif ($user->hasPermissionTo('invoices.view')) {
                // User sees only invoices created by themselves
                $query = Invoice::where('created_by', $user->id);
            } else {
                return response()->json(['message' => 'This action is unauthorized.'], 403);
            }
        } else {
            $query = Invoice::query();
        }

        // Apply filters
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->has('client_id')) {
            $query->where('client_id', $request->input('client_id'));
        }

        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('invoice_number', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $invoices = $query->with(['quote', 'client', 'creator', 'currency', 'coupon', 'items.service', 'payments'])
            ->orderBy('created_at', 'desc')
            ->paginate($request->integer('per_page', 15));

        return InvoiceResource::collection($invoices);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse|InvoiceResource
    {
        if (!Gate::allows('create', Invoice::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'quote_id' => ['nullable', 'exists:quotes,id'],
            'client_id' => ['nullable', 'integer'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'base_currency' => ['nullable', 'string', 'max:10'],
            'exchange_rate' => ['nullable', 'numeric', 'min:0.0001'],
            'coupon_code' => ['nullable', 'string', 'exists:discount_coupons,code'],
            'coupon_id' => ['nullable', 'exists:discount_coupons,id'],
            'issue_date' => ['required', 'date'],
            'due_date' => ['required', 'date', 'after_or_equal:issue_date'],
            'terms_conditions' => ['nullable', 'string'],
            'internal_notes' => ['nullable', 'string'],
            'client_notes' => ['nullable', 'string'],
            'status' => ['nullable', 'string', 'in:draft,pending_review,pending_approval,approved,sent,paid,partially_paid,overdue,void,cancelled'],
            'is_recurring' => ['nullable', 'boolean'],
            'recurring_interval' => ['nullable', 'string', 'in:daily,weekly,monthly,yearly'],
            'recurring_end_date' => ['nullable', 'date'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['nullable', 'exists:services,id'],
            'items.*.description' => ['required', 'string'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01'],
            'items.*.unit' => ['nullable', 'string', 'max:50'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.tax_type' => ['nullable', 'string', 'in:gst,vat,sales_tax,none,custom'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.sort_order' => ['nullable', 'integer'],
        ]);

        if (!empty($validated['quote_id'])) {
            $quote = Quote::find($validated['quote_id']);

            if (!$quote || !in_array($quote->status, ['approved', 'sent'], true)) {
                return response()->json([
                    'message' => 'Only approved or sent quotes can be converted to an invoice.',
                    'errors' => ['quote_id' => ['Only approved or sent quotes can be converted to an invoice.']],
                ], 422);
            }

            if (Invoice::where('quote_id', $validated['quote_id'])->exists()) {
                return response()->json([
                    'message' => 'This quote has already been converted to an invoice.',
                    'errors' => ['quote_id' => ['This quote has already been converted to an invoice.']],
                ], 422);
            }
        }

        $invoice = DB::transaction(function () use ($validated, $request) {
            // Recompute totals
            $subtotal = 0.00;
            $itemsDiscount = 0.00;
            $itemsTax = 0.00;
            $calculatedItems = [];

            foreach ($validated['items'] as $item) {
                $qty = (float) ($item['quantity'] ?? 1);
                $price = (float) ($item['unit_price'] ?? 0);
                $discPercent = (float) ($item['discount_percent'] ?? 0);
                $taxType = $item['tax_type'] ?? ( (isset($item['tax_rate']) && (float)$item['tax_rate'] > 0) ? 'custom' : 'none' );
                $taxRate = $taxType === 'none' ? 0.00 : (float) ($item['tax_rate'] ?? 0);

                $itemSubtotal = $qty * $price;
                $itemDiscount = $itemSubtotal * ($discPercent / 100);
                $itemTaxable = $itemSubtotal - $itemDiscount;
                $itemTax = $itemTaxable * ($taxRate / 100);
                $itemTotal = $itemTaxable + $itemTax;

                $subtotal += $itemSubtotal;
                $itemsDiscount += $itemDiscount;
                $itemsTax += $itemTax;

                $calculatedItems[] = [
                    'service_id' => $item['service_id'] ?? null,
                    'description' => $item['description'],
                    'quantity' => $qty,
                    'unit' => $item['unit'] ?? null,
                    'unit_price' => $price,
                    'tax_type' => $taxType,
                    'discount_percent' => $discPercent,
                    'discount_amount' => $itemDiscount,
                    'tax_rate' => $taxRate,
                    'tax_amount' => $itemTax,
                    'total_amount' => $itemTotal,
                    'sort_order' => $item['sort_order'] ?? 0,
                ];
            }

            // Coupon validation
            $couponId = null;
            $couponDiscount = 0.00;

            $code = $validated['coupon_code'] ?? null;
            $cId = $validated['coupon_id'] ?? null;

            $coupon = null;
            if ($code) {
                $coupon = DiscountCoupon::where('code', $code)->first();
            } elseif ($cId) {
                $coupon = DiscountCoupon::find($cId);
            }

            if ($coupon && $coupon->isValidForAmount($subtotal - $itemsDiscount)) {
                $couponId = $coupon->id;
                if ($coupon->type === 'percentage') {
                    $couponDiscount = ($subtotal - $itemsDiscount) * ((float) $coupon->value / 100);
                    if ($coupon->maximum_discount !== null && $couponDiscount > (float) $coupon->maximum_discount) {
                        $couponDiscount = (float) $coupon->maximum_discount;
                    }
                } else {
                    $couponDiscount = (float) $coupon->value;
                    if ($couponDiscount > ($subtotal - $itemsDiscount)) {
                        $couponDiscount = $subtotal - $itemsDiscount;
                    }
                }
                $coupon->increment('used_count');
            }

            $discountAmount = $itemsDiscount + $couponDiscount;
            $taxAmount = $itemsTax;
            $totalAmount = $subtotal - $discountAmount + $taxAmount;

            $invoice = Invoice::create([
                'quote_id' => $validated['quote_id'] ?? null,
                'client_id' => $validated['client_id'] ?? null,
                'created_by' => $request->user()->id,
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'currency_id' => $validated['currency_id'],
                'base_currency' => $validated['base_currency'] ?? 'INR',
                'exchange_rate' => $validated['exchange_rate'] ?? 1.0000,
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'tax_amount' => $taxAmount,
                'total_amount' => $totalAmount,
                'coupon_id' => $couponId,
                'coupon_discount' => $couponDiscount,
                'status' => $validated['status'] ?? 'draft',
                'issue_date' => $validated['issue_date'],
                'due_date' => $validated['due_date'],
                'terms_conditions' => $validated['terms_conditions'] ?? null,
                'internal_notes' => $validated['internal_notes'] ?? null,
                'client_notes' => $validated['client_notes'] ?? null,
                'paid_amount' => 0.00,
                'due_amount' => $totalAmount,
                'is_recurring' => $validated['is_recurring'] ?? false,
                'recurring_interval' => $validated['recurring_interval'] ?? null,
                'recurring_end_date' => $validated['recurring_end_date'] ?? null,
            ]);

            foreach ($calculatedItems as $cItem) {
                $invoice->items()->create($cItem);
            }

            // Update quote status to converted if linked
            if ($invoice->quote_id) {
                Quote::where('id', $invoice->quote_id)->update(['status' => 'converted']);
            }

            return $invoice;
        });

        return (new InvoiceResource($invoice->load(['quote', 'client', 'creator', 'currency', 'coupon', 'items.service'])))
            ->additional(['message' => 'Invoice created successfully.']);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, Invoice $invoice): JsonResponse|InvoiceResource
    {
        if (!Gate::allows('view', $invoice)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        return new InvoiceResource($invoice->load(['quote', 'client', 'creator', 'currency', 'coupon', 'items.service', 'payments']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Invoice $invoice): JsonResponse|InvoiceResource
    {
        if (!Gate::allows('update', $invoice)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'quote_id' => ['nullable', 'exists:quotes,id'],
            'client_id' => ['nullable', 'integer'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'base_currency' => ['nullable', 'string', 'max:10'],
            'exchange_rate' => ['nullable', 'numeric', 'min:0.0001'],
            'coupon_code' => ['nullable', 'string', 'exists:discount_coupons,code'],
            'coupon_id' => ['nullable', 'exists:discount_coupons,id'],
            'issue_date' => ['required', 'date'],
            'due_date' => ['required', 'date', 'after_or_equal:issue_date'],
            'terms_conditions' => ['nullable', 'string'],
            'internal_notes' => ['nullable', 'string'],
            'client_notes' => ['nullable', 'string'],
            'status' => ['nullable', 'string', 'in:draft,pending_review,pending_approval,approved,sent,paid,partially_paid,overdue,void,cancelled'],
            'is_recurring' => ['nullable', 'boolean'],
            'recurring_interval' => ['nullable', 'string', 'in:daily,weekly,monthly,yearly'],
            'recurring_end_date' => ['nullable', 'date'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['nullable', 'exists:services,id'],
            'items.*.description' => ['required', 'string'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01'],
            'items.*.unit' => ['nullable', 'string', 'max:50'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.tax_type' => ['nullable', 'string', 'in:gst,vat,sales_tax,none,custom'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.sort_order' => ['nullable', 'integer'],
        ]);

        $invoice = DB::transaction(function () use ($invoice, $validated) {
            // Recompute totals
            $subtotal = 0.00;
            $itemsDiscount = 0.00;
            $itemsTax = 0.00;
            $calculatedItems = [];

            foreach ($validated['items'] as $item) {
                $qty = (float) ($item['quantity'] ?? 1);
                $price = (float) ($item['unit_price'] ?? 0);
                $discPercent = (float) ($item['discount_percent'] ?? 0);
                $taxType = $item['tax_type'] ?? ( (isset($item['tax_rate']) && (float)$item['tax_rate'] > 0) ? 'custom' : 'none' );
                $taxRate = $taxType === 'none' ? 0.00 : (float) ($item['tax_rate'] ?? 0);

                $itemSubtotal = $qty * $price;
                $itemDiscount = $itemSubtotal * ($discPercent / 100);
                $itemTaxable = $itemSubtotal - $itemDiscount;
                $itemTax = $itemTaxable * ($taxRate / 100);
                $itemTotal = $itemTaxable + $itemTax;

                $subtotal += $itemSubtotal;
                $itemsDiscount += $itemDiscount;
                $itemsTax += $itemTax;

                $calculatedItems[] = [
                    'service_id' => $item['service_id'] ?? null,
                    'description' => $item['description'],
                    'quantity' => $qty,
                    'unit' => $item['unit'] ?? null,
                    'unit_price' => $price,
                    'tax_type' => $taxType,
                    'discount_percent' => $discPercent,
                    'discount_amount' => $itemDiscount,
                    'tax_rate' => $taxRate,
                    'tax_amount' => $itemTax,
                    'total_amount' => $itemTotal,
                    'sort_order' => $item['sort_order'] ?? 0,
                ];
            }

            // Coupon validation
            $couponId = null;
            $couponDiscount = 0.00;

            $code = $validated['coupon_code'] ?? null;
            $cId = $validated['coupon_id'] ?? null;

            $coupon = null;
            if ($code) {
                $coupon = DiscountCoupon::where('code', $code)->first();
            } elseif ($cId) {
                $coupon = DiscountCoupon::find($cId);
            }

            if ($coupon && $coupon->isValidForAmount($subtotal - $itemsDiscount)) {
                $couponId = $coupon->id;
                if ($coupon->type === 'percentage') {
                    $couponDiscount = ($subtotal - $itemsDiscount) * ((float) $coupon->value / 100);
                    if ($coupon->maximum_discount !== null && $couponDiscount > (float) $coupon->maximum_discount) {
                        $couponDiscount = (float) $coupon->maximum_discount;
                    }
                } else {
                    $couponDiscount = (float) $coupon->value;
                    if ($couponDiscount > ($subtotal - $itemsDiscount)) {
                        $couponDiscount = $subtotal - $itemsDiscount;
                    }
                }

                // If coupon changed, manage counts
                if ($invoice->coupon_id !== $couponId) {
                    if ($invoice->coupon) {
                        $invoice->coupon->decrement('used_count');
                    }
                    $coupon->increment('used_count');
                }
            } else {
                if ($invoice->coupon) {
                    $invoice->coupon->decrement('used_count');
                }
            }

            $discountAmount = $itemsDiscount + $couponDiscount;
            $taxAmount = $itemsTax;
            $totalAmount = $subtotal - $discountAmount + $taxAmount;

            $paidAmount = (float) $invoice->payments()->sum('amount');
            $dueAmount = $totalAmount - $paidAmount;
            if ($dueAmount < 0.005) {
                $dueAmount = 0.00;
            }

            $status = $validated['status'] ?? $invoice->status;

            $invoice->update([
                'quote_id' => $validated['quote_id'] ?? null,
                'client_id' => $validated['client_id'] ?? null,
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'currency_id' => $validated['currency_id'],
                'base_currency' => $validated['base_currency'] ?? $invoice->base_currency ?? 'INR',
                'exchange_rate' => $validated['exchange_rate'] ?? 1.0000,
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'tax_amount' => $taxAmount,
                'total_amount' => $totalAmount,
                'coupon_id' => $couponId,
                'coupon_discount' => $couponDiscount,
                'status' => $status,
                'issue_date' => $validated['issue_date'],
                'due_date' => $validated['due_date'],
                'terms_conditions' => $validated['terms_conditions'] ?? null,
                'internal_notes' => $validated['internal_notes'] ?? null,
                'client_notes' => $validated['client_notes'] ?? null,
                'paid_amount' => $paidAmount,
                'due_amount' => $dueAmount,
                'is_recurring' => $validated['is_recurring'] ?? $invoice->is_recurring,
                'recurring_interval' => $validated['recurring_interval'] ?? $invoice->recurring_interval,
                'recurring_end_date' => $validated['recurring_end_date'] ?? $invoice->recurring_end_date,
            ]);

            // Recreate items
            $invoice->items()->delete();
            foreach ($calculatedItems as $cItem) {
                $invoice->items()->create($cItem);
            }

            // Sync quote status
            if ($invoice->quote_id) {
                Quote::where('id', $invoice->quote_id)->update(['status' => 'converted']);
            }

            // Recalculate invoice fully (which adjusts status if necessary)
            $invoice->recalculateTotals();

            return $invoice;
        });

        return (new InvoiceResource($invoice->load(['quote', 'client', 'creator', 'currency', 'coupon', 'items.service'])))
            ->additional(['message' => 'Invoice updated successfully.']);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, Invoice $invoice): JsonResponse
    {
        if (!Gate::allows('delete', $invoice)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($invoice->coupon) {
            $invoice->coupon->decrement('used_count');
        }

        $invoice->delete();

        return response()->json([
            'message' => 'Invoice deleted successfully.',
        ]);
    }

    /**
     * Record a payment against the invoice.
     */
    public function recordPayment(Request $request, Invoice $invoice): JsonResponse
    {
        if (!Gate::allows('recordPayment', $invoice)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_date' => ['required', 'date'],
            'payment_method' => ['required', 'string', 'max:100'],
            'transaction_reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ]);

        if ((float) $validated['amount'] > (float) $invoice->due_amount + 0.01) {
            return response()->json([
                'message' => 'Payment amount exceeds the outstanding balance.',
                'errors' => ['amount' => ['Payment amount exceeds the outstanding balance.']],
            ], 422);
        }

        $payment = DB::transaction(function () use ($invoice, $validated, $request) {
            $payment = $invoice->payments()->create([
                'amount' => $validated['amount'],
                'payment_date' => $validated['payment_date'],
                'payment_method' => $validated['payment_method'],
                'transaction_reference' => $validated['transaction_reference'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'recorded_by' => $request->user()->id,
            ]);

            return $payment;
        });

        return (new PaymentResource($payment->load(['invoice', 'recorder'])))
            ->additional(['message' => 'Payment recorded successfully.'])
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Submit invoice for approval.
     */
    public function submitApproval(Request $request, $id): JsonResponse|InvoiceResource
    {
        $invoice = Invoice::findOrFail($id);

        if (!Gate::allows('update', $invoice)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if (!in_array($invoice->status, ['draft', 'rejected'], true)) {
            return response()->json(['message' => 'Invoice must be in draft or rejected status to submit for approval.'], 422);
        }

        $invoice = DB::transaction(function () use ($invoice, $request) {
            $invoice->status = 'pending_review';
            $invoice->save();

            InvoiceApproval::create([
                'invoice_id' => $invoice->id,
                'action' => 'submitted',
                'actor_id' => $request->user()->id,
                'notes' => $request->input('notes'),
            ]);

            return $invoice;
        });

        return (new InvoiceResource($invoice->load(['quote', 'client', 'creator', 'currency', 'coupon', 'items.service'])))
            ->additional(['message' => 'Invoice submitted for review successfully.']);
    }

    /**
     * Review the invoice (Head role).
     */
    public function review(Request $request, $id): JsonResponse|InvoiceResource
    {
        $invoice = Invoice::findOrFail($id);

        Gate::authorize('review', $invoice);

        if ($invoice->status !== 'pending_review') {
            return response()->json(['message' => 'Invoice must be in pending_review status to be reviewed.'], 422);
        }

        $invoice = DB::transaction(function () use ($invoice, $request) {
            $invoice->status = 'pending_approval';
            $invoice->save();

            InvoiceApproval::create([
                'invoice_id' => $invoice->id,
                'action' => 'reviewed',
                'actor_id' => $request->user()->id,
                'notes' => $request->input('notes'),
            ]);

            return $invoice;
        });

        return (new InvoiceResource($invoice->load(['quote', 'client', 'creator', 'currency', 'coupon', 'items.service'])))
            ->additional(['message' => 'Invoice reviewed and sent for final approval.']);
    }

    /**
     * Approve the invoice (Founder/Director role).
     */
    public function approve(Request $request, $id): JsonResponse|InvoiceResource
    {
        $invoice = Invoice::findOrFail($id);

        Gate::authorize('approve', $invoice);

        if ($invoice->status !== 'pending_approval') {
            return response()->json(['message' => 'Invoice must be in pending_approval status to be approved.'], 422);
        }

        $invoice = DB::transaction(function () use ($invoice, $request) {
            $invoice->status = 'approved';
            $invoice->save();

            InvoiceApproval::create([
                'invoice_id' => $invoice->id,
                'action' => 'approved',
                'actor_id' => $request->user()->id,
                'notes' => $request->input('notes'),
            ]);

            AuditLog::create([
                'user_id' => $request->user()->id,
                'auditable_type' => Invoice::class,
                'auditable_id' => $invoice->id,
                'event' => 'approved',
                'new_values' => ['status' => 'approved'],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            // Auto-create project stub
            Project::create([
                'name' => $invoice->title,
                'client_id' => $invoice->client_id,
                'invoice_id' => $invoice->id,
                'status' => 'planning',
            ]);

            // Shift Lead to Client if applicable
            if ($invoice->quote && $invoice->quote->lead) {
                $lead = $invoice->quote->lead;
                $lead->update([
                    'is_converted' => true,
                    'converted_client_id' => $invoice->client_id,
                    'converted_at' => now(),
                ]);
            }

            // Verify client user gets the client role if not already assigned
            $clientUser = User::find($invoice->client_id);
            if ($clientUser && !$clientUser->hasRole('client')) {
                $clientUser->assignRole('client');
            }

            return $invoice;
        });

        return (new InvoiceResource($invoice->load(['quote', 'client', 'creator', 'currency', 'coupon', 'items.service'])))
            ->additional(['message' => 'Invoice approved successfully. Project created and client assigned.']);
    }

    /**
     * Reject the invoice.
     */
    public function reject(Request $request, $id): JsonResponse|InvoiceResource
    {
        $invoice = Invoice::findOrFail($id);

        Gate::authorize('reject', $invoice);

        if (!in_array($invoice->status, ['pending_review', 'pending_approval'], true)) {
            return response()->json(['message' => 'Invoice must be in pending_review or pending_approval status to be rejected.'], 422);
        }

        $invoice = DB::transaction(function () use ($invoice, $request) {
            $invoice->status = 'draft';
            $invoice->save();

            InvoiceApproval::create([
                'invoice_id' => $invoice->id,
                'action' => 'rejected',
                'actor_id' => $request->user()->id,
                'notes' => $request->input('notes'),
            ]);

            AuditLog::create([
                'user_id' => $request->user()->id,
                'auditable_type' => Invoice::class,
                'auditable_id' => $invoice->id,
                'event' => 'rejected',
                'new_values' => ['status' => 'draft'],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return $invoice;
        });

        return (new InvoiceResource($invoice->load(['quote', 'client', 'creator', 'currency', 'coupon', 'items.service'])))
            ->additional(['message' => 'Invoice rejected successfully and reverted to draft.']);
    }

    /**
     * Send invoice email to client.
     */
    public function sendMail(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::with(['client'])->findOrFail($id);

        Gate::authorize('view', $invoice);

        $recipientEmail = $invoice->client?->email;

        if (!$recipientEmail) {
            return response()->json([
                'message' => 'Could not find a valid email address for the client.',
            ], 422);
        }

        try {
            $pdfService = app(PdfService::class);
            $pdf = $pdfService->generateInvoicePdf($invoice);
            
            Mail::to($recipientEmail)->send(new InvoiceMail($invoice, $pdf->output()));
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Failed to send email. Please verify SMTP settings.',
                'error' => $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'message' => 'Invoice email sent to client successfully.',
        ]);
    }

    /**
     * Download invoice PDF.
     */
    public function downloadPdf(Request $request, int $id, PdfService $pdfService)
    {
        $invoice = Invoice::findOrFail($id);

        Gate::authorize('view', $invoice);

        $pdf = $pdfService->generateInvoicePdf($invoice);

        return $pdf->download("invoice-{$invoice->invoice_number}.pdf");
    }
}
