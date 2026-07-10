<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class LeadStageSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $now = now();

        $stages = [
            [
                'name' => 'Fresh Lead',
                'slug' => 'fresh-lead',
                'color' => '#3B82F6', // Blue
                'sort_order' => 1,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Warm Lead',
                'slug' => 'warm-lead',
                'color' => '#F59E0B', // Amber
                'sort_order' => 2,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Hot Lead',
                'slug' => 'hot-lead',
                'color' => '#EF4444', // Red
                'sort_order' => 3,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Quote Sent',
                'slug' => 'quote-sent',
                'color' => '#8B5CF6', // Purple
                'sort_order' => 4,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Invoice Sent',
                'slug' => 'invoice-sent',
                'color' => '#EC4899', // Pink
                'sort_order' => 5,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Won',
                'slug' => 'won',
                'color' => '#10B981', // Emerald
                'sort_order' => 6,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Lost',
                'slug' => 'lost',
                'color' => '#6B7280', // Gray
                'sort_order' => 7,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Future Interest',
                'slug' => 'future-interest',
                'color' => '#06B6D4', // Cyan
                'sort_order' => 8,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];

        DB::table('lead_stages')->upsert(
            $stages,
            ['slug'],
            ['name', 'color', 'sort_order', 'is_system', 'updated_at']
        );
    }
}
