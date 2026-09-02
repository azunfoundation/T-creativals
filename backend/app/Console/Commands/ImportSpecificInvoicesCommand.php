<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Currency;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Payment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ImportSpecificInvoicesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'invoice:import-august-batch';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Import 27 specific August 2026 past/ongoing client invoices and payment records';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info("=== IMPORTING 27 AUGUST 2026 CLIENT INVOICES ===");

        $inr = Currency::where('code', 'INR')->first() ?? Currency::first();
        $inrId = $inr ? $inr->id : 1;
        $adminUser = User::where('email', 'founder@creativals.com')->first() ?? User::first();
        $adminId = $adminUser ? $adminUser->id : 1;

        $invoicesData = [
            ['client' => 'Beyond the Shore', 'title' => 'Ongoing - Full Digital Marketing', 'billing_type' => 'monthly', 'total' => 30000.00, 'paid' => 7000.00, 'date' => '2026-08-01'],
            ['client' => 'House of Form', 'title' => 'Website', 'billing_type' => 'one_time', 'total' => 7000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Teak Studio', 'title' => 'Meta Ads', 'billing_type' => 'one_time', 'total' => 3000.00, 'paid' => 2000.00, 'date' => '2026-08-01'],
            ['client' => 'Besure', 'title' => 'Outsourced-Work', 'billing_type' => 'one_time', 'total' => 400000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Yala Reality', 'title' => 'Websites - 3', 'billing_type' => 'one_time', 'total' => 60000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Hotel Oak by Mega Group', 'title' => 'Swiggy/Zomato', 'billing_type' => 'one_time', 'total' => 8000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Hotel Oak by Mega Group', 'title' => 'Social Media Marketing', 'billing_type' => 'monthly', 'total' => 5000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Nexhouz', 'title' => 'Full Digital Marketing', 'billing_type' => 'one_time', 'total' => 60000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Merch BPL Baseball', 'title' => 'Website', 'billing_type' => 'one_time', 'total' => 200000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Embun Teratai', 'title' => 'Full Digital Marketing', 'billing_type' => 'one_time', 'total' => 100000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Embun Teratai', 'title' => 'Social Media Marketing', 'billing_type' => 'monthly', 'total' => 30000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Elite Architecture', 'title' => 'Domain renewal', 'billing_type' => 'one_time', 'total' => 2000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Hydi Resort', 'title' => 'Marketing', 'billing_type' => 'one_time', 'total' => 25000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Spatial Alphabet', 'title' => 'Website', 'billing_type' => 'one_time', 'total' => 25000.00, 'paid' => 12500.00, 'date' => '2026-08-01'],
            ['client' => 'BRIQ Pre School', 'title' => 'Full Digital Marketing', 'billing_type' => 'monthly', 'total' => 20000.00, 'paid' => 10000.00, 'date' => '2026-08-01'],
            ['client' => 'BRIQ Pre School', 'title' => 'Website', 'billing_type' => 'one_time', 'total' => 10000.00, 'paid' => 5000.00, 'date' => '2026-08-01'],
            ['client' => 'Rawdah Express', 'title' => 'Website', 'billing_type' => 'one_time', 'total' => 50000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Bear Lake Montessori', 'title' => 'Full Digital Marketing', 'billing_type' => 'monthly', 'total' => 50000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Etch a Memory Shopify Site', 'title' => 'Website', 'billing_type' => 'one_time', 'total' => 30000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Scrapwala Hyderabad', 'title' => 'Meta Ads', 'billing_type' => 'one_time', 'total' => 4000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Brewed Roots', 'title' => 'Website Revamp', 'billing_type' => 'one_time', 'total' => 10000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Dyana Mobile Per Services', 'title' => 'Website Revamp', 'billing_type' => 'one_time', 'total' => 10000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Ybrant Global School', 'title' => 'Full Digital Marketing', 'billing_type' => 'one_time', 'total' => 10000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Sistla International School', 'title' => 'Full Digital Marketing', 'billing_type' => 'one_time', 'total' => 10000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Shield Lock and Key Australia', 'title' => 'Website Revamp', 'billing_type' => 'one_time', 'total' => 10000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Gopuppy', 'title' => 'Domain and Hosting', 'billing_type' => 'one_time', 'total' => 4000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
            ['client' => 'Gopuppy', 'title' => 'SEO', 'billing_type' => 'monthly', 'total' => 3000.00, 'paid' => 0.00, 'date' => '2026-08-01'],
        ];

        DB::beginTransaction();

        try {
            $importedCount = 0;
            $totalBilledSum = 0.00;
            $totalPaidSum = 0.00;

            foreach ($invoicesData as $invData) {
                $clientName = $invData['client'];

                // Find client
                $clientUser = User::role('client')
                    ->where('company_name', 'like', "%{$clientName}%")
                    ->orWhere('name', 'like', "%{$clientName}%")
                    ->first();

                if (!$clientUser) {
                    // Create client on the fly if Spatial Alphabet or new
                    $cleanEmail = 'client.' . Str::slug($clientName) . '@creativals.in';
                    $clientUser = User::create([
                        'name' => $clientName,
                        'company_name' => $clientName,
                        'email' => $cleanEmail,
                        'password' => bcrypt(Str::random(16)),
                        'status' => 'active',
                        'is_client_portal_user' => true,
                    ]);
                    $clientUser->syncRoles(['client']);
                }

                $issueDate = Carbon::parse($invData['date']);
                $dueDate = (clone $issueDate)->addDays(14);
                $totalAmount = (float) $invData['total'];
                $paidAmount = (float) $invData['paid'];
                $dueAmount = max(0.00, $totalAmount - $paidAmount);

                $status = 'overdue';
                if ($paidAmount >= $totalAmount && $totalAmount > 0) {
                    $status = 'paid';
                } elseif ($paidAmount > 0) {
                    $status = 'partially_paid';
                }

                $invoice = Invoice::create([
                    'client_id' => $clientUser->id,
                    'created_by' => $adminId,
                    'title' => $invData['title'] . ($invData['billing_type'] === 'monthly' ? ' (Monthly Retainer)' : ''),
                    'description' => "August 2026 billing record for {$clientUser->name}",
                    'currency_id' => $inrId,
                    'exchange_rate' => 1.0000,
                    'subtotal' => $totalAmount,
                    'discount_amount' => 0.00,
                    'tax_amount' => 0.00,
                    'total_amount' => $totalAmount,
                    'paid_amount' => $paidAmount,
                    'due_amount' => $dueAmount,
                    'status' => $status,
                    'issue_date' => $issueDate->toDateString(),
                    'due_date' => $dueDate->toDateString(),
                    'is_recurring' => $invData['billing_type'] === 'monthly',
                    'recurring_interval' => $invData['billing_type'] === 'monthly' ? 'monthly' : null,
                ]);

                // Item
                InvoiceItem::create([
                    'invoice_id' => $invoice->id,
                    'description' => $invData['title'],
                    'quantity' => 1.00,
                    'unit_price' => $totalAmount,
                    'discount_percent' => 0.00,
                    'discount_amount' => 0.00,
                    'tax_rate' => 0.00,
                    'tax_amount' => 0.00,
                    'total_amount' => $totalAmount,
                    'sort_order' => 1,
                ]);

                // Payment if paid > 0
                if ($paidAmount > 0) {
                    Payment::create([
                        'invoice_id' => $invoice->id,
                        'payment_number' => 'PAY-' . strtoupper(Str::random(8)),
                        'amount' => $paidAmount,
                        'payment_date' => $issueDate->toDateString(),
                        'payment_method' => 'bank_transfer',
                        'transaction_reference' => 'AUG-PAYMENT-RECORD',
                        'notes' => "Payment recorded for invoice #{$invoice->invoice_number}",
                        'recorded_by' => $adminId,
                    ]);
                }

                $invoice->recalculateTotals();

                $importedCount++;
                $totalBilledSum += $totalAmount;
                $totalPaidSum += $paidAmount;

                $this->info("Invoice #{$invoice->invoice_number} | Client: {$clientUser->name} | Title: {$invData['title']} | Total: ₹" . number_format($totalAmount) . " | Paid: ₹" . number_format($paidAmount) . " [Status: {$status}]");
            }

            DB::commit();

            $this->info("✅ SUCCESS: Imported {$importedCount} August invoices!");
            $this->info("Total Billed: ₹" . number_format($totalBilledSum) . " | Total Collected: ₹" . number_format($totalPaidSum) . " | Total Due: ₹" . number_format($totalBilledSum - $totalPaidSum));

            return Command::SUCCESS;
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error("FAILED: " . $e->getMessage() . " at " . $e->getFile() . ":" . $e->getLine());
            return Command::FAILURE;
        }
    }
}
