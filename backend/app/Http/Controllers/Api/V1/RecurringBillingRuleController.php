<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecurringBillingRuleResource;
use App\Models\RecurringBillingRule;
use App\Models\DiscountCoupon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class RecurringBillingRuleController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse|AnonymousResourceCollection
    {
        $user = $request->user();

        if (!Gate::allows('viewAny', RecurringBillingRule::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if (!$user->isFounder() && !$user->hasPermissionTo('invoices.view_all')) {
            if ($user->hasPermissionTo('invoices.view')) {
                $query = RecurringBillingRule::where('created_by', $user->id);
            } else {
                return response()->json(['message' => 'This action is unauthorized.'], 403);
            }
        } else {
            $query = RecurringBillingRule::query();
        }

        // Apply filters
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->has('frequency')) {
            $query->where('frequency', $request->input('frequency'));
        }

        $rules = $query->with(['client', 'creator', 'currency', 'coupon', 'items'])
            ->orderBy('created_at', 'desc')
            ->paginate($request->integer('per_page', 15));

        return RecurringBillingRuleResource::collection($rules);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse|RecurringBillingRuleResource
    {
        if (!Gate::allows('create', RecurringBillingRule::class)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'client_id' => ['nullable', 'integer'],
            'status' => ['nullable', 'in:active,inactive'],
            'frequency' => ['required', 'in:daily,weekly,bi_weekly,monthly,quarterly,half_yearly,yearly'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'base_currency' => ['nullable', 'string', 'max:10'],
            'exchange_rate' => ['nullable', 'numeric', 'min:0.0001'],
            'coupon_code' => ['nullable', 'string', 'exists:discount_coupons,code'],
            'coupon_id' => ['nullable', 'exists:discount_coupons,id'],
            'terms_conditions' => ['nullable', 'string'],
            'internal_notes' => ['nullable', 'string'],
            'client_notes' => ['nullable', 'string'],
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

        $rule = DB::transaction(function () use ($validated, $request) {
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

            // Compute the first next generation date (if start_date is in the future/today)
            // Typically start_date itself is the first next_generation_date or start_date is used.
            $nextGenDate = $validated['start_date'];

            $rule = RecurringBillingRule::create([
                'name' => $validated['name'],
                'client_id' => $validated['client_id'] ?? null,
                'created_by' => $request->user()->id,
                'status' => $validated['status'] ?? 'active',
                'frequency' => $validated['frequency'],
                'start_date' => $validated['start_date'],
                'end_date' => $validated['end_date'] ?? null,
                'next_generation_date' => $nextGenDate,
                'currency_id' => $validated['currency_id'],
                'base_currency' => $validated['base_currency'] ?? 'INR',
                'exchange_rate' => $validated['exchange_rate'] ?? 1.0000,
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'tax_amount' => $taxAmount,
                'total_amount' => $totalAmount,
                'coupon_id' => $couponId,
                'coupon_discount' => $couponDiscount,
                'terms_conditions' => $validated['terms_conditions'] ?? null,
                'internal_notes' => $validated['internal_notes'] ?? null,
                'client_notes' => $validated['client_notes'] ?? null,
            ]);

            foreach ($calculatedItems as $cItem) {
                $rule->items()->create($cItem);
            }

            return $rule;
        });

        return (new RecurringBillingRuleResource($rule->load(['client', 'creator', 'currency', 'coupon', 'items'])))
            ->additional(['message' => 'Recurring billing rule created successfully.']);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, RecurringBillingRule $recurringBillingRule): JsonResponse|RecurringBillingRuleResource
    {
        if (!Gate::allows('view', $recurringBillingRule)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        return new RecurringBillingRuleResource($recurringBillingRule->load(['client', 'creator', 'currency', 'coupon', 'items']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, RecurringBillingRule $recurringBillingRule): JsonResponse|RecurringBillingRuleResource
    {
        if (!Gate::allows('update', $recurringBillingRule)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'client_id' => ['nullable', 'integer'],
            'status' => ['nullable', 'in:active,inactive'],
            'frequency' => ['required', 'in:daily,weekly,bi_weekly,monthly,quarterly,half_yearly,yearly'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'currency_id' => ['required', 'exists:currencies,id'],
            'base_currency' => ['nullable', 'string', 'max:10'],
            'exchange_rate' => ['nullable', 'numeric', 'min:0.0001'],
            'coupon_code' => ['nullable', 'string', 'exists:discount_coupons,code'],
            'coupon_id' => ['nullable', 'exists:discount_coupons,id'],
            'terms_conditions' => ['nullable', 'string'],
            'internal_notes' => ['nullable', 'string'],
            'client_notes' => ['nullable', 'string'],
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

        $recurringBillingRule = DB::transaction(function () use ($recurringBillingRule, $validated) {
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
                if ($recurringBillingRule->coupon_id !== $couponId) {
                    if ($recurringBillingRule->coupon) {
                        $recurringBillingRule->coupon->decrement('used_count');
                    }
                    $coupon->increment('used_count');
                }
            } else {
                if ($recurringBillingRule->coupon) {
                    $recurringBillingRule->coupon->decrement('used_count');
                }
            }

            $discountAmount = $itemsDiscount + $couponDiscount;
            $taxAmount = $itemsTax;
            $totalAmount = $subtotal - $discountAmount + $taxAmount;

            $recurringBillingRule->update([
                'name' => $validated['name'],
                'client_id' => $validated['client_id'] ?? null,
                'status' => $validated['status'] ?? $recurringBillingRule->status,
                'frequency' => $validated['frequency'],
                'start_date' => $validated['start_date'],
                'end_date' => $validated['end_date'] ?? null,
                'currency_id' => $validated['currency_id'],
                'base_currency' => $validated['base_currency'] ?? $recurringBillingRule->base_currency ?? 'INR',
                'exchange_rate' => $validated['exchange_rate'] ?? 1.0000,
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'tax_amount' => $taxAmount,
                'total_amount' => $totalAmount,
                'coupon_id' => $couponId,
                'coupon_discount' => $couponDiscount,
                'terms_conditions' => $validated['terms_conditions'] ?? null,
                'internal_notes' => $validated['internal_notes'] ?? null,
                'client_notes' => $validated['client_notes'] ?? null,
            ]);

            // Recreate items
            $recurringBillingRule->items()->delete();
            foreach ($calculatedItems as $cItem) {
                $recurringBillingRule->items()->create($cItem);
            }

            // Recalculate rule totals fully
            $recurringBillingRule->recalculateTotals();

            return $recurringBillingRule;
        });

        return (new RecurringBillingRuleResource($recurringBillingRule->load(['client', 'creator', 'currency', 'coupon', 'items'])))
            ->additional(['message' => 'Recurring billing rule updated successfully.']);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, RecurringBillingRule $recurringBillingRule): JsonResponse
    {
        if (!Gate::allows('delete', $recurringBillingRule)) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($recurringBillingRule->coupon) {
            $recurringBillingRule->coupon->decrement('used_count');
        }

        $recurringBillingRule->delete();

        return response()->json([
            'message' => 'Recurring billing rule deleted successfully.',
        ]);
    }
}
