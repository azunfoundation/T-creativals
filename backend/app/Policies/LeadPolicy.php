<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Lead;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class LeadPolicy
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
     * Determine whether the user can list/view any leads.
     */
    public function viewAny(User $authUser): bool
    {
        return $authUser->hasPermissionTo('leads.view') || $authUser->hasPermissionTo('leads.view_all');
    }

    /**
     * Determine whether the user can view a specific lead.
     */
    public function view(User $authUser, Lead $lead): bool
    {
        if ($authUser->hasPermissionTo('leads.view_all')) {
            return true;
        }

        if ($authUser->hasPermissionTo('leads.view')) {
            return $lead->sales_exec_id === $authUser->id || $lead->sales_head_id === $authUser->id;
        }

        return false;
    }

    /**
     * Determine whether the user can create leads.
     */
    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('leads.create');
    }

    /**
     * Determine whether the user can update a lead.
     */
    public function update(User $authUser, Lead $lead): bool
    {
        if ($authUser->hasPermissionTo('leads.view_all')) {
            return true;
        }

        if ($authUser->hasPermissionTo('leads.edit')) {
            return $lead->sales_exec_id === $authUser->id || $lead->sales_head_id === $authUser->id;
        }

        return false;
    }

    /**
     * Determine whether the user can delete a lead.
     */
    public function delete(User $authUser, Lead $lead): bool
    {
        return $authUser->hasPermissionTo('leads.delete');
    }

    /**
     * Determine whether the user can reassign a lead.
     */
    public function reassign(User $authUser, Lead $lead): bool
    {
        return $authUser->hasPermissionTo('leads.assign');
    }

    /**
     * Determine whether the user can restore a soft-deleted lead.
     */
    public function restore(User $authUser, Lead $lead): bool
    {
        return $authUser->hasPermissionTo('leads.delete');
    }

    /**
     * Determine whether the user can permanently delete a lead.
     */
    public function forceDelete(User $authUser, Lead $lead): bool
    {
        return $authUser->hasPermissionTo('leads.delete');
    }
}
