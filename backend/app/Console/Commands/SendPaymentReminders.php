<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use App\Mail\InvoiceMail;

class SendPaymentReminders extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'invoices:send-reminders';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send payment reminders for overdue invoices';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $today = Carbon::today();

        $overdueInvoices = Invoice::with(['client'])
            ->where('status', 'overdue')
            ->where('due_amount', '>', 0)
            ->get();

        $count = 0;

        foreach ($overdueInvoices as $invoice) {
            if ($invoice->client && $invoice->client->email) {
                // Here we would use a different Mailable for Reminder, but falling back to InvoiceMail for simplicity or if not defined.
                try {
                    Mail::to($invoice->client->email)->send(new InvoiceMail($invoice));
                    $count++;
                } catch (\Exception $e) {
                    $this->error("Failed to send reminder for invoice {$invoice->invoice_number}: " . $e->getMessage());
                }
            }
        }

        $this->info("Sent {$count} payment reminders.");
    }
}
