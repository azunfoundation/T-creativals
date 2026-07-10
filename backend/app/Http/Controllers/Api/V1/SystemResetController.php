<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class SystemResetController extends Controller
{
    /**
     * Helper to get database path.
     */
    protected function getDatabasePath(): string
    {
        return DB::connection()->getDatabaseName();
    }

    /**
     * Helper to get backup directory.
     */
    protected function getBackupDirectory(): string
    {
        $path = storage_path('app/backups');
        if (!File::exists($path)) {
            File::makeDirectory($path, 0755, true, true);
        }
        return $path;
    }

    /**
     * Automatically create database backup and verify integrity.
     */
    protected function createBackup(Request $request): string
    {
        $dbPath = $this->getDatabasePath();
        $isMemory = ($dbPath === ':memory:');

        if ($isMemory) {
            $dbPathDir = storage_path('app');
            if (!File::exists($dbPathDir)) {
                File::makeDirectory($dbPathDir, 0755, true, true);
            }
            $dbPath = $dbPathDir . '/temp_test_db.sqlite';
            if (!File::exists($dbPath)) {
                $tempPdo = new \PDO("sqlite:" . $dbPath);
                $tempPdo->exec("CREATE TABLE IF NOT EXISTS test_integrity (id INTEGER PRIMARY KEY);");
                $tempPdo = null;
            }
        } elseif (!File::exists($dbPath)) {
            throw new \Exception('Active SQLite database file not found.');
        }

        $timestamp = now()->format('Y-m-d_H-i-s');
        $filename = "reset-backup-{$timestamp}.sqlite";
        $backupPath = $this->getBackupDirectory() . DIRECTORY_SEPARATOR . $filename;

        // Copy database file
        File::copy($dbPath, $backupPath);

        // Verify integrity
        try {
            $tempPdo = new \PDO("sqlite:" . $backupPath);
            $stmt = $tempPdo->query("PRAGMA integrity_check;");
            $check = $stmt ? $stmt->fetchColumn() : 'failed';
            if ($check !== 'ok') {
                throw new \Exception("SQLite integrity check returned: " . $check);
            }
        } catch (\Exception $e) {
            if (File::exists($backupPath)) {
                File::delete($backupPath);
            }
            throw new \Exception("Backup integrity verification failed: " . $e->getMessage());
        }

        // Log manual backup to AuditLog
        AuditLog::create([
            'user_id' => $request->user()->id,
            'auditable_type' => AuditLog::class,
            'auditable_id' => 0,
            'event' => 'created',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'metadata' => ['type' => 'auto_reset_backup', 'filename' => $filename],
        ]);

        return $filename;
    }

    /**
     * Clear list of tables safely.
     */
    protected function clearTables(array $tables): void
    {
        foreach ($tables as $table) {
            if (Schema::hasTable($table)) {
                DB::table($table)->delete();
            }
        }
    }

    /**
     * Check if user is authorized (founder only).
     */
    protected function authorizeFounder(Request $request): ?JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->hasRole('founder')) {
            return response()->json(['message' => 'This action is unauthorized. Only the founder can perform this.'], 403);
        }
        return null;
    }

    /**
     * Validate the confirm password.
     */
    protected function confirmPassword(Request $request): ?JsonResponse
    {
        $user = $request->user();
        if (!Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'The provided password was incorrect.',
                'errors' => ['password' => ['The password does not match our records.']]
            ], 422);
        }
        return null;
    }

    /**
     * Reset Entire Platform
     * POST /api/v1/system/reset
     */
    public function resetPlatform(Request $request): JsonResponse
    {
        if ($authError = $this->authorizeFounder($request)) {
            return $authError;
        }

        $request->validate([
            'password' => ['required', 'string'],
            'confirmation' => ['required', 'string'],
        ]);

        if ($request->confirmation !== 'RESET ENTIRE PLATFORM') {
            return response()->json([
                'message' => 'The confirmation text does not match.',
                'errors' => ['confirmation' => ['You must type: RESET ENTIRE PLATFORM']]
            ], 422);
        }

        if ($passError = $this->confirmPassword($request)) {
            return $passError;
        }

        try {
            // 1. Create and verify backup
            $backupFile = $this->createBackup($request);

            // 2. Count records to report impact
            $deletedCounts = [
                'leads' => DB::table('leads')->count(),
                'clients' => User::role('client')->count(),
                'projects' => DB::table('projects')->count(),
                'tasks' => DB::table('tasks')->count(),
                'milestones' => DB::table('milestones')->count(),
                'timesheets' => DB::table('timesheets')->count(),
                'attendance' => DB::table('attendance_records')->count(),
                'leave_requests' => DB::table('leave_requests')->count(),
                'expenses' => DB::table('expenses')->count(),
                'quotes' => DB::table('quotes')->count(),
                'invoices' => DB::table('invoices')->count(),
                'payments' => DB::table('payments')->count(),
                'payroll_runs' => DB::table('payroll_runs')->count(),
                'notifications' => DB::table('alerts')->count(),
            ];

            // 3. Wiping database
            Schema::disableForeignKeyConstraints();

            // Clear physical document files
            $docs = DB::table('project_documents')->get();
            foreach ($docs as $doc) {
                if ($doc->file_path && Storage::disk('public')->exists($doc->file_path)) {
                    Storage::disk('public')->delete($doc->file_path);
                }
            }
            $taskAtts = DB::table('task_attachments')->get();
            foreach ($taskAtts as $att) {
                if ($att->file_path && Storage::disk('public')->exists($att->file_path)) {
                    Storage::disk('public')->delete($att->file_path);
                }
            }
            $expAtts = DB::table('expense_attachments')->get();
            foreach ($expAtts as $att) {
                if ($att->file_path && Storage::disk('public')->exists($att->file_path)) {
                    Storage::disk('public')->delete($att->file_path);
                }
            }

            // Tables to wipe for complete reset
            $tablesToClear = [
                'leads', 'lead_contacts', 'lead_activities', 'lead_followups', 'lead_tags', 'lead_services',
                'client_communications',
                'projects', 'project_members', 'project_departments', 'project_documents', 'milestones',
                'tasks', 'task_comments', 'task_attachments', 'task_dependencies', 'task_template_items', 'task_templates',
                'timesheets', 'timesheet_approvals',
                'attendance_records', 'leave_requests',
                'expenses', 'expense_attachments',
                'quotes', 'quote_items', 'quote_approvals',
                'invoices', 'invoice_items', 'invoice_approvals', 'payments', 'recurring_billing_rules', 'recurring_billing_rule_items', 'credit_notes',
                'payroll_runs', 'payroll_run_items', 'payroll_adjustments', 'bonuses', 'employee_compensations',
                'ai_attachments', 'ai_audit_logs', 'ai_automations', 'ai_conversations', 'ai_memories', 'ai_messages',
                'alerts', 'notification_preferences',
                'login_activities',
                'sessions', 'personal_access_tokens', 'password_reset_tokens',
                'deleted_records',
                'audit_logs' // wiped last
            ];

            $this->clearTables($tablesToClear);

            // Delete client portal users without triggering events that violate DB check constraints
            User::withoutEvents(function () {
                $clientUsers = User::role('client')->orWhere('is_client_portal_user', true)->get();
                foreach ($clientUsers as $clientUser) {
                    DB::table('model_has_roles')->where('model_id', $clientUser->id)->where('model_type', User::class)->delete();
                    DB::table('model_has_permissions')->where('model_id', $clientUser->id)->where('model_type', User::class)->delete();
                    DB::table('user_departments')->where('user_id', $clientUser->id)->delete();
                    $clientUser->forceDelete();
                }
            });

            // Remove uploads folder
            Storage::disk('public')->deleteDirectory('uploads');

            Schema::enableForeignKeyConstraints();

            // Clear reports and general cache
            Cache::flush();

            // Re-create the platform reset audit log, using the allowed 'deleted' event name
            AuditLog::create([
                'user_id' => $request->user()->id,
                'auditable_type' => User::class,
                'auditable_id' => $request->user()->id,
                'event' => 'deleted',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'metadata' => [
                    'reset_type' => 'complete_platform_reset',
                    'records_deleted' => $deletedCounts,
                    'backup_file' => $backupFile,
                ],
            ]);

            return response()->json([
                'message' => 'Platform Reset Complete',
                'data' => [
                    'backup_file' => $backupFile,
                    'deleted_counts' => $deletedCounts,
                ]
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Platform Reset Failed: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Reset Specific Module Data
     * POST /api/v1/system/reset/module
     */
    public function resetModule(Request $request): JsonResponse
    {
        if ($authError = $this->authorizeFounder($request)) {
            return $authError;
        }

        $request->validate([
            'password' => ['required', 'string'],
            'module' => ['required', 'string', 'in:crm,clients,projects,tasks,payroll,attendance,expenses,quotes,invoices,reports'],
        ]);

        if ($passError = $this->confirmPassword($request)) {
            return $passError;
        }

        $module = $request->module;

        try {
            $backupFile = $this->createBackup($request);

            $deletedCounts = [];
            Schema::disableForeignKeyConstraints();

            switch ($module) {
                case 'crm':
                    $deletedCounts['leads'] = DB::table('leads')->count();
                    $deletedCounts['lead_contacts'] = DB::table('lead_contacts')->count();
                    $deletedCounts['lead_activities'] = DB::table('lead_activities')->count();
                    $deletedCounts['lead_followups'] = DB::table('lead_followups')->count();
                    $deletedCounts['lead_tags'] = DB::table('lead_tags')->count();
                    $deletedCounts['lead_services'] = DB::table('lead_services')->count();

                    $this->clearTables([
                        'leads', 'lead_contacts', 'lead_activities', 'lead_followups', 'lead_tags', 'lead_services'
                    ]);
                    break;

                case 'clients':
                    $deletedCounts['client_communications'] = DB::table('client_communications')->count();
                    $deletedCounts['clients'] = User::role('client')->count();

                    $this->clearTables(['client_communications']);

                    User::withoutEvents(function () {
                        $clientUsers = User::role('client')->orWhere('is_client_portal_user', true)->get();
                        foreach ($clientUsers as $clientUser) {
                            DB::table('model_has_roles')->where('model_id', $clientUser->id)->where('model_type', User::class)->delete();
                            DB::table('model_has_permissions')->where('model_id', $clientUser->id)->where('model_type', User::class)->delete();
                            DB::table('user_departments')->where('user_id', $clientUser->id)->delete();
                            $clientUser->forceDelete();
                        }
                    });
                    break;

                case 'projects':
                    $deletedCounts['projects'] = DB::table('projects')->count();
                    $deletedCounts['project_members'] = DB::table('project_members')->count();
                    $deletedCounts['project_documents'] = DB::table('project_documents')->count();
                    $deletedCounts['milestones'] = DB::table('milestones')->count();

                    $docs = DB::table('project_documents')->get();
                    foreach ($docs as $doc) {
                        if ($doc->file_path && Storage::disk('public')->exists($doc->file_path)) {
                            Storage::disk('public')->delete($doc->file_path);
                        }
                    }

                    $this->clearTables([
                        'projects', 'project_members', 'project_departments', 'project_documents', 'milestones'
                    ]);
                    break;

                case 'tasks':
                    $deletedCounts['tasks'] = DB::table('tasks')->count();
                    $deletedCounts['task_comments'] = DB::table('task_comments')->count();
                    $deletedCounts['task_attachments'] = DB::table('task_attachments')->count();
                    $deletedCounts['timesheets'] = DB::table('timesheets')->count();

                    $taskAtts = DB::table('task_attachments')->get();
                    foreach ($taskAtts as $att) {
                        if ($att->file_path && Storage::disk('public')->exists($att->file_path)) {
                            Storage::disk('public')->delete($att->file_path);
                        }
                    }

                    $this->clearTables([
                        'tasks', 'task_comments', 'task_attachments', 'task_dependencies', 'task_template_items', 'task_templates',
                        'timesheets', 'timesheet_approvals'
                    ]);
                    break;

                case 'payroll':
                    $deletedCounts['payroll_runs'] = DB::table('payroll_runs')->count();
                    $deletedCounts['payroll_adjustments'] = DB::table('payroll_adjustments')->count();
                    $deletedCounts['employee_compensations'] = DB::table('employee_compensations')->count();

                    $this->clearTables([
                        'payroll_runs', 'payroll_run_items', 'payroll_adjustments', 'bonuses', 'employee_compensations'
                    ]);
                    break;

                case 'attendance':
                    $deletedCounts['attendance_records'] = DB::table('attendance_records')->count();
                    $deletedCounts['leave_requests'] = DB::table('leave_requests')->count();

                    $this->clearTables(['attendance_records', 'leave_requests']);
                    break;

                case 'expenses':
                    $deletedCounts['expenses'] = DB::table('expenses')->count();
                    $deletedCounts['expense_attachments'] = DB::table('expense_attachments')->count();

                    $expAtts = DB::table('expense_attachments')->get();
                    foreach ($expAtts as $att) {
                        if ($att->file_path && Storage::disk('public')->exists($att->file_path)) {
                            Storage::disk('public')->delete($att->file_path);
                        }
                    }

                    $this->clearTables(['expenses', 'expense_attachments']);
                    break;

                case 'quotes':
                    $deletedCounts['quotes'] = DB::table('quotes')->count();
                    $deletedCounts['quote_items'] = DB::table('quote_items')->count();

                    $this->clearTables(['quotes', 'quote_items', 'quote_approvals']);
                    break;

                case 'invoices':
                    $deletedCounts['invoices'] = DB::table('invoices')->count();
                    $deletedCounts['payments'] = DB::table('payments')->count();
                    $deletedCounts['recurring_billing_rules'] = DB::table('recurring_billing_rules')->count();

                    $this->clearTables([
                        'invoices', 'invoice_items', 'invoice_approvals', 'payments', 'recurring_billing_rules', 'recurring_billing_rule_items', 'credit_notes'
                    ]);
                    break;

                case 'reports':
                    $deletedCounts['reports_cache'] = 1;
                    break;
            }

            Schema::enableForeignKeyConstraints();

            // Clear cache
            Cache::flush();

            AuditLog::create([
                'user_id' => $request->user()->id,
                'auditable_type' => User::class,
                'auditable_id' => $request->user()->id,
                'event' => 'deleted', // allowed!
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'metadata' => [
                    'reset_type' => 'module_reset',
                    'module' => $module,
                    'records_deleted' => $deletedCounts,
                    'backup_file' => $backupFile,
                ],
            ]);

            return response()->json([
                'message' => 'Module Reset Complete',
                'data' => [
                    'backup_file' => $backupFile,
                    'deleted_counts' => $deletedCounts,
                ]
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Module Reset Failed: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Factory Reset
     * POST /api/v1/system/factory-reset
     */
    public function factoryReset(Request $request): JsonResponse
    {
        if ($authError = $this->authorizeFounder($request)) {
            return $authError;
        }

        $request->validate([
            'password' => ['required', 'string'],
            'confirmation' => ['required', 'string'],
        ]);

        if ($request->confirmation !== 'FACTORY RESET') {
            return response()->json([
                'message' => 'The confirmation text does not match.',
                'errors' => ['confirmation' => ['You must type: FACTORY RESET']]
            ], 422);
        }

        if ($passError = $this->confirmPassword($request)) {
            return $passError;
        }

        try {
            $backupFile = $this->createBackup($request);

            Schema::disableForeignKeyConstraints();

            // Clear files
            Storage::disk('public')->deleteDirectory('uploads');

            // Delete all operational business data
            $allOperationalTables = [
                'leads', 'lead_contacts', 'lead_activities', 'lead_followups', 'lead_tags', 'lead_services',
                'client_communications',
                'projects', 'project_members', 'project_departments', 'project_documents', 'milestones',
                'tasks', 'task_comments', 'task_attachments', 'task_dependencies', 'task_template_items', 'task_templates',
                'timesheets', 'timesheet_approvals',
                'attendance_records', 'leave_requests',
                'expenses', 'expense_attachments',
                'quotes', 'quote_items', 'quote_approvals',
                'invoices', 'invoice_items', 'invoice_approvals', 'payments', 'recurring_billing_rules', 'recurring_billing_rule_items', 'credit_notes',
                'payroll_runs', 'payroll_run_items', 'payroll_adjustments', 'bonuses', 'employee_compensations',
                'ai_attachments', 'ai_audit_logs', 'ai_automations', 'ai_conversations', 'ai_memories', 'ai_messages',
                'alerts', 'notification_preferences',
                'login_activities',
                'sessions', 'personal_access_tokens', 'password_reset_tokens',
                'deleted_records',
                'audit_logs'
            ];
            $this->clearTables($allOperationalTables);

            // Delete all users except the founder user without triggering observer check constraint errors
            $founder = $request->user();
            User::withoutEvents(function () use ($founder) {
                // Clear the founder's pivots first to avoid foreign key violations on roles/permissions/departments
                DB::table('model_has_roles')->where('model_id', $founder->id)->where('model_type', User::class)->delete();
                DB::table('model_has_permissions')->where('model_id', $founder->id)->where('model_type', User::class)->delete();
                DB::table('user_departments')->where('user_id', $founder->id)->delete();

                $otherUserIds = User::where('id', '!=', $founder->id)->pluck('id')->toArray();
                
                DB::table('model_has_roles')->whereIn('model_id', $otherUserIds)->where('model_type', User::class)->delete();
                DB::table('model_has_permissions')->whereIn('model_id', $otherUserIds)->where('model_type', User::class)->delete();
                DB::table('user_departments')->whereIn('user_id', $otherUserIds)->delete();
                DB::table('manager_relationships')->whereIn('employee_id', $otherUserIds)->orWhereIn('manager_id', $otherUserIds)->delete();
                
                DB::table('password_reset_tokens')->delete();
                DB::table('personal_access_tokens')->whereNotIn('tokenable_id', [$founder->id])->where('tokenable_type', User::class)->delete();
                
                User::where('id', '!=', $founder->id)->forceDelete();
            });

            // Clear system configurations & settings in a strict dependency-aware order
            $configTables = [
                'package_services',
                'services',
                'packages',
                'discount_coupons',
                'service_categories',
                'expense_categories',
                'vendors',
                'currencies',
                'company_settings',
                'number_sequences',
                'lead_stages',
                'lead_sources',
                'user_departments',
                'manager_relationships',
                'departments',
                'leave_types',
                'holidays',
                'compensation_types',
                'role_has_permissions',
                'model_has_roles',
                'model_has_permissions',
                'roles',
                'permissions'
            ];
            $this->clearTables($configTables);

            // Temporarily forget the authenticated user and override default guard to 'web' 
            // so Spatie permissions can seed roles under the 'web' guard instead of 'sanctum'.
            $originalUser = auth()->user();
            $originalGuard = config('auth.defaults.guard');
            auth()->forgetUser();
            config(['auth.defaults.guard' => 'web']);

            // Re-run seeders to restore factory configuration defaults
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\CurrencySeeder']);
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\DepartmentSeeder']);
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\RolesPermissionsSeeder']);
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\CompanySettingsSeeder']);
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\NumberSequenceSeeder']);
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\LeadStageSeeder']);
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\LeadSourceSeeder']);
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\ServiceCategorySeeder']);
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\ServiceSeeder']);
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\LeaveHolidaySeeder']);

            // Restore original auth context and default guard
            config(['auth.defaults.guard' => $originalGuard]);
            if ($originalUser) {
                auth()->setUser($originalUser);
            }

            // Restore default compensation types
            \App\Models\CompensationType::firstOrCreate(
                ['type' => 'fixed'],
                ['name' => 'Fixed Salary', 'description' => 'Standard fixed monthly payout']
            );
            \App\Models\CompensationType::firstOrCreate(
                ['type' => 'hourly'],
                ['name' => 'Hourly Wages', 'description' => 'Payout based strictly on logged timesheet hours']
            );
            \App\Models\CompensationType::firstOrCreate(
                ['type' => 'hybrid'],
                ['name' => 'Hybrid (Fixed + Hourly)', 'description' => 'Fixed base salary plus hourly payment for logged hours']
            );

            // Re-assign founder role directly in the pivot table to avoid Spatie guard mismatch
            $founderRole = DB::table('roles')->where('name', 'founder')->where('guard_name', 'web')->first();
            if ($founderRole) {
                DB::table('model_has_roles')->insert([
                    'role_id' => $founderRole->id,
                    'model_type' => User::class,
                    'model_id' => $founder->id,
                ]);
            }

            Schema::enableForeignKeyConstraints();

            Cache::flush();

            AuditLog::create([
                'user_id' => $founder->id,
                'auditable_type' => User::class,
                'auditable_id' => $founder->id,
                'event' => 'deleted', // allowed!
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'metadata' => [
                    'reset_type' => 'factory_reset',
                    'backup_file' => $backupFile,
                ],
            ]);

            return response()->json([
                'message' => 'Factory Reset Complete',
                'data' => [
                    'backup_file' => $backupFile,
                ]
            ]);

        } catch (\Exception $e) {
            logger()->error('Factory Reset Failed: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
            return response()->json([
                'message' => 'Factory Reset Failed: ' . $e->getMessage()
            ], 500);
        }
    }
}
