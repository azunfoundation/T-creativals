<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

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
    protected $description = 'Create official team accounts (Rahil, Rayan, Swaran, Farhan, Faizan, Sawood) with configured roles and access permissions';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $defaultPassword = $this->option('password');
        $hashedPassword = Hash::make($defaultPassword);

        $this->info("=== CREATING CREATIVALS OS TEAM ACCOUNTS ===");

        // Ensure roles & permissions are seeded
        $this->call('db:seed', ['--class' => 'RolesPermissionsSeeder']);

        $teamMembers = [
            [
                'name' => 'Rahil',
                'email' => 'founder@creativals.com',
                'secondary_email' => 'founder@creativals.in',
                'role' => 'founder',
                'phone' => '+91 9505652923',
                'designation' => 'Founder & CEO',
                'access_level' => 'Full Super-Admin Access (Finances, Projects, CRM, Operations, Settings)',
            ],
            [
                'name' => 'Rayan',
                'email' => 'rayan@creativals.in',
                'secondary_email' => 'rayan@creativals.com',
                'role' => 'director',
                'phone' => '+91 9000000001',
                'designation' => 'Co-Founder & Director',
                'access_level' => 'Full Executive Access (Finances, Projects, CRM, Reports)',
            ],
            [
                'name' => 'Swaran',
                'email' => 'swaran@creativals.in',
                'secondary_email' => 'swaran@creativals.com',
                'role' => 'director',
                'phone' => '+91 9000000002',
                'designation' => 'Director',
                'access_level' => 'Full Executive Access (Finances, Projects, CRM, Reports)',
            ],
            [
                'name' => 'Farhan',
                'email' => 'farhan@creativals.in',
                'secondary_email' => null,
                'role' => 'project_manager',
                'phone' => '+91 9000000003',
                'designation' => 'Project Manager',
                'access_level' => 'Full Project & Operations Access (Projects, Tasks, Subtasks, Timesheets, Assignments)',
            ],
            [
                'name' => 'Faizan',
                'email' => 'faizan@creativals.in',
                'secondary_email' => null,
                'role' => 'employee',
                'phone' => '+91 9000000004',
                'designation' => 'Software Engineer / Specialist',
                'access_level' => 'Restricted Employee Access (Assigned Projects & Tasks, Subtasks, Time Tracking, Timer, Timesheets. Financials Hidden)',
            ],
            [
                'name' => 'Sawood',
                'email' => 'sawood@creativals.in',
                'secondary_email' => 'saud@creativals.in',
                'role' => 'employee',
                'phone' => '+91 9000000005',
                'designation' => 'Software Engineer / Specialist',
                'access_level' => 'Restricted Employee Access (Assigned Projects & Tasks, Subtasks, Time Tracking, Timer, Timesheets. Financials Hidden)',
            ],
        ];

        $headers = ['Name', 'Primary Email', 'Role', 'Access Level'];
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
                    'must_change_password' => ($memberData['role'] !== 'founder'),
                ]);
            } else {
                $user->update([
                    'name' => $memberData['name'],
                    'status' => 'active',
                ]);
            }

            // Also create secondary email alias account if specified
            if (!empty($memberData['secondary_email'])) {
                $aliasUser = User::where('email', $memberData['secondary_email'])->first();
                if (!$aliasUser) {
                    $aliasUser = User::create([
                        'name' => $memberData['name'] . ' (Alias)',
                        'email' => $memberData['secondary_email'],
                        'password' => $hashedPassword,
                        'phone' => $memberData['phone'],
                        'status' => 'active',
                        'must_change_password' => false,
                    ]);
                }
                $aliasUser->syncRoles([$memberData['role']]);
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
        $this->info("✅ SUCCESS: All team accounts created and roles assigned.");
        $this->info("Initial password for all new accounts: {$defaultPassword}");

        return Command::SUCCESS;
    }
}
