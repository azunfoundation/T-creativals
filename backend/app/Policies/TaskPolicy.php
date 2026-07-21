<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Task;
use App\Models\User;

class TaskPolicy
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
        return $user->hasPermissionTo('tasks.view');
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, Task $task): bool
    {
        if (!$user->hasPermissionTo('tasks.view')) {
            return false;
        }

        if ($user->hasRole('director') || $user->hasRole('admin') || $user->hasPermissionTo('tasks.view_all')) {
            return true;
        }

        if ($task->assigned_to === $user->id
            || $task->created_by === $user->id
            || ($task->project && $task->project->manager_id === $user->id)
            || ($task->project && $task->project->members()->where('user_id', $user->id)->exists())) {
            return true;
        }

        if ($user->hasRole('department_head') && $task->assignee) {
            $deptIds = $user->departments()->pluck('departments.id')->toArray();
            if (!empty($deptIds) && $task->assignee->departments()->whereIn('departments.id', $deptIds)->exists()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $user->hasPermissionTo('tasks.create');
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, Task $task): bool
    {
        if ($user->hasPermissionTo('tasks.edit')) {
            return true;
        }

        // Assigned user can update status/completion only (controlled at the controller level)
        return $task->assigned_to === $user->id && $user->hasPermissionTo('tasks.view');
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, Task $task): bool
    {
        return $user->hasPermissionTo('tasks.delete');
    }
}
