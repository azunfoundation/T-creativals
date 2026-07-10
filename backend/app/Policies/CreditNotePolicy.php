<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\CreditNote;
use App\Models\User;
use Illuminate\Auth\Access\HandlesAuthorization;

class CreditNotePolicy
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
     * Determine whether the user can view any credit notes.
     *
     * Credit notes are invoice-adjacent; mirror invoice viewing permissions.
     */
    public function viewAny(User $authUser): bool
    {
        return $authUser->hasPermissionTo('invoices.view')
            || $authUser->hasPermissionTo('invoices.view_all');
    }

    /**
     * Determine whether the user can view a specific credit note.
     */
    public function view(User $authUser, CreditNote $creditNote): bool
    {
        return $authUser->hasPermissionTo('invoices.view')
            || $authUser->hasPermissionTo('invoices.view_all');
    }

    /**
     * Determine whether the user can create credit notes.
     */
    public function create(User $authUser): bool
    {
        return $authUser->hasPermissionTo('invoices.create');
    }
}
