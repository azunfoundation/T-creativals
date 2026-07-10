<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    /**
     * Display a listing of all roles with their permissions.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Role::class);

        $roles = Role::with('permissions')
            ->withCount('users')
            ->orderBy('name')
            ->get()
            ->map(fn ($role) => $this->formatRole($role));

        return response()->json([
            'data'    => $roles,
            'message' => 'Roles retrieved successfully.',
        ]);
    }

    /**
     * Store a newly created role.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Role::class);

        $validated = $request->validate([
            'name'           => ['required', 'string', 'max:100', 'unique:roles,name'],
            'description'    => ['nullable', 'string', 'max:500'],
            'permission_ids' => ['nullable', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        // Guard is always `web` — the single guard used for all roles and
        // permissions in this application. Never accept it from client input,
        // otherwise mismatched-guard roles become unassignable.
        $role = Role::create([
            'name'        => $validated['name'],
            'guard_name'  => 'web',
            'description' => $validated['description'] ?? null,
        ]);

        if (!empty($validated['permission_ids'])) {
            $permissions = Permission::whereIn('id', $validated['permission_ids'])->get();
            $role->syncPermissions($permissions);
        }

        $role->load('permissions');
        $role->loadCount('users');

        return response()->json([
            'data'    => $this->formatRole($role),
            'message' => 'Role created successfully.',
        ], 201);
    }

    /**
     * Display the specified role with its permissions.
     */
    public function show(Role $role): JsonResponse
    {
        $this->authorize('view', $role);

        $role->load('permissions');
        $role->loadCount('users');

        return response()->json([
            'data'    => $this->formatRole($role),
            'message' => 'Role retrieved successfully.',
        ]);
    }

    /**
     * Update the specified role.
     */
    public function update(Request $request, Role $role): JsonResponse
    {
        $this->authorize('update', $role);

        // Prevent editing core system roles
        if (in_array($role->name, ['founder', 'super-admin'], true)) {
            return response()->json([
                'message' => "The '{$role->name}' role cannot be modified.",
            ], 403);
        }

        $validated = $request->validate([
            'name' => [
                'sometimes', 'required', 'string', 'max:100',
                \Illuminate\Validation\Rule::unique('roles', 'name')->ignore($role->id),
            ],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $role->update($validated);
        $role->load('permissions');
        $role->loadCount('users');

        return response()->json([
            'data'    => $this->formatRole($role),
            'message' => 'Role updated successfully.',
        ]);
    }

    /**
     * Remove the specified role.
     */
    public function destroy(Role $role): JsonResponse
    {
        $this->authorize('delete', $role);

        if (in_array($role->name, ['founder', 'super-admin'], true)) {
            return response()->json([
                'message' => "The '{$role->name}' role cannot be deleted.",
            ], 403);
        }

        $userCount = $role->users()->count();
        if ($userCount > 0) {
            return response()->json([
                'message' => "Cannot delete role assigned to {$userCount} user(s).",
                'errors'  => ['users' => ["Role is assigned to {$userCount} user(s)."]],
            ], 422);
        }

        $role->delete();

        return response()->json([
            'data'    => null,
            'message' => 'Role deleted successfully.',
        ]);
    }

    /**
     * Sync permissions to a role.
     * PUT /roles/{role}/permissions
     */
    public function syncPermissions(Request $request, Role $role): JsonResponse
    {
        $this->authorize('update', $role);

        // Mirror update()/destroy()'s protection — founder must always retain
        // every permission (every Policy's before() hook makes it an
        // unconditional bypass), so its permission set can't be edited away
        // through this endpoint even though update()/destroy() already block
        // renaming/deleting it.
        if (in_array($role->name, ['founder', 'super-admin'], true)) {
            return response()->json([
                'message' => "The '{$role->name}' role's permissions cannot be modified.",
            ], 403);
        }

        $validated = $request->validate([
            'permission_ids'   => ['required', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);

        $permissions = Permission::whereIn('id', $validated['permission_ids'])->get();
        $role->syncPermissions($permissions);
        $role->load('permissions');
        $role->loadCount('users');

        return response()->json([
            'data'    => $this->formatRole($role),
            'message' => 'Role permissions synced successfully.',
        ]);
    }

    /**
     * List all permissions grouped by module.
     * GET /permissions
     */
    public function permissions(): JsonResponse
    {
        $permissions = Permission::orderBy('name')->get();

        // Group by module prefix (e.g. "users.view" => "users")
        $grouped = $permissions->groupBy(function ($permission) {
            $parts = explode('.', $permission->name);
            return $parts[0] ?? 'general';
        })->map(function ($group) {
            return $group->map(fn ($p) => [
                'id'          => $p->id,
                'name'        => $p->name,
                'guard_name'  => $p->guard_name,
                'description' => $p->description ?? null,
            ])->values();
        });

        return response()->json([
            'data'    => $grouped,
            'message' => 'Permissions retrieved successfully.',
        ]);
    }

    /**
     * Format a role model into a consistent response array.
     */
    private function formatRole(Role $role): array
    {
        return [
            'id'           => $role->id,
            'name'         => $role->name,
            'display_name' => ucwords(str_replace('_', ' ', $role->name)),
            'guard_name'   => $role->guard_name,
            'description'  => $role->description ?? null,
            'users_count'  => $role->users_count ?? 0,
            'permissions'  => $role->permissions->map(fn ($p) => [
                'id'         => $p->id,
                'name'       => $p->name,
                'guard_name' => $p->guard_name,
            ])->values(),
            'created_at' => $role->created_at?->toIso8601String(),
            'updated_at' => $role->updated_at?->toIso8601String(),
        ];
    }
}
