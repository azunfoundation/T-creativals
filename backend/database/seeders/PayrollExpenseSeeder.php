<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\CompensationType;
use App\Models\EmployeeCompensation;
use App\Models\ExpenseCategory;
use App\Models\Vendor;
use App\Models\Currency;
use App\Models\User;
use Illuminate\Support\Str;

class PayrollExpenseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Compensation Types
        $fixed = CompensationType::firstOrCreate(
            ['type' => 'fixed'],
            ['name' => 'Fixed Salary', 'description' => 'Standard fixed monthly payout']
        );

        $hourly = CompensationType::firstOrCreate(
            ['type' => 'hourly'],
            ['name' => 'Hourly Wages', 'description' => 'Payout based strictly on logged timesheet hours']
        );

        $hybrid = CompensationType::firstOrCreate(
            ['type' => 'hybrid'],
            ['name' => 'Hybrid (Fixed + Hourly)', 'description' => 'Fixed base salary plus hourly payment for logged hours']
        );

        // Currencies
        $inr = Currency::where('code', 'INR')->first() ?? Currency::first();
        $usd = Currency::where('code', 'USD')->first() ?? Currency::first();

        // 2. Employee Compensations
        $usersCompensations = [
            'founder@creativals.com' => [
                'type' => $fixed,
                'base' => 150000.00,
                'hours' => 160.00,
                'rate' => 0.00,
            ],
            'director@creativals.com' => [
                'type' => $fixed,
                'base' => 120000.00,
                'hours' => 160.00,
                'rate' => 0.00,
            ],
            'sales@creativals.com' => [
                'type' => $hybrid,
                'base' => 60000.00,
                'hours' => 160.00,
                'rate' => 400.00,
            ],
            'pm@creativals.com' => [
                'type' => $fixed,
                'base' => 90000.00,
                'hours' => 160.00,
                'rate' => 0.00,
            ],
            'dev@creativals.com' => [
                'type' => $hourly,
                'base' => 0.00,
                'hours' => 160.00,
                'rate' => 500.00,
            ],
            'design@creativals.com' => [
                'type' => $hourly,
                'base' => 0.00,
                'hours' => 160.00,
                'rate' => 450.00,
            ],
            'hr@creativals.com' => [
                'type' => $fixed,
                'base' => 70000.00,
                'hours' => 160.00,
                'rate' => 0.00,
            ],
        ];

        foreach ($usersCompensations as $email => $compData) {
            $user = User::where('email', $email)->first();
            if ($user) {
                // Terminate any previous current compensation
                EmployeeCompensation::where('user_id', $user->id)
                    ->where('is_current', true)
                    ->update(['is_current' => false, 'effective_until' => now()->subDay()->toDateString()]);

                EmployeeCompensation::create([
                    'user_id' => $user->id,
                    'compensation_type_id' => $compData['type']->id,
                    'base_amount' => $compData['base'],
                    'currency_id' => $inr->id,
                    'expected_monthly_hours' => $compData['hours'],
                    'hourly_rate' => $compData['rate'],
                    'effective_from' => now()->subMonths(3)->toDateString(),
                    'is_current' => true,
                    'notes' => 'Seeded active compensation',
                ]);
            }
        }

        // 3. Expense Categories
        $categories = [
            ['name' => 'Software & SaaS', 'slug' => 'software-saas', 'icon' => 'laptop', 'color' => '#3B82F6'],
            ['name' => 'Travel & Lodging', 'slug' => 'travel-lodging', 'icon' => 'plane', 'color' => '#10B981'],
            ['name' => 'Office Supplies', 'slug' => 'office-supplies', 'icon' => 'paperclip', 'color' => '#F59E0B'],
            ['name' => 'Meals & Entertainment', 'slug' => 'meals-entertainment', 'icon' => 'utensils', 'color' => '#EF4444'],
            ['name' => 'Marketing & Ads', 'slug' => 'marketing-ads', 'icon' => 'megaphone', 'color' => '#8B5CF6'],
            ['name' => 'Rent & Overhead', 'slug' => 'rent-overhead', 'icon' => 'home', 'color' => '#6B7280'],
        ];

        foreach ($categories as $cat) {
            ExpenseCategory::firstOrCreate(['slug' => $cat['slug']], $cat);
        }

        // 4. Vendors
        $vendors = [
            [
                'name' => 'Amazon Web Services',
                'contact_name' => 'AWS Billing',
                'email' => 'billing@aws.amazon.com',
                'website' => 'https://aws.amazon.com',
                'currency_id' => $usd->id,
                'notes' => 'Cloud hosting vendor',
            ],
            [
                'name' => 'GitHub Inc.',
                'contact_name' => 'GitHub Support',
                'email' => 'billing@github.com',
                'website' => 'https://github.com',
                'currency_id' => $usd->id,
                'notes' => 'Code repository hosting',
            ],
            [
                'name' => 'Local Office Depot',
                'contact_name' => 'Store Manager',
                'email' => 'sales@officedepot.in',
                'website' => 'https://officedepot.in',
                'currency_id' => $inr->id,
                'notes' => 'Stationery and physical office supplies',
            ],
        ];

        foreach ($vendors as $v) {
            Vendor::firstOrCreate(['name' => $v['name']], $v);
        }
    }
}
