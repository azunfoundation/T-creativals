<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Timesheet;
use App\Models\User;

class TimesheetPolicy
{
    /**
     * Perform pre-authorization checks.
     */
    public function before(User $user, string $ability): ?bool
    {
        if ($user->hasRole('founder')) {
            return true;
        }

        return null;
    }

    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('timesheets.view') || $user->hasPermissionTo('timesheets.view_all');
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, Timesheet $timesheet): bool
    {
        if ($user->hasPermissionTo('timesheets.view_all')) {
            return true;
        }

        return $timesheet->user_id === $user->id;
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $user->hasPermissionTo('timesheets.log');
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, Timesheet $timesheet): bool
    {
        // Own draft only
        return $timesheet->user_id === $user->id && $timesheet->status === 'draft';
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, Timesheet $timesheet): bool
    {
        // Own draft only
        return $timesheet->user_id === $user->id && $timesheet->status === 'draft';
    }

    /**
     * Determine whether the user can approve models.
     */
    public function approve(User $user): bool
    {
        return $user->hasPermissionTo('timesheets.approve');
    }

    /**
     * Determine whether the user can view pending models.
     */
    public function pending(User $user): bool
    {
        return $user->hasPermissionTo('timesheets.approve');
    }
}
