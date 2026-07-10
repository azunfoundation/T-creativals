<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AuditLog;
use App\Models\Department;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use App\Mail\WelcomeUserMail;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', User::class);

        $users = User::query()
            ->nonPortal()
            ->when($request->status, fn($q, $v) => $q->where('status', $v))
            ->when($request->department_id, fn($q, $v) =>
                $q->whereHas('departments', fn($dq) => $dq->where('departments.id', $v))
            )
            ->when($request->role_id, fn($q, $v) => $q->whereHas('roles', fn($rq) => $rq->where('roles.id', $v)))
            ->when($request->search, fn($q, $v) =>
                $q->where(fn($sq) =>
                    $sq->where('name', 'like', "%{$v}%")
                       ->orWhere('email', 'like', "%{$v}%")
                       ->orWhere('employee_id', 'like', "%{$v}%")
                )
            )
            ->with(['roles', 'departments'])
            ->orderBy('name')
            ->paginate($request->per_page ?? 25);

        return UserResource::collection($users)->response();
    }

    /**
     * Invite (create) a user with a safe find-or-restore-or-create flow.
     *
     * The users.email and users.employee_id columns carry hard UNIQUE indexes
     * that also cover soft-deleted rows, so conflicts are resolved here instead
     * of letting the database throw an integrity violation:
     *  - email belongs to an active user  → clean 422 (with resend-invite hint)
     *  - email belongs to a trashed user  → restore, update, re-invite
     *  - email unused                     → create
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'name'                   => ['required', 'string', 'max:255'],
            'email'                  => ['required', 'email', 'max:255'],
            'password'               => ['required', 'string', 'min:8'],
            'phone'                  => ['nullable', 'string', 'max:20'],
            'employee_id'            => ['nullable', 'string', 'max:50'],
            'status'                 => ['nullable', Rule::in(['active', 'inactive'])],
            'role_ids'               => ['nullable', 'array'],
            'role_ids.*'             => ['exists:roles,id'],
            'department_ids'         => ['nullable', 'array'],
            'department_ids.*'       => ['exists:departments,id'],
            'manager_ids'            => ['nullable', 'array'],
            'manager_ids.*'          => ['exists:users,id'],
            'is_client_portal_user'  => ['nullable', 'boolean'],
        ]);

        $existing = User::withTrashed()->where('email', $validated['email'])->first();

        if ($existing && ! $existing->trashed()) {
            return response()->json([
                'message'           => 'A user with this email already exists.',
                'errors'            => ['email' => ['A user with this email already exists.']],
                'existing_user_id'  => $existing->id,
                'can_resend_invite' => true,
            ], 422);
        }

        // employee_id shares the same soft-delete-spanning unique index
        if (! empty($validated['employee_id'])) {
            $employeeIdTaken = User::withTrashed()
                ->where('employee_id', $validated['employee_id'])
                ->when($existing, fn ($q) => $q->where('id', '!=', $existing->id))
                ->exists();

            if ($employeeIdTaken) {
                return response()->json([
                    'message' => 'This Employee ID is already in use.',
                    'errors'  => ['employee_id' => ['This Employee ID is already in use.']],
                ], 422);
            }
        }

        $attributes = [
            'name'                  => $validated['name'],
            'email'                 => $validated['email'],
            'password'              => Hash::make($validated['password']),
            'phone'                 => $validated['phone'] ?? null,
            'employee_id'           => $validated['employee_id'] ?? null,
            'status'                => $validated['status'] ?? 'active',
            'is_client_portal_user' => $validated['is_client_portal_user'] ?? false,
        ];

        $wasRestored = false;

        if ($existing) {
            // Soft-deleted user with this email → restore and update in place.
            $existing->restore();
            $existing->update($attributes + ['must_change_password' => true]);
            $user = $existing;
            $wasRestored = true;
        } else {
            $user = User::create($attributes);
        }

        // Roles / departments / managers — sync semantics work for both the
        // freshly created and the restored user (clears stale assignments).
        $roles = ! empty($validated['role_ids'])
            ? Role::whereIn('id', $validated['role_ids'])->pluck('name')
            : collect();
        $this->assertCanAssignRoles($request->user(), $roles);
        $user->syncRoles($roles);

        $departmentSync = collect($validated['department_ids'] ?? [])->mapWithKeys(fn ($id, $index) => [
            $id => ['is_primary' => $index === 0],
        ])->toArray();
        $user->departments()->sync($departmentSync);

        $managerSync = collect($validated['manager_ids'] ?? [])->mapWithKeys(fn ($id) => [
            $id => ['relationship_type' => 'direct', 'is_primary' => true],
        ])->toArray();
        $user->managers()->sync($managerSync);

        $emailSent = $this->queueWelcomeEmail($user, $validated['password']);

        $message = $wasRestored
            ? 'This user previously existed and was deactivated — their account has been restored and a new invite sent.'
            : 'User created successfully.';

        if (! $emailSent) {
            $message .= ' However, the welcome email could NOT be sent — please check the SMTP settings and use "Resend Welcome Email".';
        }

        return response()->json([
            'data'       => new UserResource($user->load(['roles', 'departments'])),
            'message'    => $message,
            'email_sent' => $emailSent,
        ], $wasRestored ? 200 : 201);
    }

    /**
     * Resend the welcome email with a fresh temporary password.
     * POST /api/v1/users/{user}/resend-invite
     */
    public function resendInvite(Request $request, User $user): JsonResponse
    {
        $this->authorize('update', $user);

        $password = \Illuminate\Support\Str::password(12);

        $user->update([
            'password'             => Hash::make($password),
            'must_change_password' => true,
        ]);

        if (! $this->queueWelcomeEmail($user, $password)) {
            return response()->json([
                'message' => 'The invite could not be emailed (mail configuration issue). A new temporary password was still set.',
            ], 502);
        }

        return response()->json([
            'message' => 'Welcome email resent with a new temporary password. The user must change it on first login.',
        ]);
    }

    /** Queue the welcome email without ever failing the request. */
    private function queueWelcomeEmail(User $user, string $plainPassword): bool
    {
        try {
            Mail::to($user->email)->queue(new WelcomeUserMail($user, $plainPassword));

            return true;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error(
                'Failed to queue welcome email to ' . $user->email . ': ' . $e->getMessage()
            );

            return false;
        }
    }

    public function show(User $user): JsonResponse
    {
        $this->authorize('view', $user);

        return response()->json([
            'data' => new UserResource(
                $user->load(['roles', 'departments', 'managers', 'loginActivities' => fn($q) => $q->latest('logged_at')->limit(5)])
            ),
        ]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorize('update', $user);

        $validated = $request->validate([
            'name'                  => ['sometimes', 'string', 'max:255'],
            'email'                 => ['sometimes', 'email', 'max:255', 'unique:users,email,' . $user->id],
            'phone'                 => ['nullable', 'string', 'max:20'],
            'employee_id'           => ['nullable', 'string', Rule::unique('users', 'employee_id')->ignore($user->id)],
            'status'                => ['nullable', Rule::in(['active', 'inactive', 'suspended'])],
            'avatar_url'            => ['nullable', 'string', 'max:2048'],
            'is_client_portal_user' => ['nullable', 'boolean'],
        ]);

        $user->update($validated);

        if ($request->has('role_ids')) {
            $this->authorizeRoleAssignment($request);
            $roles = Role::whereIn('id', $request->role_ids)->pluck('name');
            $this->assertCanAssignRoles($request->user(), $roles);
            $user->syncRoles($roles);
        }

        if ($request->has('department_ids')) {
            $this->authorizeRoleAssignment($request);
            $syncData = collect($request->department_ids)->mapWithKeys(fn($id, $index) => [
                $id => ['is_primary' => $index === 0],
            ])->toArray();
            $user->departments()->sync($syncData);
        }

        return response()->json([
            'data'    => new UserResource($user->load(['roles', 'departments'])),
            'message' => 'User updated successfully.',
        ]);
    }

    /**
     * Changing a user's own roles/departments is a privileged action, not a
     * self-profile edit — UserPolicy::update() intentionally lets any user
     * update their own name/phone/etc, but that self-bypass must never
     * extend to role/department assignment or a plain employee could grant
     * themselves any role via their own profile update.
     */
    private function authorizeRoleAssignment(Request $request): void
    {
        if (!$request->user()->hasPermissionTo('users.edit')) {
            abort(403, 'You are not authorized to change roles or departments.');
        }
    }

    /**
     * Only a founder may grant the founder role — every Policy's before()
     * hook makes founder an unconditional bypass of all authorization, so
     * granting it is equivalent to granting full admin; users.edit alone
     * (held by director/hr) must not be sufficient to create a new founder.
     */
    private function assertCanAssignRoles(User $authUser, \Illuminate\Support\Collection $roleNames): void
    {
        if ($roleNames->contains('founder') && !$authUser->hasRole('founder')) {
            abort(403, 'Only a founder can grant the founder role.');
        }
    }

    /**
     * Admin resets another user's password.
     * POST /api/v1/users/{user}/reset-password
     */
    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $this->authorize('update', $user);

        // Only founder/director/hr can reset passwords
        if (!$request->user()->hasAnyRole(['founder', 'director', 'hr'])) {
            return response()->json(['message' => 'You are not authorized to reset passwords.'], 403);
        }

        $validated = $request->validate([
            'password'              => ['required', 'string', 'min:8', 'confirmed'],
            'password_confirmation' => ['required', 'string'],
        ]);

        $user->update([
            'password'              => Hash::make($validated['password']),
            'must_change_password'  => true,  // Force change on next login
        ]);

        return response()->json(['message' => 'Password reset successfully. User will be prompted to change it on next login.']);
    }

    public function destroy(User $user): JsonResponse
    {
        $this->authorize('delete', $user);

        if ($user->isFounder()) {
            return response()->json(['message' => 'The founder account cannot be deleted.'], 403);
        }

        $user->delete();

        return response()->json(['message' => 'User deleted successfully.']);
    }

    public function syncRoles(Request $request, User $user): JsonResponse
    {
        $this->authorize('update', $user);
        $this->authorizeRoleAssignment($request);

        $request->validate([
            'role_ids'   => ['required', 'array'],
            'role_ids.*' => ['exists:roles,id'],
        ]);

        $roles = Role::whereIn('id', $request->role_ids)->pluck('name');
        $this->assertCanAssignRoles($request->user(), $roles);
        $user->syncRoles($roles);

        return response()->json([
            'data'    => $user->getRoleNames(),
            'message' => 'Roles updated successfully.',
        ]);
    }

    public function syncDepartments(Request $request, User $user): JsonResponse
    {
        $this->authorize('update', $user);
        $this->authorizeRoleAssignment($request);

        $request->validate([
            'department_ids'   => ['required', 'array'],
            'department_ids.*' => ['exists:departments,id'],
        ]);

        $syncData = collect($request->department_ids)->mapWithKeys(fn($id, $index) => [
            $id => ['is_primary' => $index === 0],
        ])->toArray();

        $user->departments()->sync($syncData);

        return response()->json(['message' => 'Departments updated successfully.']);
    }
}
