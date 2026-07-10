<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\ServiceCategory;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ServiceCategorySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $categories = [
            [
                'name' => 'Digital Marketing',
                'color' => '#3B82F6',
                'sort_order' => 1,
            ],
            [
                'name' => 'Development',
                'color' => '#10B981',
                'sort_order' => 2,
            ],
            [
                'name' => 'Branding',
                'color' => '#F59E0B',
                'sort_order' => 3,
            ],
            [
                'name' => 'Copywriting',
                'color' => '#EC4899',
                'sort_order' => 4,
            ],
        ];

        foreach ($categories as $cat) {
            ServiceCategory::updateOrCreate(
                ['slug' => Str::slug($cat['name'])],
                [
                    'name' => $cat['name'],
                    'color' => $cat['color'],
                    'sort_order' => $cat['sort_order'],
                    'is_active' => true,
                ]
            );
        }
    }
}
