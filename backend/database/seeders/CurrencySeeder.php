<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CurrencySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $now = now();

        $currencies = [
            [
                'code'                  => 'INR',
                'name'                  => 'Indian Rupee',
                'symbol'                => '₹',
                'exchange_rate_to_inr'  => 1.0000,
                'is_default'            => true,
                'created_at'            => $now,
                'updated_at'            => $now,
            ],
            [
                'code'                  => 'USD',
                'name'                  => 'US Dollar',
                'symbol'                => '$',
                'exchange_rate_to_inr'  => 83.5000,
                'is_default'            => false,
                'created_at'            => $now,
                'updated_at'            => $now,
            ],
            [
                'code'                  => 'GBP',
                'name'                  => 'British Pound',
                'symbol'                => '£',
                'exchange_rate_to_inr'  => 106.2000,
                'is_default'            => false,
                'created_at'            => $now,
                'updated_at'            => $now,
            ],
            [
                'code'                  => 'CAD',
                'name'                  => 'Canadian Dollar',
                'symbol'                => 'CA$',
                'exchange_rate_to_inr'  => 61.8000,
                'is_default'            => false,
                'created_at'            => $now,
                'updated_at'            => $now,
            ],
            [
                'code'                  => 'MYR',
                'name'                  => 'Malaysian Ringgit',
                'symbol'                => 'RM',
                'exchange_rate_to_inr'  => 18.9000,
                'is_default'            => false,
                'created_at'            => $now,
                'updated_at'            => $now,
            ],
            [
                'code'                  => 'AUD',
                'name'                  => 'Australian Dollar',
                'symbol'                => 'A$',
                'exchange_rate_to_inr'  => 54.7000,
                'is_default'            => false,
                'created_at'            => $now,
                'updated_at'            => $now,
            ],
            [
                'code'                  => 'AED',
                'name'                  => 'UAE Dirham',
                'symbol'                => 'د.إ',
                'exchange_rate_to_inr'  => 22.7000,
                'is_default'            => false,
                'created_at'            => $now,
                'updated_at'            => $now,
            ],
        ];

        DB::table('currencies')->insertOrIgnore($currencies);

        $this->command->info('✅ Currencies seeded: INR (default), USD, GBP, CAD, MYR, AUD, AED.');
    }
}
