<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Mail\InvoiceOverdueMail;
use App\Models\Invoice;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

/**
 * Daily sweep flipping unpaid past-due invoices to `overdue`. Before this
 * existed, status only recalculated reactively on payment save/delete — an
 * invoice nobody touched never became overdue (flagged in the Invoicing
 * audit), which also starved invoices:send-reminders (it only looks at
 * status = overdue).
 */
class MarkOverdueInvoices extends Command
{
    protected $signature = 'invoices:mark-overdue';

    protected $description = 'Flip unpaid past-due invoices to overdue and notify their owners';

    public function handle(): void
    {
        $today = Carbon::today()->toDateString();

        // Only invoices actually issued to a client can become overdue —
        // drafts and pending-approval invoices aren't billed yet.
        $invoices = Invoice::with('client')
            ->whereIn('status', ['sent', 'partially_paid'])
            ->whereDate('due_date', '<', $today)
            ->where('due_amount', '>', 0)
            ->get();

        foreach ($invoices as $invoice) {
            $invoice->update(['status' => 'overdue']);

            if ($invoice->created_by) {
                NotificationService::alert('invoice_overdue', [
                    'user_id' => $invoice->created_by,
                    'triggered_by' => null,
                    'type' => 'invoice_overdue',
                    'title' => 'Invoice Overdue',
                    'body' => "Invoice {$invoice->invoice_number}" . ($invoice->client ? " for {$invoice->client->name}" : '') . ' has passed its due date without full payment.',
                    'action_url' => "/invoices/{$invoice->id}",
                    'metadata' => ['invoice_id' => $invoice->id],
                ]);

                if (NotificationService::emailEnabled((int) $invoice->created_by, 'invoice_overdue')) {
                    $owner = $invoice->creator ?? \App\Models\User::find($invoice->created_by);
                    if ($owner?->email) {
                        try {
                            Mail::to($owner->email)->queue(new InvoiceOverdueMail($invoice));
                        } catch (\Throwable $e) {
                            // Mail transport problems must not stop the sweep.
                        }
                    }
                }
            }
        }

        $this->info("Marked {$invoices->count()} invoice(s) overdue.");
    }
}
