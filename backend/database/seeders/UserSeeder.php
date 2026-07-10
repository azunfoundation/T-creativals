<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Models\User;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Retrieve department IDs from the DB (already seeded by DepartmentSeeder)
        $departments = DB::table('departments')->pluck('id', 'name');

        $now = now();

        $users = [
            [
                'name'          => 'Rajesh Kumar',
                'email'         => 'founder@creativals.com',
                'role'          => 'founder',
                'department_id' => null,
            ],
            [
                'name'          => 'Priya Sharma',
                'email'         => 'director@creativals.com',
                'role'          => 'director',
                'department_id' => $departments['Sales'] ?? null,
            ],
            [
                'name'          => 'Arun Mehta',
                'email'         => 'sales@creativals.com',
                'role'          => 'sales_head',
                'department_id' => $departments['Sales'] ?? null,
            ],
            [
                'name'          => 'Sneha Patel',
                'email'         => 'pm@creativals.com',
                'role'          => 'project_manager',
                'department_id' => $departments['Tech'] ?? null,
            ],
            [
                'name'          => 'Vikram Singh',
                'email'         => 'dev@creativals.com',
                'role'          => 'employee',
                'department_id' => $departments['Tech'] ?? null,
            ],
            [
                'name'          => 'Ananya Rao',
                'email'         => 'design@creativals.com',
                'role'          => 'employee',
                'department_id' => $departments['Design'] ?? null,
            ],
            [
                'name'          => 'Kiran Joshi',
                'email'         => 'hr@creativals.com',
                'role'          => 'hr',
                'department_id' => $departments['Sales'] ?? null,
            ],
        ];

        foreach ($users as $userData) {
            $roleName = $userData['role'];

            // Create or update the user
            /** @var User $user */
            $user = User::firstOrCreate(
                ['email' => $userData['email']],
                [
                    'name'              => $userData['name'],
                    'password'          => Hash::make('password'),
                    'status'            => 'active',
                    'email_verified_at' => $now,
                    'created_at'        => $now,
                    'updated_at'        => $now,
                ]
            );

            // Sync the single role (removes previous roles)
            $user->syncRoles([$roleName]);

            // Sync department if provided
            if ($userData['department_id']) {
                $user->departments()->sync([
                    $userData['department_id'] => ['is_primary' => true]
                ]);
            }

            $this->command->info("   ✔ {$userData['name']} <{$userData['email']}> → role: {$roleName}");
        }

        $this->command->info('✅ Users seeded successfully.');
    }
}
