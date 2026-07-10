<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DiscountCoupon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DiscountCouponController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        // Allow users who can manage services or create quotes
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage') && !$user->hasPermissionTo('quotes.create')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $coupons = DiscountCoupon::orderBy('code')->get();

        return response()->json([
            'data' => $coupons,
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage') && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:discount_coupons,code'],
            'description' => ['nullable', 'string'],
            'type' => ['required', 'string', 'in:percentage,fixed'],
            'value' => ['required', 'numeric', 'min:0'],
            'minimum_amount' => ['nullable', 'numeric', 'min:0'],
            'maximum_discount' => ['nullable', 'numeric', 'min:0'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'valid_from' => ['nullable', 'date'],
            'valid_until' => ['nullable', 'date', 'after_or_equal:valid_from'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $coupon = DiscountCoupon::create($validated);

        return response()->json([
            'message' => 'Discount coupon created successfully.',
            'data' => $coupon,
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, DiscountCoupon $discountCoupon): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage') && !$user->hasPermissionTo('quotes.create')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        return response()->json([
            'data' => $discountCoupon,
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, DiscountCoupon $discountCoupon): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage') && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'code' => ['sometimes', 'required', 'string', 'max:50', 'unique:discount_coupons,code,' . $discountCoupon->id],
            'description' => ['nullable', 'string'],
            'type' => ['sometimes', 'required', 'string', 'in:percentage,fixed'],
            'value' => ['sometimes', 'required', 'numeric', 'min:0'],
            'minimum_amount' => ['nullable', 'numeric', 'min:0'],
            'maximum_discount' => ['nullable', 'numeric', 'min:0'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'valid_from' => ['nullable', 'date'],
            'valid_until' => ['nullable', 'date', 'after_or_equal:valid_from'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $discountCoupon->update($validated);

        return response()->json([
            'message' => 'Discount coupon updated successfully.',
            'data' => $discountCoupon,
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, DiscountCoupon $discountCoupon): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('settings.manage') && !$user->hasPermissionTo('services.manage')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $discountCoupon->delete();

        return response()->json([
            'message' => 'Discount coupon deleted successfully.',
        ]);
    }

    /**
     * Validate a coupon code against a subtotal amount.
     */
    public function validateCoupon(Request $request, string $code): JsonResponse
    {
        $user = $request->user();
        if (!$user->isFounder() && !$user->hasPermissionTo('quotes.create') && !$user->hasPermissionTo('quotes.view')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $amount = $request->query('amount');
        if ($amount === null || $amount === '') {
            return response()->json(['message' => 'The amount parameter is required.'], 422);
        }

        $coupon = DiscountCoupon::where('code', $code)->first();

        if (!$coupon) {
            return response()->json([
                'valid' => false,
                'message' => 'Coupon not found.',
            ], 404);
        }

        if (!$coupon->isValidForAmount((float) $amount)) {
            return response()->json([
                'valid' => false,
                'message' => 'Coupon is invalid, expired, has reached its usage limit, or does not meet the minimum amount requirement.',
            ], 200);
        }

        // Calculate discount value
        $discountValue = 0.00;
        if ($coupon->type === 'percentage') {
            $discountValue = ((float) $amount) * ((float) $coupon->value / 100);
            if ($coupon->maximum_discount !== null && $discountValue > (float) $coupon->maximum_discount) {
                $discountValue = (float) $coupon->maximum_discount;
            }
        } else {
            $discountValue = (float) $coupon->value;
            if ($discountValue > (float) $amount) {
                $discountValue = (float) $amount; // Cannot discount more than subtotal
            }
        }

        return response()->json([
            'valid' => true,
            'coupon_id' => $coupon->id,
            'code' => $coupon->code,
            'type' => $coupon->type,
            'value' => $coupon->value,
            'discount_amount' => round($discountValue, 2),
        ]);
    }
}
