<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class UserPolicy
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
     * Determine whether the user can list/view any users.
     */
    public function viewAny(User $authUser): bool
    {
        return $authUser->hasPermissionTo('users.view');
    }

    /**
     * Determine whether the user can view a specific user.
     */
    public function view(User $authUser, User $user): bool
    {
        return $authUser->hasPermissionTo('users.view');
    }

    /**
     * Determine whether the user can create new users.
     */
    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('users.create');
    }

    /**
     * Determine whether the user can update a user.
     */
    public function update(User $authUser, User $user): bool
    {
        if ($authUser->id === $user->id) {
            return true;
        }

        return $authUser->hasPermissionTo('users.edit');
    }

    /**
     * Determine whether the user can delete a user.
     * Prevent users from deleting themselves.
     */
    public function delete(User $authUser, User $user): bool
    {
        if ($authUser->id === $user->id) {
            return false;
        }

        return $authUser->hasPermissionTo('users.delete');
    }

    /**
     * Determine whether the user can restore a soft-deleted user.
     */
    public function restore(User $authUser, User $user): bool
    {
        return $authUser->hasPermissionTo('users.delete');
    }

    /**
     * Determine whether the user can permanently delete a user.
     */
    public function forceDelete(User $authUser, User $user): bool
    {
        return $authUser->hasPermissionTo('users.delete');
    }
}
