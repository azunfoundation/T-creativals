<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;
use Spatie\Permission\Models\Role;

class RolePolicy
{
    use HandlesAuthorization;

    public function before(User $authUser, string $ability): ?bool
    {
        if ($authUser->hasRole('founder')) {
            return true;
        }
        return null;
    }

    public function viewAny(User $authUser): bool
    {
        return $authUser->hasPermissionTo('roles.view');
    }

    public function view(User $authUser, Role $role): bool
    {
        return $authUser->hasPermissionTo('roles.view');
    }

    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('roles.manage');
    }

    public function update(User $authUser, Role $role): bool
    {
        return $authUser->hasPermissionTo('roles.manage');
    }

    public function delete(User $authUser, Role $role): bool
    {
        return $authUser->hasPermissionTo('roles.manage');
    }
}
