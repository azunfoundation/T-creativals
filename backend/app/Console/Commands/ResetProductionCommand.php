<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\File;
use App\Models\User;
use Spatie\Permission\Models\Role;

class ResetProductionCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:production-reset {--force : Force the operation without confirmation}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Perform a complete production reset: clear demo data, retain Founder user, roles, permissions, settings & structure.';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        if (! $this->option('force')) {
            if (! $this->confirm('⚠️ WARNING: This will permanently remove all demo data, sample clients, projects, invoices, leads, and users except the Founder. Proceed?')) {
                $this->info('Production reset cancelled.');
                return Command::SUCCESS;
            }
        }

        $this->info('🚀 Starting Production Reset...');

        // 1. Disable foreign key checks safely depending on database driver
        $driver = DB::connection()->getDriverName();
        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF;');
        } elseif ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 0;');
        } elseif ($driver === 'pgsql') {
            DB::statement('SET CONSTRAINTS ALL DEFERRED;');
        }

        $tablesToTruncate = [
            'payments',
            'invoice_items',
            'invoice_approvals',
            'invoices',
            'credit_notes',
            'recurring_billing_rule_items',
            'recurring_billing_rules',
            'quote_approvals',
            'quote_items',
            'quotes',
            'timesheet_approvals',
            'timesheets',
            'task_comments',
            'task_attachments',
            'task_dependencies',
            'task_template_items',
            'task_templates',
            'tasks',
            'milestones',
            'project_documents',
            'project_members',
            'project_departments',
            'projects',
            'lead_activities',
            'lead_followups',
            'lead_contacts',
            'lead_services',
            'lead_tags',
            'leads',
            'client_communications',
            'client_contacts',
            'client_credentials',
            'employee_compensations',
            'bonuses',
            'payroll_adjustments',
            'payroll_run_items',
            'payroll_runs',
            'expense_attachments',
            'expenses',
            'vendors',
            'discount_coupons',
            'package_services',
            'packages',
            'services',
            'service_categories',
            'attendance_records',
            'leave_requests',
            'holidays',
            'ai_attachments',
            'ai_messages',
            'ai_conversations',
            'ai_memories',
            'ai_audit_logs',
            'alerts',
            'audit_logs',
            'deleted_records',
            'login_activities',
            'user_departments',
        ];

        foreach ($tablesToTruncate as $table) {
            if (DB::getSchemaBuilder()->hasTable($table)) {
                DB::table($table)->delete();
                $this->comment("  - Cleared {$table}");
            }
        }

        // 2. Manage Founder account
        $founder = User::where('email', 'founder@creativals.com')->first();

        if (! $founder) {
            // Find any user with founder role
            $founderRole = Role::where('name', 'founder')->first();
            if ($founderRole) {
                $founder = User::role('founder')->first();
            }
        }

        if (! $founder) {
            $this->info('  - Creating fresh Founder account...');
            $founder = User::create([
                'name'              => 'Rajesh Kumar',
                'email'             => 'founder@creativals.com',
                'password'          => Hash::make('password'),
                'status'            => 'active',
                'email_verified_at' => now(),
            ]);
        }

        $founderId = $founder->id;

        // Ensure founder role is assigned
        if (! $founder->hasRole('founder')) {
            $founder->assignRole('founder');
        }

        // Delete all users except founder
        DB::table('model_has_roles')
            ->where('model_type', User::class)
            ->where('model_id', '!=', $founderId)
            ->delete();

        DB::table('model_has_permissions')
            ->where('model_type', User::class)
            ->where('model_id', '!=', $founderId)
            ->delete();

        DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)
            ->where('tokenable_id', '!=', $founderId)
            ->delete();

        User::where('id', '!=', $founderId)->delete();
        $this->info("  - Preserved Founder: {$founder->name} <{$founder->email}> (ID: {$founderId})");

        // 3. Reset Number Sequences
        if (DB::getSchemaBuilder()->hasTable('number_sequences')) {
            DB::table('number_sequences')->update(['current_number' => 0]);
            $this->info('  - Reset all number sequences to 0');
        }

        // Re-enable foreign key checks
        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = ON;');
        } elseif ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 1;');
        }

        // 4. Ensure essential base seeders have run via db:seed
        $seeders = [
            \Database\Seeders\CurrencySeeder::class,
            \Database\Seeders\DepartmentSeeder::class,
            \Database\Seeders\RolesPermissionsSeeder::class,
            \Database\Seeders\CompanySettingsSeeder::class,
            \Database\Seeders\NumberSequenceSeeder::class,
            \Database\Seeders\LeadStageSeeder::class,
            \Database\Seeders\LeadSourceSeeder::class,
        ];

        foreach ($seeders as $seederClass) {
            $this->call('db:seed', ['--class' => $seederClass, '--force' => true]);
        }

        // 5. Clean public storage uploads
        $publicStoragePath = storage_path('app/public');
        if (File::exists($publicStoragePath)) {
            $directories = File::directories($publicStoragePath);
            foreach ($directories as $directory) {
                File::deleteDirectory($directory);
            }
            $files = File::files($publicStoragePath);
            foreach ($files as $file) {
                if ($file->getFilename() !== '.gitignore') {
                    File::delete($file->getPathname());
                }
            }
            $this->info('  - Cleaned uploaded storage files');
        }

        $this->info('✅ Production reset complete! System is clean with only the Founder account remaining.');

        return Command::SUCCESS;
    }
}
