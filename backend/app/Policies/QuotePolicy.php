<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Quote;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class QuotePolicy
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
     * Determine whether the user can list/view any quotes.
     */
    public function viewAny(User $authUser): bool
    {
        return $authUser->hasPermissionTo('quotes.view') || $authUser->hasPermissionTo('quotes.view_all');
    }

    /**
     * Determine whether the user can view a specific quote.
     */
    public function view(User $authUser, Quote $quote): bool
    {
        if ($authUser->hasPermissionTo('quotes.view_all')) {
            return true;
        }

        if ($authUser->hasPermissionTo('quotes.view')) {
            // Can view if created by them, or if they are the sales exec / sales head of the associated lead
            if ($quote->created_by === $authUser->id) {
                return true;
            }

            if ($quote->lead) {
                return $quote->lead->sales_exec_id === $authUser->id || $quote->lead->sales_head_id === $authUser->id;
            }
        }

        return false;
    }

    /**
     * Determine whether the user can create quotes.
     */
    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('quotes.create');
    }

    /**
     * Determine whether the user can update a quote.
     *
     * Rules: user can edit if draft or rejected, and created it. Sales Head/Founder can edit any.
     */
    public function update(User $authUser, Quote $quote): bool
    {
        // Founder is handled by before() and returns true

        // Sales Head can edit any quote
        if ($authUser->hasRole('sales_head')) {
            return true;
        }

        // Other users can edit if the quote is draft or rejected, and they created it
        if (in_array($quote->status, ['draft', 'rejected'], true)) {
            return $quote->created_by === $authUser->id;
        }

        return false;
    }

    /**
     * Determine whether the user can delete a quote.
     *
     * Rules: user is Sales Head or Founder.
     */
    public function delete(User $authUser, Quote $quote): bool
    {
        return $authUser->hasRole('sales_head');
    }

    /**
     * Determine whether the user can approve a quote.
     *
     * Rules: user is Sales Head or Founder (has permission 'quotes.approve').
     */
    public function approve(User $authUser, Quote $quote): bool
    {
        return $authUser->hasPermissionTo('quotes.approve');
    }

    /**
     * Determine whether the user can submit a quote for approval.
     *
     * Rules: quote creator, founder (handled by before()), or sales_head.
     */
    public function submitApproval(User $authUser, Quote $quote): bool
    {
        return $quote->created_by === $authUser->id || $authUser->hasRole('sales_head');
    }
}
