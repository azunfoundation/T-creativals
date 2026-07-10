<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DepartmentResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     */
    public function toArray(Request $request): array
    {
        return [
            'id'           => $this->id,
            'name'         => $this->name,
            'slug'         => $this->slug,
            'description'  => $this->description,
            'color'        => $this->color ?? '#6366f1',
            'is_active'    => (bool) $this->is_active,
            'sort_order'   => $this->sort_order,

            // Head user with minimal fields
            'head' => $this->whenLoaded('head', function () {
                return $this->head ? [
                    'id'         => $this->head->id,
                    'name'       => $this->head->name,
                    'avatar_url' => $this->head->avatar_url
                        ? (str_starts_with($this->head->avatar_url, 'http')
                            ? $this->head->avatar_url
                            : asset('storage/' . $this->head->avatar_url))
                        : null,
                ] : null;
            }, null),

            // Member count (from withCount or relationship)
            'member_count' => $this->member_count
                ?? (isset($this->activeMembers) ? $this->activeMembers->count() : 0),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
