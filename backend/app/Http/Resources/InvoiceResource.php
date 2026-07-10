<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Invoice
 */
class InvoiceResource extends JsonResource
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
            'invoice_number' => $this->invoice_number,
            'quote_id' => $this->quote_id,
            'quote' => $this->quote ? [
                'id' => $this->quote->id,
                'quote_number' => $this->quote->quote_number,
                'title' => $this->quote->title,
            ] : null,
            'client_id' => $this->client_id,
            'client' => $this->client ? [
                'id' => $this->client->id,
                'name' => $this->client->name,
                'email' => $this->client->email,
            ] : null,
            'created_by' => $this->created_by,
            'creator' => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
                'email' => $this->creator->email,
            ] : null,
            'recurring_rule_id' => $this->recurring_rule_id,
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
            'base_currency' => $this->base_currency,
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
            'paid_amount' => $this->paid_amount,
            'due_amount' => $this->due_amount,
            'status' => $this->status,
            'issue_date' => $this->issue_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'terms_conditions' => $this->terms_conditions,
            'client_notes' => $this->client_notes,
            'internal_notes' => $this->internal_notes,
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
                'tax_type' => $item->tax_type,
                'tax_rate' => $item->tax_rate,
                'tax_amount' => $item->tax_amount,
                'total_amount' => $item->total_amount,
                'sort_order' => $item->sort_order,
            ]),
            'payments' => $this->payments->map(fn($payment) => [
                'id' => $payment->id,
                'payment_number' => $payment->payment_number,
                'amount' => $payment->amount,
                'payment_date' => $payment->payment_date?->toDateString(),
                'payment_method' => $payment->payment_method,
                'transaction_reference' => $payment->transaction_reference,
                'notes' => $payment->notes,
                'recorded_by' => $payment->recorded_by,
            ]),
            'created_at' => $this->created_at?->toDateTimeString(),
            'updated_at' => $this->updated_at?->toDateTimeString(),
        ];
    }
}
