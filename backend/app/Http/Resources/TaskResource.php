<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'task_number' => $this->task_number,
            'project_id' => $this->project_id,
            'milestone_id' => $this->milestone_id,
            'parent_task_id' => $this->parent_task_id,
            'title' => $this->title,
            'description' => $this->description,
            'assigned_to' => $this->assigned_to,
            'created_by' => $this->created_by,
            'status' => $this->status,
            'priority' => $this->priority,
            'due_date' => $this->due_date?->toDateString(),
            'estimated_hours' => $this->estimated_hours,
            'actual_hours' => $this->actual_hours,
            'completion_percentage' => $this->completion_percentage,
            'sort_order' => $this->sort_order,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            
            // Dynamic/Required fields
            'assignee_name' => $this->assignee?->name,
            'project_name' => $this->project?->name,
            'comments_count' => $this->comments_count ?? $this->comments()->count(),
            'time_logged' => (float) ($this->timesheets_sum_hours_logged ?? $this->timesheets()->sum('hours_logged')),
        ];
    }
}
