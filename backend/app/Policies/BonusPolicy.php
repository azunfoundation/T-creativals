<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Bonus;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class BonusPolicy
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
        return $authUser->hasPermissionTo('payroll.view') || $authUser->hasPermissionTo('payroll.manage');
    }

    public function view(User $authUser, Bonus $bonus): bool
    {
        if ($authUser->hasPermissionTo('payroll.view') || $authUser->hasPermissionTo('payroll.manage')) {
            return true;
        }

        return $bonus->user_id === $authUser->id;
    }

    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('payroll.manage');
    }

    public function approve(User $authUser, Bonus $bonus): bool
    {
        return $authUser->hasPermissionTo('payroll.manage');
    }
}
