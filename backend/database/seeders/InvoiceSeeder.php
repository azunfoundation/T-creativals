<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Payment;
use App\Models\User;
use App\Models\Currency;
use App\Models\DiscountCoupon;
use Illuminate\Support\Facades\DB;

class InvoiceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $now = now();
        $currency = Currency::where('code', 'INR')->first() ?? Currency::first() ?? Currency::create([
            'code' => 'INR',
            'symbol' => '₹',
            'name' => 'Indian Rupee',
            'exchange_rate' => 1.0000,
        ]);

        $founder = User::where('email', 'founder@creativals.com')->first() ?? User::first();
        $salesHead = User::where('email', 'sales@creativals.com')->first();
        $finance = User::where('email', 'finance@creativals.com')->first();

        if (!$finance) {
            $finance = User::create([
                'name' => 'Finance Manager',
                'email' => 'finance@creativals.com',
                'password' => bcrypt('password'),
                'status' => 'active',
            ]);
            $finance->assignRole('finance');
        }

        // Create a client user
        $client = User::where('email', 'client@creativals.com')->first();
        if (!$client) {
            $client = User::create([
                'name' => 'Acme Corporation',
                'email' => 'client@creativals.com',
                'password' => bcrypt('password'),
                'status' => 'active',
                'is_client_portal_user' => true,
            ]);
            $client->assignRole('client');
        }

        // Let's seed 1: Draft Invoice
        $invoice1 = Invoice::create([
            'client_id' => $client->id,
            'created_by' => $founder->id,
            'title' => 'Website Redesign',
            'description' => 'Draft invoice for Acme website redesign',
            'currency_id' => $currency->id,
            'exchange_rate' => 1.0000,
            'subtotal' => 50000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 9000.00,
            'total_amount' => 59000.00,
            'status' => 'draft',
            'issue_date' => $now->toDateString(),
            'due_date' => $now->addDays(15)->toDateString(),
        ]);
        $invoice1->items()->create([
            'description' => 'UI/UX Design Phase',
            'quantity' => 1,
            'unit' => 'project',
            'unit_price' => 50000.00,
            'tax_type' => 'custom',
            'discount_percent' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 9000.00,
            'total_amount' => 59000.00,
        ]);

        // Seed 2: Sent Invoice (Unpaid)
        $invoice2 = Invoice::create([
            'client_id' => $client->id,
            'created_by' => $founder->id,
            'title' => 'SEO Services - June 2026',
            'description' => 'Monthly SEO retainer',
            'currency_id' => $currency->id,
            'exchange_rate' => 1.0000,
            'subtotal' => 20000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 3600.00,
            'total_amount' => 23600.00,
            'status' => 'sent',
            'issue_date' => $now->toDateString(),
            'due_date' => $now->addDays(10)->toDateString(),
        ]);
        $invoice2->items()->create([
            'description' => 'SEO Consultation & Content Strategy',
            'quantity' => 1,
            'unit' => 'month',
            'unit_price' => 20000.00,
            'tax_type' => 'custom',
            'discount_percent' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 3600.00,
            'total_amount' => 23600.00,
        ]);
        $invoice2->recalculateTotals(); // updates due amount

        // Seed 3: Fully Paid Invoice
        $invoice3 = Invoice::create([
            'client_id' => $client->id,
            'created_by' => $founder->id,
            'title' => 'Mobile App Prototyping',
            'description' => 'Invoice for iOS & Android prototyping phase',
            'currency_id' => $currency->id,
            'exchange_rate' => 1.0000,
            'subtotal' => 100000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 18000.00,
            'total_amount' => 118000.00,
            'status' => 'sent', // will become paid after payment is recorded
            'issue_date' => $now->subDays(10)->toDateString(),
            'due_date' => $now->addDays(5)->toDateString(),
        ]);
        $invoice3->items()->create([
            'description' => 'Mobile App Wireframing and Prototyping',
            'quantity' => 1,
            'unit' => 'project',
            'unit_price' => 100000.00,
            'tax_type' => 'custom',
            'discount_percent' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 18000.00,
            'total_amount' => 118000.00,
        ]);
        
        Payment::create([
            'invoice_id' => $invoice3->id,
            'amount' => 118000.00,
            'payment_date' => $now->toDateString(),
            'payment_method' => 'bank_transfer',
            'transaction_reference' => 'TXN987654321',
            'notes' => 'Received via bank transfer. Fully paid.',
            'recorded_by' => $finance->id,
        ]);

        // Seed 4: Partially Paid Invoice
        $invoice4 = Invoice::create([
            'client_id' => $client->id,
            'created_by' => $founder->id,
            'title' => 'Marketing Campaign Retainer',
            'description' => 'Retainer for June-July marketing campaigns',
            'currency_id' => $currency->id,
            'exchange_rate' => 1.0000,
            'subtotal' => 60000.00,
            'discount_amount' => 10000.00, // coupon discount
            'tax_amount' => 9000.00,
            'total_amount' => 59000.00,
            'status' => 'sent',
            'issue_date' => $now->subDays(5)->toDateString(),
            'due_date' => $now->addDays(5)->toDateString(),
        ]);
        $invoice4->items()->create([
            'description' => 'Social Media Management & Paid Ads Management',
            'quantity' => 1,
            'unit' => 'month',
            'unit_price' => 60000.00,
            'tax_type' => 'custom',
            'discount_percent' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 9000.00,
            'total_amount' => 69000.00,
        ]);
        
        Payment::create([
            'invoice_id' => $invoice4->id,
            'amount' => 30000.00,
            'payment_date' => $now->toDateString(),
            'payment_method' => 'bank_transfer',
            'transaction_reference' => 'TXN111222333',
            'notes' => 'Advance payment received.',
            'recorded_by' => $finance->id,
        ]);

        // Seed 5: Overdue Invoice
        $invoice5 = Invoice::create([
            'client_id' => $client->id,
            'created_by' => $founder->id,
            'title' => 'Old Branding Consultation',
            'description' => 'Branding consultation session',
            'currency_id' => $currency->id,
            'exchange_rate' => 1.0000,
            'subtotal' => 10000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 1800.00,
            'total_amount' => 11800.00,
            'status' => 'sent', // will become overdue during recalculateTotals since due_date is in past
            'issue_date' => $now->subDays(30)->toDateString(),
            'due_date' => $now->subDays(15)->toDateString(),
        ]);
        $invoice5->items()->create([
            'description' => 'Branding consultation',
            'quantity' => 1,
            'unit' => 'session',
            'unit_price' => 10000.00,
            'tax_type' => 'custom',
            'discount_percent' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 1800.00,
            'total_amount' => 11800.00,
        ]);
        $invoice5->recalculateTotals();
    }
}
