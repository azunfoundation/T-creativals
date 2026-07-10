<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Timesheet;
use App\Models\Task;

class TimesheetObserver
{
    /**
     * Handle the Timesheet "created" event.
     */
    public function created(Timesheet $timesheet): void
    {
        $this->updateTaskHours($timesheet->task_id);
    }

    /**
     * Handle the Timesheet "updated" event.
     */
    public function updated(Timesheet $timesheet): void
    {
        $this->updateTaskHours($timesheet->task_id);
        if ($timesheet->isDirty('task_id') && $timesheet->getOriginal('task_id')) {
            $this->updateTaskHours((int) $timesheet->getOriginal('task_id'));
        }
    }

    /**
     * Handle the Timesheet "deleted" event.
     */
    public function deleted(Timesheet $timesheet): void
    {
        $this->updateTaskHours($timesheet->task_id);
    }

    /**
     * Recalculate and update the task actual hours.
     */
    protected function updateTaskHours(?int $taskId): void
    {
        if (!$taskId) {
            return;
        }

        $task = Task::find($taskId);
        if ($task) {
            $totalHours = Timesheet::where('task_id', $taskId)
                ->whereIn('status', ['submitted', 'approved'])
                ->sum('hours_logged');

            $task->update(['actual_hours' => $totalHours]);
        }
    }
}
