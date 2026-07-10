<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Department;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class DepartmentPolicy
{
    use HandlesAuthorization;

    /**
     * Founders bypass all policy checks.
     */
    public function before(User $authUser, string $ability): ?bool
    {
        if ($authUser->hasRole('founder')) {
            return true;
        }

        return null; // Let the specific policy method decide
    }

    /**
     * Determine whether the user can list/view any departments.
     */
    public function viewAny(User $authUser): bool
    {
        return $authUser->hasPermissionTo('departments.view');
    }

    /**
     * Determine whether the user can view a specific department.
     */
    public function view(User $authUser, Department $department): bool
    {
        return $authUser->hasPermissionTo('departments.view');
    }

    /**
     * Determine whether the user can create departments.
     */
    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('departments.create');
    }

    /**
     * Determine whether the user can update a department.
     */
    public function update(User $authUser, Department $department): bool
    {
        return $authUser->hasPermissionTo('departments.edit');
    }

    /**
     * Determine whether the user can delete a department.
     */
    public function delete(User $authUser, Department $department): bool
    {
        return $authUser->hasPermissionTo('departments.delete');
    }

    /**
     * Determine whether the user can restore a soft-deleted department.
     */
    public function restore(User $authUser, Department $department): bool
    {
        return $authUser->hasPermissionTo('departments.delete');
    }

    /**
     * Determine whether the user can permanently delete a department.
     */
    public function forceDelete(User $authUser, Department $department): bool
    {
        return $authUser->hasPermissionTo('departments.delete');
    }
}
