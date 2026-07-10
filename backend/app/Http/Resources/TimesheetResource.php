<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TimesheetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'task_id' => $this->task_id,
            'project_id' => $this->project_id,
            'date' => $this->date?->toDateString(),
            'hours_logged' => $this->hours_logged,
            'description' => $this->description,
            'is_billable' => $this->is_billable,
            'status' => $this->status,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),

            // Dynamic/Required fields
            'user_name' => $this->user?->name,
            'task_title' => $this->task?->title,
            'project_name' => $this->project?->name,
            'approved_by_name' => $this->approver?->name,
        ];
    }
}
