<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DepartmentSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $now = now();

        $departments = [
            [
                'name'       => 'Sales',
                'slug'       => 'sales',
                'color'      => '#10B981',
                'is_active'  => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name'       => 'Marketing',
                'slug'       => 'marketing',
                'color'      => '#8B5CF6',
                'is_active'  => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name'       => 'Tech',
                'slug'       => 'tech',
                'color'      => '#3B82F6',
                'is_active'  => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name'       => 'Design',
                'slug'       => 'design',
                'color'      => '#F59E0B',
                'is_active'  => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];

        DB::table('departments')->insertOrIgnore($departments);

        $this->command->info('✅ Departments seeded: Sales, Marketing, Tech, Design.');
    }
}
