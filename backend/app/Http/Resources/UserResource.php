<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     */
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'name'        => $this->name,
            'email'       => $this->email,
            'phone'       => $this->phone,
            'employee_id' => $this->employee_id,
            'avatar_url'  => $this->avatar_url
                ? (str_starts_with($this->avatar_url, 'http')
                    ? $this->avatar_url
                    : asset('storage/' . $this->avatar_url))
                : null,
            'status'      => $this->status,

            // Roles: array of role objects
            'roles' => $this->roles->map(fn($role) => [
                'id'           => $role->id,
                'name'         => $role->name,
                'display_name' => ucwords(str_replace('_', ' ', $role->name)),
            ])->values()->toArray(),

            // All permission names (direct + via roles)
            'permissions' => $this->getAllPermissions()->pluck('name')->values()->toArray(),

            // Departments with minimal fields
            'departments' => $this->whenLoaded('departments', function () {
                return $this->departments->map(fn ($dept) => [
                    'id'         => $dept->id,
                    'name'       => $dept->name,
                    'color'      => $dept->color,
                    'is_primary' => (bool) ($dept->pivot->is_primary ?? false),
                    'role'       => $dept->pivot->role ?? null,
                ])->values()->toArray();
            }, []),

            // Managers (direct supervisors)
            'managers' => $this->whenLoaded('managers', function () {
                return $this->managers->map(fn ($manager) => [
                    'id'   => $manager->id,
                    'name' => $manager->name,
                ])->values()->toArray();
            }, []),

            // Formatted dates
            'last_login_at' => $this->last_login_at
                ? $this->last_login_at->format('Y-m-d H:i:s')
                : null,

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
