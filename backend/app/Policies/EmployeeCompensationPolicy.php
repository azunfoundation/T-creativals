<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\EmployeeCompensation;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class EmployeeCompensationPolicy
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

    public function view(User $authUser, EmployeeCompensation $employeeCompensation): bool
    {
        return $authUser->hasPermissionTo('payroll.view') || $authUser->hasPermissionTo('payroll.manage');
    }

    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('payroll.manage');
    }

    public function update(User $authUser, EmployeeCompensation $employeeCompensation): bool
    {
        return $authUser->hasPermissionTo('payroll.manage');
    }
}
