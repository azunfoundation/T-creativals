<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Payment;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class PaymentPolicy
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
     * Determine whether the user can view any payments.
     */
    public function viewAny(User $authUser): bool
    {
        return $authUser->hasPermissionTo('invoices.view') 
            || $authUser->hasPermissionTo('invoices.view_all')
            || $authUser->hasRole('client')
            || $authUser->is_client_portal_user;
    }

    /**
     * Determine whether the user can view a specific payment.
     */
    public function view(User $authUser, Payment $payment): bool
    {
        if ($authUser->hasPermissionTo('invoices.view_all')) {
            return true;
        }

        // Clients can view their own payments (linked via invoice)
        if ($payment->invoice && $payment->invoice->client_id === $authUser->id) {
            return true;
        }

        if ($authUser->hasPermissionTo('invoices.view')) {
            return $payment->recorded_by === $authUser->id;
        }

        return false;
    }

    /**
     * Determine whether the user can create/record payments.
     */
    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('invoices.payment');
    }

    /**
     * Determine whether the user can update payments.
     */
    public function update(User $authUser, Payment $payment): bool
    {
        return $authUser->hasPermissionTo('invoices.payment');
    }

    /**
     * Determine whether the user can delete payments.
     */
    public function delete(User $authUser, Payment $payment): bool
    {
        return $authUser->hasPermissionTo('invoices.delete');
    }
}
