<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class CreateTeamAccountsCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'team:create-accounts {--password=Creativals2026! : Default password for new accounts}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Clean up duplicate accounts and ensure official team accounts (Rahil, Rayan, Farhan, Faizan, Sawood) exist with correct access roles';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $defaultPassword = $this->option('password');
        $hashedPassword = Hash::make($defaultPassword);

        $this->info("=== CLEANING & CONFIGURING CREATIVALS TEAM ACCOUNTS ===");

        // Ensure roles & permissions are seeded
        $this->call('db:seed', ['--class' => 'RolesPermissionsSeeder']);

        // 1. Clean up unwanted alias accounts and non-team members (Swaran, etc.)
        $unwantedEmails = [
            'swaran@creativals.in',
            'swaran@creativals.com',
            'founder@creativals.in',
            'rayan@creativals.com',
            'saud@creativals.in',
        ];

        User::whereIn('email', $unwantedEmails)
            ->orWhere('name', 'like', '%(Alias)%')
            ->orWhere('name', 'like', '%Swaran%')
            ->forceDelete();

        // 2. Define the exact 5 team members
        $teamMembers = [
            [
                'name' => 'Rahil',
                'email' => 'founder@creativals.com',
                'role' => 'founder',
                'phone' => '+91 9505652923',
                'access_level' => 'Full Super-Admin Access (Finances, Revenue, Projects, CRM, Settings)',
            ],
            [
                'name' => 'Rayan',
                'email' => 'rayan@creativals.in',
                'role' => 'director',
                'phone' => '+91 9000000001',
                'access_level' => 'Full Executive Access (Finances, Revenue, Projects, CRM, Reports)',
            ],
            [
                'name' => 'Farhan',
                'email' => 'farhan@creativals.in',
                'role' => 'director',
                'phone' => '+91 9000000003',
                'access_level' => 'Full Executive Access (Finances, Revenue, Projects, CRM, Operations)',
            ],
            [
                'name' => 'Faizan',
                'email' => 'faizan@creativals.in',
                'role' => 'employee',
                'phone' => '+91 9000000004',
                'access_level' => 'Restricted Employee Access (Assigned Projects & Tasks, Subtasks, Time Tracking. NO Finances)',
            ],
            [
                'name' => 'Sawood',
                'email' => 'sawood@creativals.in',
                'role' => 'employee',
                'phone' => '+91 9000000005',
                'access_level' => 'Restricted Employee Access (Assigned Projects & Tasks, Subtasks, Time Tracking. NO Finances)',
            ],
        ];

        $headers = ['Name', 'Email', 'Role', 'Access Level'];
        $rows = [];

        foreach ($teamMembers as $memberData) {
            $user = User::where('email', $memberData['email'])->first();

            if (!$user) {
                $user = User::create([
                    'name' => $memberData['name'],
                    'email' => $memberData['email'],
                    'password' => $hashedPassword,
                    'phone' => $memberData['phone'],
                    'status' => 'active',
                    'must_change_password' => false,
                ]);
            } else {
                $user->update([
                    'name' => $memberData['name'],
                    'status' => 'active',
                ]);
            }

            $user->syncRoles([$memberData['role']]);

            $rows[] = [
                $user->name,
                $user->email,
                strtoupper($memberData['role']),
                $memberData['access_level'],
            ];
        }

        $this->table($headers, $rows);
        $this->info("✅ SUCCESS: Team accounts cleaned and exact 5 accounts configured!");

        return Command::SUCCESS;
    }
}
