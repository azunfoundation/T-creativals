<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Currency;
use App\Models\DiscountCoupon;
use App\Models\Lead;
use App\Models\Quote;
use App\Models\Service;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class QuoteSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $creator = User::where('email', 'founder@creativals.com')->first() ?? User::first();
        if (!$creator) {
            return;
        }

        $lead = Lead::first();
        $currency = Currency::where('code', 'INR')->first() ?? Currency::first();
        if (!$currency) {
            return;
        }

        $coupon = DiscountCoupon::where('code', 'FLAT5000')->first();

        // 1. Seed Draft Quote
        $quote1 = Quote::create([
            'quote_number' => 'QUO-' . now()->format('Y') . '-0001',
            'lead_id' => $lead?->id,
            'client_id' => null,
            'created_by' => $creator->id,
            'title' => 'Website Redesign Proposal',
            'description' => 'Draft quotation for Acme Corp custom Next.js redesign.',
            'currency_id' => $currency->id,
            'exchange_rate' => 1.0000,
            'subtotal' => 150000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 27000.00,
            'total_amount' => 177000.00,
            'status' => 'draft',
            'valid_until' => now()->addDays(30),
            'terms_conditions' => '50% upfront, 50% upon completion.',
            'internal_notes' => 'Requires discussion on final timeline.',
        ]);

        $quote1->items()->create([
            'description' => 'Custom Next.js Site development',
            'quantity' => 1.00,
            'unit' => 'project',
            'unit_price' => 130000.00,
            'discount_percent' => 0.00,
            'discount_amount' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 23400.00,
            'total_amount' => 153400.00,
            'sort_order' => 1,
        ]);

        $quote1->items()->create([
            'description' => 'Logo Identity Design',
            'quantity' => 1.00,
            'unit' => 'logo',
            'unit_price' => 20000.00,
            'discount_percent' => 0.00,
            'discount_amount' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 3600.00,
            'total_amount' => 23600.00,
            'sort_order' => 2,
        ]);

        // 2. Seed Approved Quote
        $quote2 = Quote::create([
            'quote_number' => 'QUO-' . now()->format('Y') . '-0002',
            'lead_id' => $lead?->id,
            'client_id' => null,
            'created_by' => $creator->id,
            'title' => 'SEO & Content Campaign',
            'description' => 'Comprehensive SEO audit and ongoing content marketing.',
            'currency_id' => $currency->id,
            'exchange_rate' => 1.0000,
            'subtotal' => 65000.00,
            'discount_amount' => 5000.00,
            'tax_amount' => 10800.00,
            'total_amount' => 70800.00,
            'coupon_id' => $coupon?->id,
            'coupon_discount' => 5000.00,
            'status' => 'approved',
            'valid_until' => now()->addDays(30),
            'terms_conditions' => 'Monthly billing cycles apply.',
        ]);

        $quote2->items()->create([
            'description' => 'SEO Audit',
            'quantity' => 1.00,
            'unit' => 'audit',
            'unit_price' => 15000.00,
            'discount_percent' => 0.00,
            'discount_amount' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 2700.00,
            'total_amount' => 17700.00,
            'sort_order' => 1,
        ]);

        $quote2->items()->create([
            'description' => 'Social Media Management',
            'quantity' => 2.00,
            'unit' => 'month',
            'unit_price' => 25000.00,
            'discount_percent' => 0.00,
            'discount_amount' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 9000.00,
            'total_amount' => 59000.00,
            'sort_order' => 2,
        ]);

        // Create approval record
        $quote2->approvals()->create([
            'requested_by' => $creator->id,
            'approver_id' => $creator->id,
            'step_number' => 1,
            'status' => 'approved',
            'comments' => 'Looks good to go. Approved.',
            'actioned_at' => now(),
        ]);
    }
}
