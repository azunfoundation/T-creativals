<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Holiday;
use App\Models\User;

class HolidayPolicy
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
     * Any authenticated user can view the corporate holiday calendar.
     */
    public function viewAny(User $user): bool
    {
        return true;
    }

    /**
     * Determine whether the user can create/edit/delete holidays.
     */
    public function manage(User $user): bool
    {
        return $user->hasPermissionTo('holidays.manage');
    }
}
