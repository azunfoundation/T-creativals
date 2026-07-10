<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class ProcessRecurringInvoices extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'invoices:process-recurring';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Generate child invoices for active recurring invoices';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $today = Carbon::today();

        $recurringInvoices = Invoice::where('is_recurring', true)
            ->where(function ($query) use ($today) {
                $query->whereNull('recurring_end_date')
                      ->orWhere('recurring_end_date', '>=', $today);
            })
            ->where('status', '!=', 'cancelled')
            ->get();

        $count = 0;

        foreach ($recurringInvoices as $invoice) {
            $lastDate = $invoice->last_recurring_date ? Carbon::parse($invoice->last_recurring_date) : Carbon::parse($invoice->issue_date);
            
            $nextDate = match($invoice->recurring_interval) {
                'daily' => $lastDate->copy()->addDay(),
                'weekly' => $lastDate->copy()->addWeek(),
                'monthly' => $lastDate->copy()->addMonth(),
                'yearly' => $lastDate->copy()->addYear(),
                default => null,
            };

            if ($nextDate && $nextDate->lte($today)) {
                // Create child invoice
                $child = $invoice->replicate(['invoice_number', 'status', 'issue_date', 'due_date', 'last_recurring_date', 'parent_invoice_id', 'paid_amount', 'due_amount']);
                
                $child->invoice_number = \App\Models\NumberSequence::generateNext('invoice');
                $child->is_recurring = false;
                $child->parent_invoice_id = $invoice->id;
                $child->issue_date = $nextDate;
                
                // Calculate new due date based on diff from original
                $daysDue = Carbon::parse($invoice->issue_date)->diffInDays(Carbon::parse($invoice->due_date));
                $child->due_date = $nextDate->copy()->addDays($daysDue);
                $child->status = 'draft';
                $child->paid_amount = 0;
                $child->due_amount = $child->total_amount;
                $child->save();

                // Duplicate items
                foreach ($invoice->items as $item) {
                    $childItem = $item->replicate(['invoice_id']);
                    $childItem->invoice_id = $child->id;
                    $childItem->save();
                }

                $invoice->last_recurring_date = $nextDate;
                $invoice->save();
                $count++;
            }
        }

        $this->info("Processed {$count} recurring invoices.");
    }
}
