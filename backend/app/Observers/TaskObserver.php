<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Task;
use App\Models\Milestone;

class TaskObserver
{
    /**
     * Handle the Task "updating" event.
     */
    public function updating(Task $task): void
    {
        if ($task->isDirty('completion_percentage') && (int) $task->completion_percentage === 100) {
            $task->status = 'done';
        }
    }

    /**
     * Handle the Task "updated" event.
     */
    public function updated(Task $task): void
    {
        if ($task->isDirty('completion_percentage') && $task->milestone_id) {
            $milestone = Milestone::find($task->milestone_id);
            if ($milestone) {
                $average = (int) round($milestone->tasks()->avg('completion_percentage') ?? 0);
                $milestone->update(['completion_percentage' => $average]);
            }
        }
    }
}
