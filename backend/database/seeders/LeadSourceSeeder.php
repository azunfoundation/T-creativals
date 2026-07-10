<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class LeadSourceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $now = now();

        $sources = [
            [
                'name' => 'Website',
                'slug' => 'website',
                'icon' => 'globe',
                'color' => '#3B82F6',
                'is_active' => true,
                'sort_order' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Cold Outreach',
                'slug' => 'cold-outreach',
                'icon' => 'mail',
                'color' => '#6B7280',
                'is_active' => true,
                'sort_order' => 2,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Referral',
                'slug' => 'referral',
                'icon' => 'user-plus',
                'color' => '#10B981',
                'is_active' => true,
                'sort_order' => 3,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'LinkedIn',
                'slug' => 'linkedin',
                'icon' => 'linkedin',
                'color' => '#0A66C2',
                'is_active' => true,
                'sort_order' => 4,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Google Search',
                'slug' => 'google-search',
                'icon' => 'search',
                'color' => '#EA4335',
                'is_active' => true,
                'sort_order' => 5,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Partner',
                'slug' => 'partner',
                'icon' => 'handshake',
                'color' => '#8B5CF6',
                'is_active' => true,
                'sort_order' => 6,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Event/Conference',
                'slug' => 'event-conference',
                'icon' => 'calendar',
                'color' => '#EC4899',
                'is_active' => true,
                'sort_order' => 7,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Upwork',
                'slug' => 'upwork',
                'icon' => 'briefcase',
                'color' => '#14A800',
                'is_active' => true,
                'sort_order' => 8,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Clutch',
                'slug' => 'clutch',
                'icon' => 'star',
                'color' => '#E57200',
                'is_active' => true,
                'sort_order' => 9,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Direct Email',
                'slug' => 'direct-email',
                'icon' => 'send',
                'color' => '#06B6D4',
                'is_active' => true,
                'sort_order' => 10,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'WhatsApp',
                'slug' => 'whatsapp',
                'icon' => 'message-square',
                'color' => '#25D366',
                'is_active' => true,
                'sort_order' => 11,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];

        DB::table('lead_sources')->upsert(
            $sources,
            ['slug'],
            ['name', 'icon', 'color', 'is_active', 'sort_order', 'updated_at']
        );
    }
}
