<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\LeaveRequest;
use App\Models\User;

class LeavePolicy
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
     * Determine whether the user can view their own leave requests.
     */
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('leave.view') || $user->hasPermissionTo('leave.view_all');
    }

    /**
     * Determine whether the user can view every user's leave requests.
     */
    public function viewAll(User $user): bool
    {
        return $user->hasPermissionTo('leave.view_all');
    }

    /**
     * Determine whether the user can view a specific request.
     */
    public function view(User $user, LeaveRequest $leaveRequest): bool
    {
        if ($user->hasPermissionTo('leave.view_all')) {
            return true;
        }

        return $leaveRequest->user_id === $user->id;
    }

    /**
     * Determine whether the user can request leave.
     */
    public function create(User $user): bool
    {
        return $user->hasPermissionTo('leave.view');
    }

    /**
     * Determine whether the user can edit the request (own, still pending).
     */
    public function update(User $user, LeaveRequest $leaveRequest): bool
    {
        return $leaveRequest->user_id === $user->id && $leaveRequest->status === 'pending';
    }

    /**
     * Determine whether the user can cancel/delete the request (own, still pending).
     */
    public function delete(User $user, LeaveRequest $leaveRequest): bool
    {
        return $leaveRequest->user_id === $user->id && $leaveRequest->status === 'pending';
    }

    /**
     * Determine whether the user can approve/reject leave requests.
     */
    public function approve(User $user): bool
    {
        return $user->hasPermissionTo('leave.approve');
    }
}
