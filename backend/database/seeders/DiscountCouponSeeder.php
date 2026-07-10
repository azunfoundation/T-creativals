<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\DiscountCoupon;
use Illuminate\Database\Seeder;

class DiscountCouponSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        DiscountCoupon::updateOrCreate(
            ['code' => 'WELCOME10'],
            [
                'description' => 'Get 10% off your first quotation.',
                'type' => 'percentage',
                'value' => 10.00,
                'minimum_amount' => 1000.00,
                'maximum_discount' => 2000.00,
                'usage_limit' => 500,
                'valid_from' => now()->startOfDay(),
                'valid_until' => now()->addYear(),
                'is_active' => true,
            ]
        );

        DiscountCoupon::updateOrCreate(
            ['code' => 'FLAT5000'],
            [
                'description' => 'Get a flat ₹5000 discount on projects over ₹20,000.',
                'type' => 'fixed',
                'value' => 5000.00,
                'minimum_amount' => 20000.00,
                'maximum_discount' => 5000.00,
                'usage_limit' => 100,
                'valid_from' => now()->startOfDay(),
                'valid_until' => now()->addYear(),
                'is_active' => true,
            ]
        );
    }
}
