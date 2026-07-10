<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Alert;
use App\Models\Quote;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

class QuoteObserver
{
    /**
     * Handle the Quote "updated" event.
     */
    public function updated(Quote $quote): void
    {
        // Check if the status has changed
        if ($quote->isDirty('status')) {
            $newStatus = $quote->status;
            $creator = $quote->creator;
            $triggeredBy = Auth::id();

            if ($newStatus === 'pending_approval') {
                // Find assigned Sales Head or Founder
                $recipientId = null;

                // 1. Check if lead has an assigned sales head
                if ($quote->lead && $quote->lead->sales_head_id) {
                    $recipientId = $quote->lead->sales_head_id;
                }

                // 2. Otherwise, find the user with email sales@creativals.com or role sales_head
                if (!$recipientId) {
                    $salesHead = User::where('email', 'sales@creativals.com')->first()
                        ?? User::role('sales_head')->first();
                    if ($salesHead) {
                        $recipientId = $salesHead->id;
                    }
                }

                // 3. Fallback to Founder
                if (!$recipientId) {
                    $founder = User::where('email', 'founder@creativals.com')->first()
                        ?? User::role('founder')->first();
                    if ($founder) {
                        $recipientId = $founder->id;
                    }
                }

                if ($recipientId) {
                    Alert::create([
                        'user_id' => $recipientId,
                        'triggered_by' => $triggeredBy,
                        'type' => 'approval_requested',
                        'title' => 'Quote Approval Requested',
                        'body' => "Quote {$quote->quote_number} needs your review and approval.",
                        'is_read' => false,
                    ]);
                }
            } elseif ($newStatus === 'approved') {
                if ($creator) {
                    Alert::create([
                        'user_id' => $creator->id,
                        'triggered_by' => $triggeredBy,
                        'type' => 'approval_actioned',
                        'title' => 'Quote Approved',
                        'body' => "Quote {$quote->quote_number} has been approved.",
                        'is_read' => false,
                    ]);
                }
            } elseif ($newStatus === 'rejected') {
                if ($creator) {
                    $approverName = 'Approver';
                    $lastRejectedApproval = $quote->approvals()
                        ->where('status', 'rejected')
                        ->latest()
                        ->first();

                    if ($lastRejectedApproval && $lastRejectedApproval->approver) {
                        $approverName = $lastRejectedApproval->approver->name;
                    } elseif (Auth::check()) {
                        $approverName = Auth::user()->name;
                    }

                    Alert::create([
                        'user_id' => $creator->id,
                        'triggered_by' => $triggeredBy,
                        'type' => 'approval_actioned',
                        'title' => 'Quote Rejected',
                        'body' => "Quote {$quote->quote_number} was rejected by {$approverName}.",
                        'is_read' => false,
                    ]);
                }
            }
        }
    }
}
