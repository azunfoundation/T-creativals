<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\AttendanceRecord;
use App\Models\User;

class AttendancePolicy
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
     * Determine whether the user can view their own attendance records.
     */
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('attendance.view') || $user->hasPermissionTo('attendance.view_all');
    }

    /**
     * Determine whether the user can view the company-wide team registry.
     */
    public function viewTeam(User $user): bool
    {
        return $user->hasPermissionTo('attendance.view_all');
    }

    /**
     * Determine whether the user can create/backfill a record for any user.
     */
    public function create(User $user): bool
    {
        return $user->hasPermissionTo('attendance.manage');
    }

    /**
     * Determine whether the user can correct an existing record.
     */
    public function update(User $user, AttendanceRecord $record): bool
    {
        return $user->hasPermissionTo('attendance.manage');
    }

    /**
     * Determine whether the user can delete a record.
     */
    public function delete(User $user, AttendanceRecord $record): bool
    {
        return $user->hasPermissionTo('attendance.manage');
    }
}
