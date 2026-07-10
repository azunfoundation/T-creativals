<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\RecurringBillingRule;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class RecurringBillingRulePolicy
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

        return null;
    }

    /**
     * Determine whether the user can view any rules.
     */
    public function viewAny(User $authUser): bool
    {
        return $authUser->hasPermissionTo('invoices.view') 
            || $authUser->hasPermissionTo('invoices.view_all');
    }

    /**
     * Determine whether the user can view a specific rule.
     */
    public function view(User $authUser, RecurringBillingRule $rule): bool
    {
        if ($authUser->hasPermissionTo('invoices.view_all')) {
            return true;
        }

        if ($authUser->hasPermissionTo('invoices.view')) {
            return $rule->created_by === $authUser->id;
        }

        return false;
    }

    /**
     * Determine whether the user can create rules.
     */
    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('invoices.create');
    }

    /**
     * Determine whether the user can update rules.
     */
    public function update(User $authUser, RecurringBillingRule $rule): bool
    {
        return $authUser->hasPermissionTo('invoices.edit');
    }

    /**
     * Determine whether the user can delete rules.
     */
    public function delete(User $authUser, RecurringBillingRule $rule): bool
    {
        return $authUser->hasPermissionTo('invoices.delete');
    }
}
