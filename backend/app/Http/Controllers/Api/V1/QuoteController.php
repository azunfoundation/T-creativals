<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\QuoteResource;
use App\Models\DiscountCoupon;
use App\Models\Quote;
use App\Models\QuoteApproval;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use App\Mail\QuoteMail;
use App\Services\PdfService;
use App\Models\User;

class QuoteController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse|AnonymousResourceCollection
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('quotes.view_all')) {
            if ($user->hasPermissionTo('quotes.view')) {
                // Limit to own quotes or leads assigned to them
                $query = Quote::where(function ($q) use ($user) {
                    $q->where('created_by', $user->id)
                      ->orWhereHas('lead', function ($ql) use ($user) {
                          $ql->where('sales_exec_id', $user->id)
                             ->orWhere('sales_head_id', $user->id);
                      });
                });
            } else {
                return response()->json(['message' => 'This action is unauthorized.'], 403);
            }
        } else {
            $query = Quote::query();
        }

        // Apply filters
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->has('lead_id')) {
            $query->where('lead_id', $request->input('lead_id'));
        }

        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('quote_number', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $quotes = $query->with(['lead', 'creator', 'currency', 'coupon', 'items.service', 'approvals'])
            ->orderBy('created_at', 'desc')
            ->paginate($request->integer('per_page', 15));

        return QuoteResource::collection($quotes);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse|QuoteResource
    {
        Gate::authorize('create', Quote::class);

        $validated = $request->validate([
            'lead_id' => ['nullable', 'exists:leads,id'],
            'client_id' => ['nullable', 'integer'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'exchange_rate' => ['nullable', 'numeric', 'min:0.0001'],
            'coupon_code' => ['nullable', 'string', 'exists:discount_coupons,code'],
            'coupon_id' => ['nullable', 'exists:discount_coupons,id'],
            'valid_until' => ['nullable', 'date'],
            'terms_conditions' => ['nullable', 'string'],
            'internal_notes' => ['nullable', 'string'],
            'client_notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['nullable', 'exists:services,id'],
            'items.*.description' => ['required', 'string'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01'],
            'items.*.unit' => ['nullable', 'string', 'max:50'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.sort_order' => ['nullable', 'integer'],
        ]);

        $quote = DB::transaction(function () use ($validated, $request) {
            // Recompute totals
            $subtotal = 0.00;
            $itemsDiscount = 0.00;
            $itemsTax = 0.00;
            $calculatedItems = [];

            foreach ($validated['items'] as $item) {
                $qty = (float) ($item['quantity'] ?? 1);
                $price = (float) ($item['unit_price'] ?? 0);
                $discPercent = (float) ($item['discount_percent'] ?? 0);
                $taxRate = (float) ($item['tax_rate'] ?? 0);

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
                    'discount_percent' => $discPercent,
                    'discount_amount' => $itemDiscount,
                    'tax_rate' => $taxRate,
                    'tax_amount' => $itemTax,
                    'total_amount' => $itemTotal,
                    'sort_order' => $item['sort_order'] ?? 0,
                ];
            }

            // Coupon validation & calculations
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

            $quote = Quote::create([
                'lead_id' => $validated['lead_id'] ?? null,
                'client_id' => $validated['client_id'] ?? null,
                'created_by' => $request->user()->id,
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'currency_id' => $validated['currency_id'],
                'exchange_rate' => $validated['exchange_rate'] ?? 1.0000,
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'tax_amount' => $taxAmount,
                'total_amount' => $totalAmount,
                'coupon_id' => $couponId,
                'coupon_discount' => $couponDiscount,
                'status' => 'draft',
                'valid_until' => $validated['valid_until'] ?? null,
                'terms_conditions' => $validated['terms_conditions'] ?? null,
                'internal_notes' => $validated['internal_notes'] ?? null,
                'client_notes' => $validated['client_notes'] ?? null,
            ]);

            foreach ($calculatedItems as $cItem) {
                $quote->items()->create($cItem);
            }

            return $quote;
        });

        return (new QuoteResource($quote->load(['lead', 'creator', 'currency', 'coupon', 'items.service'])))
            ->additional(['message' => 'Quote created successfully.']);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, Quote $quote): JsonResponse|QuoteResource
    {
        Gate::authorize('view', $quote);

        return new QuoteResource($quote->load(['lead', 'creator', 'currency', 'coupon', 'items.service', 'approvals']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Quote $quote): JsonResponse|QuoteResource
    {
        Gate::authorize('update', $quote);

        $validated = $request->validate([
            'lead_id' => ['nullable', 'exists:leads,id'],
            'client_id' => ['nullable', 'integer'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'exchange_rate' => ['nullable', 'numeric', 'min:0.0001'],
            'coupon_code' => ['nullable', 'string', 'exists:discount_coupons,code'],
            'coupon_id' => ['nullable', 'exists:discount_coupons,id'],
            'valid_until' => ['nullable', 'date'],
            'terms_conditions' => ['nullable', 'string'],
            'internal_notes' => ['nullable', 'string'],
            'client_notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['nullable', 'exists:services,id'],
            'items.*.description' => ['required', 'string'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01'],
            'items.*.unit' => ['nullable', 'string', 'max:50'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.sort_order' => ['nullable', 'integer'],
        ]);

        $quote = DB::transaction(function () use ($quote, $validated) {
            // Recompute totals
            $subtotal = 0.00;
            $itemsDiscount = 0.00;
            $itemsTax = 0.00;
            $calculatedItems = [];

            foreach ($validated['items'] as $item) {
                $qty = (float) ($item['quantity'] ?? 1);
                $price = (float) ($item['unit_price'] ?? 0);
                $discPercent = (float) ($item['discount_percent'] ?? 0);
                $taxRate = (float) ($item['tax_rate'] ?? 0);

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
                    'discount_percent' => $discPercent,
                    'discount_amount' => $itemDiscount,
                    'tax_rate' => $taxRate,
                    'tax_amount' => $itemTax,
                    'total_amount' => $itemTotal,
                    'sort_order' => $item['sort_order'] ?? 0,
                ];
            }

            // Coupon validation & calculations
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
                if ($quote->coupon_id !== $couponId) {
                    if ($quote->coupon) {
                        $quote->coupon->decrement('used_count');
                    }
                    $coupon->increment('used_count');
                }
            } else {
                // If coupon removed
                if ($quote->coupon) {
                    $quote->coupon->decrement('used_count');
                }
            }

            $discountAmount = $itemsDiscount + $couponDiscount;
            $taxAmount = $itemsTax;
            $totalAmount = $subtotal - $discountAmount + $taxAmount;

            $quote->update([
                'lead_id' => $validated['lead_id'] ?? null,
                'client_id' => $validated['client_id'] ?? null,
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'currency_id' => $validated['currency_id'],
                'exchange_rate' => $validated['exchange_rate'] ?? 1.0000,
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'tax_amount' => $taxAmount,
                'total_amount' => $totalAmount,
                'coupon_id' => $couponId,
                'coupon_discount' => $couponDiscount,
                'valid_until' => $validated['valid_until'] ?? null,
                'terms_conditions' => $validated['terms_conditions'] ?? null,
                'internal_notes' => $validated['internal_notes'] ?? null,
                'client_notes' => $validated['client_notes'] ?? null,
            ]);

            // Recreate items
            $quote->items()->delete();
            foreach ($calculatedItems as $cItem) {
                $quote->items()->create($cItem);
            }

            return $quote;
        });

        return (new QuoteResource($quote->load(['lead', 'creator', 'currency', 'coupon', 'items.service'])))
            ->additional(['message' => 'Quote updated successfully.']);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, Quote $quote): JsonResponse
    {
        Gate::authorize('delete', $quote);

        if ($quote->coupon) {
            $quote->coupon->decrement('used_count');
        }

        $quote->delete();

        return response()->json([
            'message' => 'Quote deleted successfully.',
        ]);
    }

    /**
     * Submit a quote for approval.
     */
    public function submitApproval(Request $request, int $id): JsonResponse
    {
        $quote = Quote::findOrFail($id);

        Gate::authorize('submitApproval', $quote);

        // Can only submit draft or rejected quotes
        if (!in_array($quote->status, ['draft', 'rejected'], true)) {
            return response()->json([
                'message' => 'Only draft or rejected quotes can be submitted for approval.',
            ], 422);
        }

        $user = $request->user();

        DB::transaction(function () use ($quote, $user) {
            // Create pending QuoteApproval entry
            QuoteApproval::create([
                'quote_id' => $quote->id,
                'requested_by' => $user->id,
                'approver_id' => null,
                'step_number' => 1,
                'status' => 'pending',
            ]);

            // Update status
            $quote->update([
                'status' => 'pending_approval',
            ]);
        });

        return response()->json([
            'message' => 'Quote submitted for approval successfully.',
            'quote' => new QuoteResource($quote->fresh(['lead', 'creator', 'currency', 'coupon', 'items.service', 'approvals'])),
        ]);
    }

    /**
     * Approve a quote.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $quote = Quote::findOrFail($id);

        Gate::authorize('approve', $quote);

        if ($quote->status !== 'pending_approval') {
            return response()->json([
                'message' => 'Only quotes pending approval can be approved.',
            ], 422);
        }

        $user = $request->user();

        DB::transaction(function () use ($quote, $user, $request) {
            $approval = $quote->approvals()->where('status', 'pending')->latest()->first();
            if ($approval) {
                $approval->update([
                    'status' => 'approved',
                    'approver_id' => $user->id,
                    'comments' => $request->input('comments'),
                    'actioned_at' => now(),
                ]);
            } else {
                $quote->approvals()->create([
                    'requested_by' => $quote->created_by,
                    'approver_id' => $user->id,
                    'status' => 'approved',
                    'comments' => $request->input('comments'),
                    'actioned_at' => now(),
                ]);
            }

            $quote->update([
                'status' => 'approved',
            ]);
        });

        return response()->json([
            'message' => 'Quote approved successfully.',
            'quote' => new QuoteResource($quote->fresh(['lead', 'creator', 'currency', 'coupon', 'items.service', 'approvals'])),
        ]);
    }

    /**
     * Reject a quote.
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        $quote = Quote::findOrFail($id);

        Gate::authorize('approve', $quote);

        if ($quote->status !== 'pending_approval') {
            return response()->json([
                'message' => 'Only quotes pending approval can be rejected.',
            ], 422);
        }

        $request->validate([
            'comments' => ['required', 'string', 'min:3'],
        ]);

        $user = $request->user();

        DB::transaction(function () use ($quote, $user, $request) {
            $approval = $quote->approvals()->where('status', 'pending')->latest()->first();
            if ($approval) {
                $approval->update([
                    'status' => 'rejected',
                    'approver_id' => $user->id,
                    'comments' => $request->input('comments'),
                    'actioned_at' => now(),
                ]);
            } else {
                $quote->approvals()->create([
                    'requested_by' => $quote->created_by,
                    'approver_id' => $user->id,
                    'status' => 'rejected',
                    'comments' => $request->input('comments'),
                    'actioned_at' => now(),
                ]);
            }

            $quote->update([
                'status' => 'rejected',
            ]);
        });

        return response()->json([
            'message' => 'Quote rejected successfully.',
            'quote' => new QuoteResource($quote->fresh(['lead', 'creator', 'currency', 'coupon', 'items.service', 'approvals'])),
        ]);
    }

    /**
     * Send quote email to client.
     */
    public function sendMail(Request $request, int $id): JsonResponse
    {
        $quote = Quote::with(['lead.contacts', 'client'])->findOrFail($id);

        Gate::authorize('view', $quote);

        $recipientEmail = null;
        if ($quote->client && $quote->client->email) {
            $recipientEmail = $quote->client->email;
        } elseif ($quote->lead && $quote->lead->contacts->isNotEmpty()) {
            $contact = $quote->lead->contacts->where('is_primary', true)->first()
                ?? $quote->lead->contacts->first();
            if ($contact && $contact->email) {
                $recipientEmail = $contact->email;
            }
        }

        if (!$recipientEmail) {
            return response()->json([
                'message' => 'Could not find a valid email address for the client or lead contacts.',
            ], 422);
        }

        try {
            $pdfService = app(PdfService::class);
            $pdf = $pdfService->generateQuotePdf($quote);

            Mail::to($recipientEmail)->send(new QuoteMail($quote, $pdf->output()));
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Failed to send email. Please verify SMTP settings.',
                'error' => $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'message' => 'Quote email sent to client successfully.',
        ]);
    }

    /**
     * Download quote PDF.
     */
    public function downloadPdf(Request $request, int $id, PdfService $pdfService)
    {
        $quote = Quote::findOrFail($id);

        Gate::authorize('view', $quote);

        $pdf = $pdfService->generateQuotePdf($quote);

        return $pdf->download("quote-{$quote->quote_number}.pdf");
    }
}
