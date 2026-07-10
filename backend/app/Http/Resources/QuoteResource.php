<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Quote
 */
class QuoteResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'quote_number' => $this->quote_number,
            'lead_id' => $this->lead_id,
            'lead' => $this->lead ? [
                'id' => $this->lead->id,
                'company_name' => $this->lead->company_name,
                'lead_number' => $this->lead->lead_number,
            ] : null,
            'client_id' => $this->client_id,
            'created_by' => $this->created_by,
            'creator' => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
                'email' => $this->creator->email,
            ] : null,
            'title' => $this->title,
            'description' => $this->description,
            'currency_id' => $this->currency_id,
            'currency' => $this->currency ? [
                'id' => $this->currency->id,
                'code' => $this->currency->code,
                'symbol' => $this->currency->symbol,
                'name' => $this->currency->name,
            ] : null,
            'exchange_rate' => $this->exchange_rate,
            'subtotal' => $this->subtotal,
            'discount_amount' => $this->discount_amount,
            'tax_amount' => $this->tax_amount,
            'total_amount' => $this->total_amount,
            'coupon_id' => $this->coupon_id,
            'coupon' => $this->coupon ? [
                'id' => $this->coupon->id,
                'code' => $this->coupon->code,
                'type' => $this->coupon->type,
                'value' => $this->coupon->value,
            ] : null,
            'coupon_discount' => $this->coupon_discount,
            'status' => $this->status,
            'valid_until' => $this->valid_until?->toDateString(),
            'terms_conditions' => $this->terms_conditions,
            'internal_notes' => $this->internal_notes,
            'client_notes' => $this->client_notes,
            'revision_number' => $this->revision_number,
            'parent_quote_id' => $this->parent_quote_id,
            'items' => $this->items->map(fn($item) => [
                'id' => $item->id,
                'service_id' => $item->service_id,
                'service_name' => $item->service?->name,
                'description' => $item->description,
                'quantity' => $item->quantity,
                'unit' => $item->unit,
                'unit_price' => $item->unit_price,
                'discount_percent' => $item->discount_percent,
                'discount_amount' => $item->discount_amount,
                'tax_rate' => $item->tax_rate,
                'tax_amount' => $item->tax_amount,
                'total_amount' => $item->total_amount,
                'sort_order' => $item->sort_order,
            ]),
            'approvals' => $this->approvals->map(fn($approval) => [
                'id' => $approval->id,
                'step_number' => $approval->step_number,
                'status' => $approval->status,
                'comments' => $approval->comments,
                'actioned_at' => $approval->actioned_at?->toDateTimeString(),
                'requested_by' => $approval->requested_by,
                'requester' => $approval->requester ? [
                    'id' => $approval->requester->id,
                    'name' => $approval->requester->name,
                ] : null,
                'approver_id' => $approval->approver_id,
                'approver' => $approval->approver ? [
                    'id' => $approval->approver->id,
                    'name' => $approval->approver->name,
                ] : null,
                'created_at' => $approval->created_at?->toDateTimeString(),
            ]),
            'created_at' => $this->created_at?->toDateTimeString(),
            'updated_at' => $this->updated_at?->toDateTimeString(),
        ];
    }
}
