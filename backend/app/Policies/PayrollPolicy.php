<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\PayrollRun;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class PayrollPolicy
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

    public function view(User $authUser, PayrollRun $payrollRun): bool
    {
        return $authUser->hasPermissionTo('payroll.view') || $authUser->hasPermissionTo('payroll.manage');
    }

    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('payroll.manage');
    }

    public function update(User $authUser, PayrollRun $payrollRun): bool
    {
        return $authUser->hasPermissionTo('payroll.manage');
    }

    public function delete(User $authUser, PayrollRun $payrollRun): bool
    {
        return $authUser->hasPermissionTo('payroll.manage');
    }

    public function approve(User $authUser, PayrollRun $payrollRun): bool
    {
        // payroll.approve is deliberately withheld from finance and director in
        // RolesPermissionsSeeder (segregation of duty: whoever prepares payroll
        // shouldn't be the one who signs off on it) — this must stay
        // permission-based, not hasRole('director'), or that exclusion is a no-op.
        return $authUser->hasPermissionTo('payroll.approve');
    }
}
