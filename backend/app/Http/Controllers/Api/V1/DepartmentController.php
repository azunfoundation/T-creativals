<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\DepartmentResource;
use App\Models\Department;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    /**
     * Display a listing of departments with member_count and head.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Department::class);

        $query = Department::query()
            ->with(['head:id,name,email,avatar_url'])
            ->withCount('activeMembers as member_count')
            ->orderBy('sort_order')
            ->orderBy('name');

        if ($request->filled('search')) {
            $search = $request->string('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $departments = $query->paginate($request->integer('per_page', 15));

        return DepartmentResource::collection($departments);
    }

    /**
     * Store a newly created department.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Department::class);

        $validated = $request->validate([
            'name'         => ['required', 'string', 'max:100', 'unique:departments,name'],
            'slug'         => ['nullable', 'string', 'max:100', 'unique:departments,slug', 'regex:/^[a-z0-9-]+$/'],
            'description'  => ['nullable', 'string', 'max:1000'],
            'color'        => ['nullable', 'string', 'max:7', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'head_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'sort_order'   => ['nullable', 'integer', 'min:0'],
            'is_active'    => ['boolean'],
        ]);

        // Auto-generate slug if not provided
        if (empty($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $validated['sort_order'] ??= Department::max('sort_order') + 1;
        $validated['is_active']  ??= true;

        $department = Department::create($validated);
        $department->load(['head:id,name,email,avatar_url']);
        $department->loadCount('activeMembers as member_count');

        return response()->json([
            'data'    => new DepartmentResource($department),
            'message' => 'Department created successfully.',
        ], 201);
    }

    /**
     * Display the specified department with its members and their roles.
     */
    public function show(Department $department): JsonResponse
    {
        $this->authorize('view', $department);

        $department->load([
            'head:id,name,email,avatar_url',
            'members' => function ($query) {
                $query->select('users.id', 'users.name', 'users.email', 'users.avatar_url', 'users.status')
                      ->withPivot('role', 'is_primary', 'joined_at')
                      ->with('roles');
            },
        ]);

        $department->loadCount('activeMembers as member_count');

        $membersWithRoles = $department->members->map(function ($member) {
            return [
                'id'         => $member->id,
                'name'       => $member->name,
                'email'      => $member->email,
                'avatar_url' => $member->avatar_url,
                'status'     => $member->status,
                'pivot'      => [
                    'role'       => $member->pivot->role,
                    'is_primary' => $member->pivot->is_primary,
                    'joined_at'  => $member->pivot->joined_at,
                ],
                'roles' => $member->roles->map(fn($role) => [
                    'id'           => $role->id,
                    'name'         => $role->name,
                    'display_name' => ucwords(str_replace('_', ' ', $role->name)),
                ]),
            ];
        });

        return response()->json([
            'data' => array_merge(
                (new DepartmentResource($department))->resolve(),
                ['members' => $membersWithRoles]
            ),
            'message' => 'Department retrieved successfully.',
        ]);
    }

    /**
     * Update the specified department.
     */
    public function update(Request $request, Department $department): JsonResponse
    {
        $this->authorize('update', $department);

        $validated = $request->validate([
            'name' => [
                'sometimes', 'required', 'string', 'max:100',
                Rule::unique('departments', 'name')->ignore($department->id),
            ],
            'slug' => [
                'sometimes', 'nullable', 'string', 'max:100',
                Rule::unique('departments', 'slug')->ignore($department->id),
                'regex:/^[a-z0-9-]+$/',
            ],
            'description'  => ['sometimes', 'nullable', 'string', 'max:1000'],
            'color'        => ['sometimes', 'nullable', 'string', 'max:7', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'head_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'sort_order'   => ['sometimes', 'nullable', 'integer', 'min:0'],
            'is_active'    => ['sometimes', 'boolean'],
        ]);

        // Regenerate slug if name changed and no explicit slug
        if (isset($validated['name']) && !isset($validated['slug'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $department->update($validated);
        $department->load(['head:id,name,email,avatar_url']);
        $department->loadCount('activeMembers as member_count');

        return response()->json([
            'data'    => new DepartmentResource($department),
            'message' => 'Department updated successfully.',
        ]);
    }

    /**
     * Remove the specified department (soft delete).
     * Prevents deletion if department has active members.
     */
    public function destroy(Department $department): JsonResponse
    {
        $this->authorize('delete', $department);

        $activeMemberCount = $department->activeMembers()->count();

        if ($activeMemberCount > 0) {
            return response()->json([
                'message' => "Cannot delete department with {$activeMemberCount} active member(s). Please reassign or deactivate members first.",
                'errors'  => ['members' => ["Department has {$activeMemberCount} active member(s)."]],
            ], 422);
        }

        $department->delete();

        return response()->json([
            'data'    => null,
            'message' => 'Department deleted successfully.',
        ]);
    }
}
