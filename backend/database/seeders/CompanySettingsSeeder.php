<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CompanySettingsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $now = now();

        $settings = [
            ['key' => 'company_name',         'value' => 'Creativals Digital Marketing Agency'],
            ['key' => 'company_email',        'value' => 'hello@creativals.com'],
            ['key' => 'company_phone',        'value' => '+91 98765 43210'],
            ['key' => 'company_address',      'value' => 'Mumbai, Maharashtra, India'],
            ['key' => 'default_currency',     'value' => 'INR'],
            ['key' => 'financial_year_start', 'value' => '04'],
            ['key' => 'invoice_prefix',       'value' => 'INV'],
            ['key' => 'quote_prefix',         'value' => 'QT'],
            ['key' => 'lead_prefix',          'value' => 'LEAD'],
            ['key' => 'project_prefix',       'value' => 'PRJ'],
            ['key' => 'task_prefix',          'value' => 'TSK'],
            ['key' => 'payroll_prefix',       'value' => 'PAY'],
            ['key' => 'default_tax_rate',     'value' => '18'],
            ['key' => 'timezone',             'value' => 'Asia/Kolkata'],
        ];

        foreach ($settings as &$setting) {
            $setting['created_at'] = $now;
            $setting['updated_at'] = $now;
        }
        unset($setting);

        // upsert on 'key' so re-seeding is safe
        DB::table('company_settings')->upsert(
            $settings,
            ['key'],
            ['value', 'updated_at']
        );

        $this->command->info('✅ Company settings seeded (' . count($settings) . ' keys).');
    }
}
