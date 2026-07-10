<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Alert;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadStage;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

class LeadObserver
{
    /**
     * Handle the Lead "created" event.
     */
    public function created(Lead $lead): void
    {
        if ($lead->sales_exec_id) {
            $currentUserId = Auth::id();

            // Trigger alert for the assigned sales executive
            Alert::create([
                'user_id' => $lead->sales_exec_id,
                'triggered_by' => $currentUserId,
                'type' => 'lead_assigned',
                'title' => 'New Lead Assigned',
                'body' => "Lead for {$lead->company_name} has been assigned to you.",
                'action_url' => "/leads/{$lead->id}",
                'metadata' => ['lead_id' => $lead->id],
            ]);

            $execName = User::find($lead->sales_exec_id)?->name ?? 'Unknown Exec';

            // Log activity 'assignment_change'
            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $currentUserId,
                'type' => 'assignment_change',
                'description' => "Lead assigned to sales executive {$execName}.",
                'metadata' => ['sales_exec_id' => $lead->sales_exec_id],
                'occurred_at' => now(),
            ]);
        }
    }

    /**
     * Handle the Lead "updated" event.
     */
    public function updated(Lead $lead): void
    {
        $currentUserId = Auth::id();

        // 1. If stage_id changed
        if ($lead->wasChanged('stage_id')) {
            $oldStageId = $lead->getOriginal('stage_id');
            $newStageId = $lead->stage_id;

            $oldStageName = $oldStageId ? (LeadStage::find($oldStageId)?->name ?? 'Unknown') : 'None';
            $newStageName = $lead->stage?->name ?? 'Unknown';

            // Log activity 'stage_change'
            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $currentUserId,
                'type' => 'stage_change',
                'description' => "Lead stage changed from {$oldStageName} to {$newStageName}.",
                'metadata' => [
                    'old_stage_id' => $oldStageId,
                    'new_stage_id' => $newStageId,
                ],
                'occurred_at' => now(),
            ]);

            // Create alert for assigned sales exec and sales head
            $usersToAlert = array_filter(array_unique([
                $lead->sales_exec_id,
                $lead->sales_head_id,
            ]));

            foreach ($usersToAlert as $userId) {
                Alert::create([
                    'user_id' => $userId,
                    'triggered_by' => $currentUserId,
                    'type' => 'lead_stage_changed',
                    'title' => 'Lead Stage Changed',
                    'body' => "Lead {$lead->company_name} stage updated to {$newStageName}.",
                    'action_url' => "/leads/{$lead->id}",
                    'metadata' => ['lead_id' => $lead->id],
                ]);
            }
        }

        // 2. If sales_exec_id changed
        if ($lead->wasChanged('sales_exec_id')) {
            $oldExecId = $lead->getOriginal('sales_exec_id');
            $newExecId = $lead->sales_exec_id;

            if ($newExecId) {
                $isNewAssignment = is_null($oldExecId);
                $type = $isNewAssignment ? 'lead_assigned' : 'lead_reassigned';
                $title = $isNewAssignment ? 'New Lead Assigned' : 'Lead Reassigned';
                $bodyText = $isNewAssignment 
                    ? "Lead for {$lead->company_name} has been assigned to you."
                    : "Lead for {$lead->company_name} has been reassigned to you.";

                // Trigger alert for the new executive
                Alert::create([
                    'user_id' => $newExecId,
                    'triggered_by' => $currentUserId,
                    'type' => $type,
                    'title' => $title,
                    'body' => $bodyText,
                    'action_url' => "/leads/{$lead->id}",
                    'metadata' => ['lead_id' => $lead->id],
                ]);

                $newExecName = User::find($newExecId)?->name ?? 'Unknown Exec';
                $oldExecName = $oldExecId ? (User::find($oldExecId)?->name ?? 'Unknown Exec') : 'None';

                // Log activity 'assignment_change'
                $activityDesc = $isNewAssignment 
                    ? "Lead assigned to sales executive {$newExecName}."
                    : "Lead reassigned from {$oldExecName} to {$newExecName}.";

                LeadActivity::create([
                    'lead_id' => $lead->id,
                    'user_id' => $currentUserId,
                    'type' => 'assignment_change',
                    'description' => $activityDesc,
                    'metadata' => [
                        'old_sales_exec_id' => $oldExecId,
                        'new_sales_exec_id' => $newExecId,
                    ],
                    'occurred_at' => now(),
                ]);
            }
        }
    }
}
