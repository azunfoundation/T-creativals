<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canViewFinancials = $user && ($user->hasPermissionTo('projects.profitability') || $user->hasPermissionTo('reports.view_financial'));

        return [
            'id' => $this->id,
            'project_number' => $this->project_number,
            'name' => $this->name,
            'description' => $this->description,
            'client_id' => $this->client_id,
            'client' => $this->whenLoaded('client', fn () => $this->client ? [
                'id' => $this->client->id,
                'name' => $this->client->name,
                'email' => $this->client->email,
            ] : null),
            'invoice_id' => $canViewFinancials ? $this->invoice_id : null,
            'invoice' => $canViewFinancials ? $this->whenLoaded('invoice', fn () => $this->invoice ? [
                'id' => $this->invoice->id,
                'invoice_number' => $this->invoice->invoice_number,
            ] : null) : null,
            'manager_id' => $this->manager_id,
            'manager' => $this->whenLoaded('manager', fn () => $this->manager ? [
                'id' => $this->manager->id,
                'name' => $this->manager->name,
                'email' => $this->manager->email,
            ] : null),
            'status' => $this->status,
            'priority' => $this->priority ?? 'medium',
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'budget_hours' => $this->budget_hours,
            'budget_amount' => $canViewFinancials ? $this->budget_amount : null,
            'completion_percentage' => $this->completion_percentage,
            'is_recurring' => $this->is_recurring,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'members' => ProjectMemberResource::collection($this->whenLoaded('members')),
            'milestones_count' => $this->milestones_count ?? $this->milestones()->count(),
            'tasks_count' => $this->tasks_count ?? $this->tasks()->count(),
            'budget_used_hours' => (float) ($this->timesheets_sum_hours_logged ?? $this->timesheets()->whereIn('status', ['submitted', 'approved'])->sum('hours_logged')),
        ];
    }
}
