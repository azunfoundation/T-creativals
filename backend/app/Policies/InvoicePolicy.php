<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Invoice;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class InvoicePolicy
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
     * Determine whether the user can view any invoices.
     */
    public function viewAny(User $authUser): bool
    {
        return $authUser->hasPermissionTo('invoices.view') 
            || $authUser->hasPermissionTo('invoices.view_all')
            || $authUser->hasRole('client')
            || $authUser->is_client_portal_user;
    }

    /**
     * Determine whether the user can view a specific invoice.
     */
    public function view(User $authUser, Invoice $invoice): bool
    {
        if ($authUser->hasPermissionTo('invoices.view_all')) {
            return true;
        }

        // Clients can view their own invoices
        if ($invoice->client_id === $authUser->id) {
            return true;
        }

        if ($authUser->hasPermissionTo('invoices.view')) {
            return $invoice->created_by === $authUser->id;
        }

        return false;
    }

    /**
     * Determine whether the user can create invoices.
     */
    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('invoices.create');
    }

    /**
     * Determine whether the user can update invoices.
     */
    public function update(User $authUser, Invoice $invoice): bool
    {
        return $authUser->hasPermissionTo('invoices.edit');
    }

    /**
     * Determine whether the user can delete invoices.
     */
    public function delete(User $authUser, Invoice $invoice): bool
    {
        return $authUser->hasPermissionTo('invoices.delete');
    }

    /**
     * Determine whether the user can record payments for the invoice.
     */
    public function recordPayment(User $authUser, Invoice $invoice): bool
    {
        return $authUser->hasPermissionTo('invoices.payment');
    }

    /**
     * Determine whether the user can review the invoice (Head role).
     */
    public function review(User $authUser, Invoice $invoice): bool
    {
        return $authUser->hasAnyRole(['sales_head', 'department_head', 'founder', 'director']);
    }

    /**
     * Determine whether the user can approve the invoice (Founder/Director role).
     */
    public function approve(User $authUser, Invoice $invoice): bool
    {
        return $authUser->hasAnyRole(['founder', 'director']);
    }

    /**
     * Determine whether the user can reject the invoice.
     */
    public function reject(User $authUser, Invoice $invoice): bool
    {
        return $authUser->hasAnyRole(['sales_head', 'department_head', 'founder', 'director']);
    }
}
