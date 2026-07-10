<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\Department;
use App\Models\Lead;
use App\Models\Quote;
use App\Models\User;
use App\Models\CompanySetting;
use Illuminate\Support\Facades\Schema;
use App\Observers\AuditObserver;
use App\Observers\LeadObserver;
use App\Observers\QuoteObserver;
use App\Observers\AiAutomationObserver;
use App\Policies\DepartmentPolicy;
use App\Policies\LeadPolicy;
use App\Policies\QuotePolicy;
use App\Policies\UserPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Spatie\Permission\Models\Role;

class AppServiceProvider extends ServiceProvider
{
    /**
     * All of the container bindings that should be registered.
     */
    public array $bindings = [];

    /**
     * All of the container singletons that should be registered.
     */
    public array $singletons = [];

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Register policies explicitly in case auto-discovery is off
        Gate::policy(User::class, UserPolicy::class);
        Gate::policy(Role::class, \App\Policies\RolePolicy::class);
        Gate::policy(Department::class, DepartmentPolicy::class);
        Gate::policy(Lead::class, LeadPolicy::class);
        Gate::policy(Quote::class, QuotePolicy::class);
        Gate::policy(\App\Models\Invoice::class, \App\Policies\InvoicePolicy::class);
        Gate::policy(\App\Models\CreditNote::class, \App\Policies\CreditNotePolicy::class);
        Gate::policy(\App\Models\Payment::class, \App\Policies\PaymentPolicy::class);
        Gate::policy(\App\Models\RecurringBillingRule::class, \App\Policies\RecurringBillingRulePolicy::class);
        Gate::policy(\App\Models\Project::class, \App\Policies\ProjectPolicy::class);
        Gate::policy(\App\Models\Task::class, \App\Policies\TaskPolicy::class);
        Gate::policy(\App\Models\Timesheet::class, \App\Policies\TimesheetPolicy::class);
        Gate::policy(\App\Models\PayrollRun::class, \App\Policies\PayrollPolicy::class);
        Gate::policy(\App\Models\EmployeeCompensation::class, \App\Policies\EmployeeCompensationPolicy::class);
        Gate::policy(\App\Models\Bonus::class, \App\Policies\BonusPolicy::class);
        Gate::policy(\App\Models\Expense::class, \App\Policies\ExpensePolicy::class);
        Gate::policy(\App\Models\AttendanceRecord::class, \App\Policies\AttendancePolicy::class);
        Gate::policy(\App\Models\LeaveRequest::class, \App\Policies\LeavePolicy::class);
        Gate::policy(\App\Models\Holiday::class, \App\Policies\HolidayPolicy::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // ─── Protect Live Data & User Sessions ───────────────────────────────
        // migrate:fresh / migrate:refresh / migrate:reset / migrate:rollback /
        // db:wipe drop tables — including personal_access_tokens — which logs
        // every user out. Block them everywhere except the test suite, unless
        // ALLOW_DESTRUCTIVE_DB_COMMANDS=true is set for an intentional reset.
        DB::prohibitDestructiveCommands(
            ! $this->app->environment('testing')
            && ! config('database.allow_destructive_commands')
        );

        // ─── Dynamic Mail Configuration ──────────────────────────────────────
        // SMTP settings saved on the Settings page (company_settings table) are
        // authoritative at runtime. Crucially this must also switch the DEFAULT
        // mailer to smtp — otherwise MAIL_MAILER in .env (e.g. "log") silently
        // discards every email even though the SMTP credentials are configured.
        try {
            if (Schema::hasTable('company_settings')) {
                $settings = CompanySetting::where('group', 'smtp')->pluck('value', 'key');
                if ($settings->has('smtp_host')) {
                    config([
                        'mail.default'                 => 'smtp',
                        'mail.mailers.smtp.host'       => $settings->get('smtp_host'),
                        'mail.mailers.smtp.port'       => (int)$settings->get('smtp_port', 587),
                        'mail.mailers.smtp.username'   => $settings->get('smtp_username'),
                        'mail.mailers.smtp.password'   => $settings->get('smtp_password'),
                        'mail.mailers.smtp.encryption' => $settings->get('smtp_encryption', 'tls'),
                        'mail.from.address'            => $settings->get('smtp_from_email'),
                        'mail.from.name'               => $settings->get('smtp_from_name'),
                    ]);
                }
            }
        } catch (\Throwable $e) {
            // Ignore database connection issues during migrations/seeds
        }

        // ─── Observers ───────────────────────────────────────────────────────
        User::observe(AuditObserver::class);
        Department::observe(AuditObserver::class);
        Lead::observe(LeadObserver::class);
        Lead::observe(AuditObserver::class);
        Quote::observe(QuoteObserver::class);
        Quote::observe(AuditObserver::class);
        \App\Models\Invoice::observe(AuditObserver::class);
        \App\Models\Payment::observe(AuditObserver::class);
        \App\Models\RecurringBillingRule::observe(AuditObserver::class);
        \App\Models\Project::observe(AuditObserver::class);
        \App\Models\Milestone::observe(AuditObserver::class);
        \App\Models\Task::observe(\App\Observers\TaskObserver::class);
        \App\Models\Task::observe(AuditObserver::class);
        \App\Models\Timesheet::observe(\App\Observers\TimesheetObserver::class);
        \App\Models\Timesheet::observe(AuditObserver::class);
        \App\Models\PayrollRun::observe(AuditObserver::class);
        \App\Models\Expense::observe(AuditObserver::class);

        // AI Automations Reactive Observers
        Lead::observe(AiAutomationObserver::class);
        \App\Models\Invoice::observe(AiAutomationObserver::class);
        \App\Models\Project::observe(AiAutomationObserver::class);
        \App\Models\Task::observe(AiAutomationObserver::class);

        // ─── Gates ───────────────────────────────────────────────────────────

        /**
         * Access to the recovery bin (view + restore deleted records) is gated on
         * the 'recovery.restore' permission — seeded to founder only, and explicitly
         * excluded from director (see RolesPermissionsSeeder).
         * Usable as: Gate::authorize('access-recovery-bin')
         */
        Gate::define('access-recovery-bin', function (User $user): bool {
            return $user->hasPermissionTo('recovery.restore');
        });

        /**
         * Dynamic permission gate: any permission string can be checked
         * as a gate ability if it doesn't have a dedicated policy.
         * e.g. Gate::allows('audit-logs.view')
         */
        Gate::before(function (User $user, string $ability): ?bool {
            // Founders pass every gate check
            if ($user->hasRole('founder')) {
                return true;
            }

            return null;
        });

        // ─── Rate Limiters ────────────────────────────────────────────────────

        /**
         * Login endpoint: 5 attempts per minute per IP.
         */
        RateLimiter::for('login', function (Request $request): Limit {
            return Limit::perMinute(5)
                ->by($request->ip())
                ->response(function () {
                    return response()->json([
                        'message' => 'Too many login attempts. Please wait before trying again.',
                    ], 429);
                });
        });

        /**
         * General API: 60 requests per minute per authenticated user or IP.
         */
        RateLimiter::for('api', function (Request $request): Limit {
            return Limit::perMinute(60)
                ->by($request->user()?->id ?: $request->ip())
                ->response(function () {
                    return response()->json([
                        'message' => 'Too many requests. Please slow down.',
                    ], 429);
                });
        });
    }
}
