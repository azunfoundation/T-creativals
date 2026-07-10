<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin \App\Models\Lead
 */
class LeadResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        // Build stage object - exposed under BOTH 'stage' and 'lead_stage' for compatibility
        $stageData = $this->stage ? [
            'id'         => $this->stage->id,
            'name'       => $this->stage->name,
            'slug'       => $this->stage->slug,
            'color'      => $this->stage->color,
            'sort_order' => $this->stage->sort_order,
            'is_system'  => $this->stage->is_system,
        ] : null;

        // Build source object - exposed under BOTH 'source' and 'lead_source' for compatibility
        $sourceData = $this->source ? [
            'id'   => $this->source->id,
            'name' => $this->source->name,
            'slug' => $this->source->slug,
            'color' => $this->source->color,
            'icon' => $this->source->icon,
        ] : null;

        return [
            // Core identifiers
            'id'                       => $this->id,
            'lead_number'              => $this->lead_number,

            // Company info
            'company_name'             => $this->company_name,
            'website_url'              => $this->website_url,
            'whatsapp_number'          => $this->whatsapp_number,
            'city'                     => $this->city,
            'country'                  => $this->country,
            'timezone'                 => $this->timezone,

            // Priority / temperature
            'priority'                 => $this->priority,
            'temperature'              => $this->temperature,

            // Budget - exposed under BOTH field names so frontend works regardless of which it reads
            'estimated_monthly_budget' => (float) ($this->estimated_monthly_budget ?? 0),
            'budget'                   => (float) ($this->estimated_monthly_budget ?? 0),

            // Dates
            'expected_start_date'      => $this->expected_start_date?->toDateString(),
            'notes'                    => $this->notes,

            // Conversion status
            'is_converted'             => $this->is_converted,
            'converted_client_id'      => $this->converted_client_id,
            'converted_at'             => $this->converted_at?->toDateTimeString(),

            // Foreign keys - exposed directly so frontend can filter/match
            'stage_id'                 => $this->stage_id,
            'source_id'                => $this->lead_source_id, // map DB col → frontend expectation
            'lead_source_id'           => $this->lead_source_id,
            'sales_exec_id'            => $this->sales_exec_id,
            'sales_head_id'            => $this->sales_head_id,
            'created_by'               => $this->created_by,

            // Related objects - exposed under BOTH naming conventions
            'stage'                    => $stageData,
            'lead_stage'               => $stageData,
            'source'                   => $sourceData,
            'lead_source'              => $sourceData,

            'sales_exec'               => $this->salesExec ? [
                'id'   => $this->salesExec->id,
                'name' => $this->salesExec->name,
            ] : null,

            'sales_head'               => $this->salesHead ? [
                'id'   => $this->salesHead->id,
                'name' => $this->salesHead->name,
            ] : null,

            // Collections
            'contacts'   => LeadContactResource::collection(
                $this->relationLoaded('contacts') ? $this->contacts : $this->contacts
            ),
            'activities' => LeadActivityResource::collection(
                $this->relationLoaded('activities') ? $this->activities : $this->activities
            ),
            'followups' => $this->relationLoaded('followups') ? $this->followups->map(fn ($f) => [
                'id' => $f->id,
                'description' => $f->description,
                'type' => $f->type,
                'scheduled_at' => $f->scheduled_at?->toDateTimeString(),
                'is_completed' => $f->is_completed,
                'completed_at' => $f->completed_at?->toDateTimeString(),
            ]) : [],
            'interested_service_ids' => $this->relationLoaded('services') ? $this->services->pluck('id') : [],

            // Timestamps
            'created_at' => $this->created_at?->toDateTimeString(),
            'updated_at' => $this->updated_at?->toDateTimeString(),
        ];
    }
}
