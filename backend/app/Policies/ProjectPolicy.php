<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Project;
use App\Models\User;

class ProjectPolicy
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
        return $user->hasPermissionTo('projects.view_all') || $user->hasPermissionTo('projects.view');
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, Project $project): bool
    {
        if ($user->hasPermissionTo('projects.view_all')) {
            return true;
        }

        if ($user->hasPermissionTo('projects.view')) {
            return $project->manager_id === $user->id
                || $project->client_id === $user->id
                || $project->members()->where('user_id', $user->id)->exists();
        }

        return false;
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $user->hasPermissionTo('projects.create');
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, Project $project): bool
    {
        return $user->hasPermissionTo('projects.edit');
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, Project $project): bool
    {
        return $user->hasPermissionTo('projects.delete');
    }

    /**
     * Determine whether the user can add or remove members from the project.
     */
    public function addMember(User $user, Project $project): bool
    {
        return $user->hasPermissionTo('projects.edit');
    }

    /**
     * Determine whether the user can view project profitability.
     */
    public function profitability(User $user, Project $project): bool
    {
        return $user->hasPermissionTo('projects.profitability');
    }
}
