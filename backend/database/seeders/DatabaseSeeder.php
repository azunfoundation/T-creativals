<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * Run order matters — dependencies must be seeded before dependants:
     *  1. CurrencySeeder          — no dependencies
     *  2. DepartmentSeeder        — no dependencies
     *  3. RolesPermissionsSeeder  — no dependencies (Spatie)
     *  4. UserSeeder              — needs Departments + Roles
     *  5. CompanySettingsSeeder   — no dependencies
     *  6. NumberSequenceSeeder    — no dependencies
     */
    public function run(): void
    {
        $this->call([
            CurrencySeeder::class,
            DepartmentSeeder::class,
            RolesPermissionsSeeder::class,
            UserSeeder::class,
            CompanySettingsSeeder::class,
            NumberSequenceSeeder::class,
            LeadStageSeeder::class,
            LeadSourceSeeder::class,
            ServiceCategorySeeder::class,
            ServiceSeeder::class,
            LeadSeeder::class,
            PackageSeeder::class,
            DiscountCouponSeeder::class,
            QuoteSeeder::class,
            InvoiceSeeder::class,
            RecurringBillingRuleSeeder::class,
            PayrollExpenseSeeder::class,
        ]);
    }
}
