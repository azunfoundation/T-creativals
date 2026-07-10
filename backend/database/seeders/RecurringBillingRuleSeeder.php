<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\RecurringBillingRule;
use App\Models\User;
use App\Models\Currency;

class RecurringBillingRuleSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $founder = User::where('email', 'founder@creativals.com')->first() ?? User::first();
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

        $currency = Currency::where('code', 'INR')->first() ?? Currency::first();

        // 1. Monthly SEO Retainer Rule (Active)
        $rule1 = RecurringBillingRule::create([
            'name' => 'Monthly SEO & Content Retainer',
            'client_id' => $client->id,
            'created_by' => $founder->id,
            'status' => 'active',
            'frequency' => 'monthly',
            'start_date' => now()->subMonths(2)->toDateString(),
            'next_generation_date' => now()->toDateString(), // Due today
            'currency_id' => $currency->id,
            'exchange_rate' => 1.0000,
            'subtotal' => 15000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 2700.00,
            'total_amount' => 17700.00,
            'terms_conditions' => 'Standard monthly marketing terms.',
        ]);
        $rule1->items()->create([
            'description' => 'Monthly SEO Optimizations and Reporting',
            'quantity' => 1,
            'unit' => 'month',
            'unit_price' => 15000.00,
            'discount_percent' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 2700.00,
            'total_amount' => 17700.00,
        ]);

        // 2. Weekly Hosting & Support Rule (Active)
        $rule2 = RecurringBillingRule::create([
            'name' => 'Weekly Support Plan',
            'client_id' => $client->id,
            'created_by' => $founder->id,
            'status' => 'active',
            'frequency' => 'weekly',
            'start_date' => now()->subWeeks(4)->toDateString(),
            'next_generation_date' => now()->addDays(2)->toDateString(), // Due in 2 days
            'currency_id' => $currency->id,
            'exchange_rate' => 1.0000,
            'subtotal' => 2000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 3600.00,
            'total_amount' => 2360.00,
            'terms_conditions' => 'Billed weekly.',
        ]);
        $rule2->items()->create([
            'description' => 'Hosting and 24/7 technical support hours',
            'quantity' => 1,
            'unit' => 'week',
            'unit_price' => 2000.00,
            'discount_percent' => 0.00,
            'tax_rate' => 18.00,
            'tax_amount' => 360.00,
            'total_amount' => 2360.00,
        ]);
    }
}
