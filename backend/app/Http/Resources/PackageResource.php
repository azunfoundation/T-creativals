<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Package
 */
class PackageResource extends JsonResource
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
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'price' => $this->price,
            'billing_cycle' => $this->billing_cycle,
            'is_active' => $this->is_active,
            'is_featured' => $this->is_featured,
            'currency_id' => $this->currency_id,
            'currency' => $this->currency ? [
                'id' => $this->currency->id,
                'code' => $this->currency->code,
                'symbol' => $this->currency->symbol,
                'name' => $this->currency->name,
            ] : null,
            'services' => $this->services->map(fn($service) => [
                'id' => $service->id,
                'name' => $service->name,
                'slug' => $service->slug,
                'default_price' => $service->default_price,
                'billing_type' => $service->billing_type,
                'unit' => $service->unit,
                'is_taxable' => $service->is_taxable,
                'tax_rate' => $service->tax_rate,
                'custom_price' => $service->pivot?->custom_price,
                'quantity' => $service->pivot?->quantity ?? 1,
                'description' => $service->pivot?->description,
            ]),
            'created_at' => $this->created_at?->toDateTimeString(),
            'updated_at' => $this->updated_at?->toDateTimeString(),
        ];
    }
}
