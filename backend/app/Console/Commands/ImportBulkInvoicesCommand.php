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

class ImportBulkInvoicesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'invoice:import-bulk {--file= : Absolute or relative path to CSV file containing invoice records}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Import past/ongoing client invoices from a CSV file into Creativals OS';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $filePath = $this->option('file');

        if (!$filePath) {
            $this->info("Usage: php artisan invoice:import-bulk --file=path/to/invoices.csv");
            $this->info("CSV Columns expected:");
            $this->line("Client Name, Invoice Number, Title, Total Amount, Paid Amount, Issue Date, Due Date, Status");
            return Command::FAILURE;
        }

        if (!file_exists($filePath)) {
            $this->error("File not found at path: {$filePath}");
            return Command::FAILURE;
        }

        $this->info("=== IMPORTING PAST INVOICES FROM CSV ===");

        $inr = Currency::where('code', 'INR')->first() ?? Currency::first();
        $inrId = $inr ? $inr->id : 1;
        $adminUser = User::where('email', 'founder@creativals.com')->first() ?? User::first();

        $fileHandle = fopen($filePath, 'r');
        if (!$fileHandle) {
            $this->error("Failed to open file: {$filePath}");
            return Command::FAILURE;
        }

        $header = fgetcsv($fileHandle);
        $importedCount = 0;

        DB::beginTransaction();

        try {
            while (($row = fgetcsv($fileHandle)) !== false) {
                if (empty($row) || count($row) < 3) {
                    continue;
                }

                // Header mapping or positional fallback
                $clientName = trim($row[0] ?? '');
                $invoiceNum = trim($row[1] ?? '');
                $title = trim($row[2] ?? 'Agency Retainer & Deliverables');
                $totalAmount = (float) str_replace([',', '₹', '$', ' '], '', $row[3] ?? '0');
                $paidAmount = (float) str_replace([',', '₹', '$', ' '], '', $row[4] ?? '0');
                $issueDateStr = trim($row[5] ?? '');
                $dueDateStr = trim($row[6] ?? '');
                $statusInput = strtolower(trim($row[7] ?? ''));

                if (empty($clientName)) {
                    continue;
                }

                // Match client account
                $clientUser = User::role('client')
                    ->where('company_name', 'like', "%{$clientName}%")
                    ->orWhere('name', 'like', "%{$clientName}%")
                    ->orWhere('email', 'like', "%{$clientName}%")
                    ->first();

                if (!$clientUser) {
                    // Create client on the fly if not found
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

                $issueDate = $issueDateStr ? Carbon::parse($issueDateStr) : now();
                $dueDate = $dueDateStr ? Carbon::parse($dueDateStr) : (clone $issueDate)->addDays(14);

                $dueAmount = max(0.00, $totalAmount - $paidAmount);

                $status = 'sent';
                if ($statusInput) {
                    $status = $statusInput;
                } else {
                    if ($paidAmount >= $totalAmount && $totalAmount > 0) {
                        $status = 'paid';
                    } elseif ($paidAmount > 0) {
                        $status = 'partially_paid';
                    } elseif ($dueDate->isPast()) {
                        $status = 'overdue';
                    }
                }

                $invoice = Invoice::create([
                    'invoice_number' => $invoiceNum ?: null,
                    'client_id' => $clientUser->id,
                    'created_by' => $adminUser ? $adminUser->id : 1,
                    'title' => $title,
                    'description' => "Historical / Ongoing Client Billing record for {$clientUser->name}",
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
                ]);

                // Create default line item
                InvoiceItem::create([
                    'invoice_id' => $invoice->id,
                    'description' => $title,
                    'quantity' => 1.00,
                    'unit_price' => $totalAmount,
                    'discount_percent' => 0.00,
                    'discount_amount' => 0.00,
                    'tax_rate' => 0.00,
                    'tax_amount' => 0.00,
                    'total_amount' => $totalAmount,
                    'sort_order' => 1,
                ]);

                // Record payment if paid amount exists
                if ($paidAmount > 0) {
                    Payment::create([
                        'invoice_id' => $invoice->id,
                        'payment_number' => 'PAY-' . strtoupper(Str::random(8)),
                        'amount' => $paidAmount,
                        'payment_date' => $issueDate->toDateString(),
                        'payment_method' => 'bank_transfer',
                        'transaction_reference' => 'HISTORICAL-IMPORT',
                        'notes' => 'Imported past invoice payment record',
                        'recorded_by' => $adminUser ? $adminUser->id : 1,
                    ]);
                }

                $invoice->recalculateTotals();

                $importedCount++;
                $this->info("Imported Invoice #{$invoice->invoice_number} | {$clientUser->name} | Total: ₹" . number_format($totalAmount) . " | Paid: ₹" . number_format($paidAmount) . " [Status: {$status}]");
            }

            fclose($fileHandle);
            DB::commit();

            $this->info("✅ SUCCESS: Bulk imported {$importedCount} past invoices!");
            return Command::SUCCESS;
        } catch (\Throwable $e) {
            DB::rollBack();
            fclose($fileHandle);
            $this->error("FAILED: " . $e->getMessage() . " at " . $e->getFile() . ":" . $e->getLine());
            return Command::FAILURE;
        }
    }
}
