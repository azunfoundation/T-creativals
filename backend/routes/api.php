<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\ClientController;
use App\Http\Controllers\Api\V1\DepartmentController;
use App\Http\Controllers\Api\V1\RecoveryController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\LeadSourceController;
use App\Http\Controllers\Api\V1\LeadStageController;
use App\Http\Controllers\Api\V1\AlertController;
use App\Http\Controllers\Api\V1\ServiceCategoryController;
use App\Http\Controllers\Api\V1\ServiceController;
use App\Http\Controllers\Api\V1\PackageController;
use App\Http\Controllers\Api\V1\DiscountCouponController;
use App\Http\Controllers\Api\V1\QuoteController;
use App\Http\Controllers\Api\V1\InvoiceController;
use App\Http\Controllers\Api\V1\CreditNoteController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\RecurringBillingRuleController;
use App\Http\Controllers\Api\V1\ProjectController;
use App\Http\Controllers\Api\V1\MilestoneController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\TaskTemplateController;
use App\Http\Controllers\Api\V1\TimesheetController;
use App\Http\Controllers\Api\V1\PayrollRunController;
use App\Http\Controllers\Api\V1\EmployeeCompensationController;
use App\Http\Controllers\Api\V1\BonusController;
use App\Http\Controllers\Api\V1\ExpenseController;
use App\Http\Controllers\Api\V1\VendorController;
use App\Http\Controllers\Api\V1\PortalController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\SettingController;
use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\BackupController;
use App\Http\Controllers\Api\V1\AttendanceController;
use App\Http\Controllers\Api\V1\LeaveController;
use App\Http\Controllers\Api\V1\NotificationPreferenceController;
use App\Http\Controllers\Api\V1\FileController;
use App\Http\Controllers\Api\V1\TaskAttachmentController;
use App\Http\Controllers\Api\V1\ProjectDocumentController;
use App\Http\Controllers\Api\V1\ClientCommunicationController;
use App\Http\Controllers\Api\V1\AiController;
use App\Http\Controllers\Api\V1\AiAutomationController;
use App\Http\Controllers\Api\V1\SystemResetController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — Creativals OS v1
|--------------------------------------------------------------------------
|
| All routes are prefixed with /api automatically by Laravel's bootstrap.
| Additional v1 prefix is applied here for versioning.
|
*/

Route::prefix('v1')->name('api.v1.')->group(function () {

    /*
    |--------------------------------------------------------------------------
    | Health Check (Public)
    |--------------------------------------------------------------------------
    */
    Route::get('/health', \App\Http\Controllers\Api\V1\HealthController::class)->name('health');

    /*
    |--------------------------------------------------------------------------
    | Authentication Routes (Public)
    |--------------------------------------------------------------------------
    */
    Route::prefix('auth')->name('auth.')->group(function () {

        // Login — rate limited at 5 attempts per minute
        Route::post('/login', [AuthController::class, 'login'])
            ->name('login')
            ->middleware('throttle:login');

        // Password reset — public, throttled
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])
            ->name('forgot-password')
            ->middleware('throttle:5,1');

        Route::post('/reset-password', [AuthController::class, 'resetPassword'])
            ->name('reset-password')
            ->middleware('throttle:5,1');

        // Protected auth routes (staff sessions only — the portal has its own
        // login and never calls these)
        Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsureStaffToken::class])->group(function () {
            Route::post('/logout',           [AuthController::class, 'logout'])->name('logout');
            Route::post('/logout-all',       [AuthController::class, 'logoutAll'])->name('logout-all');
            Route::get('/me',                [AuthController::class, 'me'])->name('me');
            Route::get('/login-activity',    [AuthController::class, 'loginActivity'])->name('login-activity');
            Route::post('/change-password',  [AuthController::class, 'changePassword'])->name('change-password');
        });
    });

    /*
    |--------------------------------------------------------------------------
    | Protected API Routes — Require Authentication
    |--------------------------------------------------------------------------
    */
    Route::middleware(['auth:sanctum', 'throttle:api', \App\Http\Middleware\EnsureStaffToken::class])->group(function () {

        /*
        |----------------------------------------------------------------------
        | Users
        |----------------------------------------------------------------------
        */
        Route::prefix('users')->name('users.')->group(function () {
            Route::get('/',    [UserController::class, 'index'])->name('index');
            Route::post('/',   [UserController::class, 'store'])->name('store');

            Route::prefix('{user}')->group(function () {
                Route::get('/',    [UserController::class, 'show'])->name('show');
                Route::put('/',    [UserController::class, 'update'])->name('update');
                Route::delete('/', [UserController::class, 'destroy'])->name('destroy');

                // Reset a user's password (admin action)
                Route::post('/reset-password', [UserController::class, 'resetPassword'])->name('reset-password');

                // Resend welcome email with a fresh temporary password
                Route::post('/resend-invite', [UserController::class, 'resendInvite'])->name('resend-invite');

                // Assign roles to user
                Route::put('/roles',       [UserController::class, 'syncRoles'])->name('sync-roles');

                // Assign departments to user
                Route::put('/departments', [UserController::class, 'syncDepartments'])->name('sync-departments');
            });
        });

        /*
        |----------------------------------------------------------------------
        | Roles & Permissions
        |----------------------------------------------------------------------
        */
        Route::prefix('roles')->name('roles.')->group(function () {
            Route::get('/',    [RoleController::class, 'index'])->name('index');
            Route::post('/',   [RoleController::class, 'store'])->name('store');

            Route::prefix('{role}')->group(function () {
                Route::get('/',    [RoleController::class, 'show'])->name('show');
                Route::put('/',    [RoleController::class, 'update'])->name('update');
                Route::delete('/', [RoleController::class, 'destroy'])->name('destroy');

                // Sync permissions to a role
                Route::put('/permissions', [RoleController::class, 'syncPermissions'])->name('sync-permissions');
            });
        });

        // List all permissions grouped by module
        Route::get('/permissions', [RoleController::class, 'permissions'])->name('permissions.index');

        /*
        |----------------------------------------------------------------------
        | Departments
        |----------------------------------------------------------------------
        */
        Route::prefix('departments')->name('departments.')->group(function () {
            Route::get('/',    [DepartmentController::class, 'index'])->name('index');
            Route::post('/',   [DepartmentController::class, 'store'])->name('store');

            Route::prefix('{department}')->group(function () {
                Route::get('/',    [DepartmentController::class, 'show'])->name('show');
                Route::put('/',    [DepartmentController::class, 'update'])->name('update');
                Route::delete('/', [DepartmentController::class, 'destroy'])->name('destroy');
            });
        });

        /*
        |----------------------------------------------------------------------
        | Recovery Bin (Founder-only enforced in controller via Gate)
        |----------------------------------------------------------------------
        */
        Route::prefix('recovery-bin')->name('recovery.')->group(function () {
            Route::get('/', [RecoveryController::class, 'index'])->name('index');
            Route::post('/{id}/restore', [RecoveryController::class, 'restore'])->name('restore');
        });

        /*
        |----------------------------------------------------------------------
        | CRM Sprint 2
        |----------------------------------------------------------------------
        */
        Route::apiResource('leads', LeadController::class);
        Route::patch('leads/{lead}/stage', [LeadController::class, 'updateStage'])->name('leads.stage');
        Route::post('leads/{lead}/convert', [LeadController::class, 'convert'])->name('leads.convert');
        Route::post('leads/{lead}/activities', [LeadController::class, 'logActivity'])->name('leads.activities');
        Route::patch('leads/{lead}/followups/{followup}/complete', [LeadController::class, 'completeFollowup'])->name('leads.followups.complete');

        Route::apiResource('lead-stages', LeadStageController::class);
        Route::apiResource('lead-sources', LeadSourceController::class);

        Route::prefix('alerts')->name('alerts.')->group(function () {
            Route::get('/', [AlertController::class, 'index'])->name('index');
            Route::post('/read-all', [AlertController::class, 'markAllRead'])->name('read-all');
            Route::post('/{id}/read', [AlertController::class, 'markRead'])->name('read');
            Route::delete('/read', [AlertController::class, 'destroyRead'])->name('destroy-read');
            Route::delete('/{id}', [AlertController::class, 'destroy'])->name('destroy');
        });

        /*
        |----------------------------------------------------------------------
        | Catalog & Quotations Sprint 3
        |----------------------------------------------------------------------
        */
        Route::apiResource('service-categories', ServiceCategoryController::class);
        Route::apiResource('services', ServiceController::class);
        Route::apiResource('packages', PackageController::class);

        Route::get('discount-coupons/{code}/validate', [DiscountCouponController::class, 'validateCoupon'])->name('discount-coupons.validate');
        Route::apiResource('discount-coupons', DiscountCouponController::class);

        Route::get('quotes/{id}/download-pdf', [QuoteController::class, 'downloadPdf'])->name('quotes.download-pdf');
        Route::post('quotes/{id}/submit-approval', [QuoteController::class, 'submitApproval'])->name('quotes.submit-approval');
        Route::post('quotes/{id}/approve', [QuoteController::class, 'approve'])->name('quotes.approve');
        Route::post('quotes/{id}/reject', [QuoteController::class, 'reject'])->name('quotes.reject');
        Route::post('quotes/{id}/send', [QuoteController::class, 'sendMail'])->name('quotes.send');
        Route::apiResource('quotes', QuoteController::class);

        /*
        |----------------------------------------------------------------------
        | Invoices, Payments, & Recurring Rules Sprint 4
        |----------------------------------------------------------------------
        */
        Route::apiResource('recurring-billing-rules', RecurringBillingRuleController::class);
        Route::post('invoices/{invoice}/payments', [InvoiceController::class, 'recordPayment'])->name('invoices.payments');
        Route::post('invoices/{id}/submit-approval', [InvoiceController::class, 'submitApproval'])->name('invoices.submit-approval');
        Route::post('invoices/{id}/review', [InvoiceController::class, 'review'])->name('invoices.review');
        Route::post('invoices/{id}/approve', [InvoiceController::class, 'approve'])->name('invoices.approve');
        Route::post('invoices/{id}/reject', [InvoiceController::class, 'reject'])->name('invoices.reject');
        Route::post('invoices/{id}/send', [InvoiceController::class, 'sendMail'])->name('invoices.send');
        Route::get('invoices/{id}/download-pdf', [InvoiceController::class, 'downloadPdf'])->name('invoices.download-pdf');
        Route::apiResource('invoices', InvoiceController::class);
        Route::apiResource('credit-notes', CreditNoteController::class)->only(['index', 'store']);
        Route::apiResource('payments', PaymentController::class)->only(['index', 'destroy']);

        // ─── Project Management, Tasks, & Timesheets Sprint 5 ──────────────
        // Projects
        Route::get('projects/{project}/profitability', [ProjectController::class, 'profitability']);
        Route::post('projects/{project}/members', [ProjectController::class, 'addMember']);
        Route::delete('projects/{project}/members/{user}', [ProjectController::class, 'removeMember']);
        Route::apiResource('projects', ProjectController::class);

        // Milestones (scoped)
        Route::apiResource('projects/{project}/milestones', MilestoneController::class)->shallow();

        // Tasks
        Route::patch('tasks/{task}/status', [TaskController::class, 'updateStatus']);
        Route::patch('tasks/{task}/completion', [TaskController::class, 'updateCompletion']);
        Route::post('tasks/{task}/comments', [TaskController::class, 'addComment']);
        Route::get('tasks/{task}/comments', [TaskController::class, 'listComments']);
        Route::post('tasks/{task}/time-log', [TaskController::class, 'logTime']);
        Route::post('tasks/{task}/timer/start', [TaskController::class, 'startTimer']);
        Route::post('tasks/{task}/timer/pause', [TaskController::class, 'pauseTimer']);
        Route::post('tasks/{task}/timer/stop', [TaskController::class, 'stopTimer']);
        Route::post('tasks/{task}/timer/reset', [TaskController::class, 'resetTimer']);
        Route::get('projects/{project}/tasks', [TaskController::class, 'projectTasks']);
        Route::apiResource('tasks', TaskController::class);

        // Timesheets
        Route::get('timesheets/pending', [TimesheetController::class, 'pending']);
        Route::post('timesheets/{timesheet}/submit', [TimesheetController::class, 'submit']);
        Route::post('timesheets/{timesheet}/approve', [TimesheetController::class, 'approve']);
        Route::post('timesheets/{timesheet}/reject', [TimesheetController::class, 'reject']);
        Route::get('projects/{project}/timesheets', [TimesheetController::class, 'projectTimesheets']);
        Route::apiResource('timesheets', TimesheetController::class)->only(['index', 'store', 'show', 'update', 'destroy']);

        // ─── Payroll & Expense Management Sprint 6 ──────────────
        Route::get('payroll/my-history', [PayrollRunController::class, 'myHistory'])->name('payroll.my-history');
        Route::get('payroll/items/{item}/download-payslip', [PayrollRunController::class, 'downloadPayslip'])->name('payroll.items.download-payslip');
        Route::get('payroll/runs/{payroll_run}/export', [PayrollRunController::class, 'export'])->name('payroll.runs.export');
        Route::post('payroll/runs/{payroll_run}/approve', [PayrollRunController::class, 'approve'])->name('payroll.runs.approve');
        Route::get('payroll/cost-allocation', [PayrollRunController::class, 'costAllocation'])->name('payroll.cost-allocation');
        Route::apiResource('payroll/runs', PayrollRunController::class)->parameters(['runs' => 'payroll_run'])->only(['index', 'store', 'show', 'destroy']);

        // Salary setup — without this, PayrollRunController@store has nothing to compute from.
        Route::get('compensation-types', [EmployeeCompensationController::class, 'types'])->name('compensation-types.index');
        Route::apiResource('employee-compensations', EmployeeCompensationController::class)->only(['index', 'store', 'update']);

        // Bonuses — create/approve/reject; PayrollRunController@store only ever consumed these, never let anyone create them.
        Route::post('bonuses/{bonus}/approve', [BonusController::class, 'approve'])->name('bonuses.approve');
        Route::post('bonuses/{bonus}/reject', [BonusController::class, 'reject'])->name('bonuses.reject');
        Route::apiResource('bonuses', BonusController::class)->only(['index', 'store']);

        // Expense categories for dropdowns (page previously used hardcoded mocks)
        Route::get('expense-categories', [ExpenseController::class, 'categories'])->name('expense-categories.index');

        Route::post('expenses/{expense}/approve', [ExpenseController::class, 'approve'])->name('expenses.approve');
        Route::post('expenses/{expense}/reject',  [ExpenseController::class, 'reject'])->name('expenses.reject');
        Route::post('expenses/{expense}/submit', [ExpenseController::class, 'submit'])->name('expenses.submit');
        Route::post('expenses/{expense}/reimburse', [ExpenseController::class, 'reimburse'])->name('expenses.reimburse');
        Route::get('expenses/{expense}/timeline', [ExpenseController::class, 'timeline'])->name('expenses.timeline');
        Route::get('expenses/{expense}/download-pdf', [ExpenseController::class, 'downloadPdf'])->name('expenses.download-pdf');
        Route::apiResource('expenses', ExpenseController::class);

        Route::apiResource('vendors', VendorController::class);

        // ─── Reports & Analytics (Sprint 8A) ─────────────────────────
        Route::prefix('reports')
            ->name('reports.')
            ->group(function () {
                Route::get('dashboard',      [ReportController::class, 'dashboardOverview'])->name('dashboard');
                Route::get('dashboard/briefing', [ReportController::class, 'dashboardBriefing'])->name('dashboard.briefing');
                Route::get('revenue',        [ReportController::class, 'revenueSummary'])->name('revenue');
                Route::get('pipeline',       [ReportController::class, 'salesPipeline'])->name('pipeline');
                Route::get('quotes',         [ReportController::class, 'quoteConversion'])->name('quotes');
                Route::get('profitability',  [ReportController::class, 'projectProfitability'])->name('profitability');
                Route::get('utilisation',    [ReportController::class, 'teamUtilisation'])->name('utilisation');
                Route::get('expenses',       [ReportController::class, 'expenseBreakdown'])->name('expenses');
                Route::get('payroll',        [ReportController::class, 'payrollSummary'])->name('payroll');
                Route::get('clients',        [ReportController::class, 'clientSummary'])->name('clients');
            });

        // ─── Settings, Auditing, & Backups (Sprint 8B) ────────────────
        Route::prefix('settings')
            ->name('settings.')
            ->group(function () {
                Route::get('/',                    [SettingController::class, 'index'])->name('index');
                Route::put('company',             [SettingController::class, 'updateCompany'])->name('company');
                Route::put('smtp',                [SettingController::class, 'updateSmtp'])->name('smtp');
                Route::post('smtp/test',          [SettingController::class, 'sendTestEmail'])->name('smtp.test');
                Route::put('tax',                 [SettingController::class, 'updateTax'])->name('tax');
                Route::put('number-sequences',    [SettingController::class, 'updateNumberSequences'])->name('number-sequences');
                Route::put('currencies',          [SettingController::class, 'updateCurrencies'])->name('currencies');
                Route::get('notifications',       [NotificationPreferenceController::class, 'index'])->name('notifications.index');
                Route::put('notifications',       [NotificationPreferenceController::class, 'update'])->name('notifications.update');
            });

        Route::get('audit-logs',                  [AuditLogController::class, 'index'])->name('audit-logs.index');

        Route::prefix('backups')
            ->name('backups.')
            ->group(function () {
                Route::get('/',                   [BackupController::class, 'index'])->name('index');
                Route::post('/',                  [BackupController::class, 'store'])->name('store');
                Route::delete('{filename}',       [BackupController::class, 'destroy'])->name('destroy');
                Route::post('{filename}/restore', [BackupController::class, 'restore'])->name('restore');
            });

        Route::prefix('system')
            ->name('system.')
            ->group(function () {
                Route::post('reset', [SystemResetController::class, 'resetPlatform'])->name('reset');
                Route::post('reset/module', [SystemResetController::class, 'resetModule'])->name('reset.module');
                Route::post('factory-reset', [SystemResetController::class, 'factoryReset'])->name('factory-reset');
            });

        // ─── Attendance Module (Sprint 9) ──────────────────────────────────
        Route::prefix('attendance')->name('attendance.')->group(function () {
            Route::get('/', [AttendanceController::class, 'index'])->name('index');
            Route::get('/today', [AttendanceController::class, 'today'])->name('today');
            Route::get('/team', [AttendanceController::class, 'team'])->name('team');
            Route::get('/summary', [AttendanceController::class, 'summary'])->name('summary');
            Route::post('/clock-in', [AttendanceController::class, 'clockIn'])->name('clock-in');
            Route::post('/clock-out', [AttendanceController::class, 'clockOut'])->name('clock-out');
            Route::post('/', [AttendanceController::class, 'store'])->name('store');
            Route::put('/{record}', [AttendanceController::class, 'update'])->name('update');
            Route::delete('/{record}', [AttendanceController::class, 'destroy'])->name('destroy');
        });

        Route::prefix('leave')->name('leave.')->group(function () {
            Route::get('/types', [LeaveController::class, 'listTypes'])->name('types');
            Route::get('/requests', [LeaveController::class, 'index'])->name('index');
            Route::post('/requests', [LeaveController::class, 'store'])->name('store');
            Route::get('/requests/{leaveRequest}', [LeaveController::class, 'show'])->name('show');
            Route::put('/requests/{leaveRequest}', [LeaveController::class, 'update'])->name('update');
            Route::delete('/requests/{leaveRequest}', [LeaveController::class, 'destroy'])->name('destroy');
            Route::post('/requests/{leaveRequest}/approve', [LeaveController::class, 'approve'])->name('approve');
            Route::post('/requests/{leaveRequest}/reject', [LeaveController::class, 'reject'])->name('reject');
        });

        Route::get('/holidays', [LeaveController::class, 'listHolidays'])->name('holidays.index');
        Route::post('/holidays', [LeaveController::class, 'storeHoliday'])->name('holidays.store');
        Route::put('/holidays/{holiday}', [LeaveController::class, 'updateHoliday'])->name('holidays.update');
        Route::delete('/holidays/{holiday}', [LeaveController::class, 'destroyHoliday'])->name('holidays.destroy');

        // ─── File Upload & Attachments System (Sprint 10) ───────────────────
        Route::post('files/upload', [FileController::class, 'upload'])->name('files.upload');
        Route::apiResource('tasks/{task}/attachments', TaskAttachmentController::class)->only(['index', 'store', 'destroy']);

        // ─── Task Templates (PRD: service templates + recurring projects) ────
        Route::get('task-templates', [TaskTemplateController::class, 'index'])->name('task-templates.index');
        Route::post('task-templates', [TaskTemplateController::class, 'store'])->name('task-templates.store');
        Route::put('task-templates/{taskTemplate}', [TaskTemplateController::class, 'update'])->name('task-templates.update');
        Route::delete('task-templates/{taskTemplate}', [TaskTemplateController::class, 'destroy'])->name('task-templates.destroy');
        Route::post('projects/{project}/apply-template', [TaskTemplateController::class, 'applyToProject'])->name('projects.apply-template');
        Route::apiResource('projects/{project}/documents', ProjectDocumentController::class)->only(['index', 'store', 'destroy']);

        // ─── Clients Module ──────────────────────────────────────────────────
        // The module's own surface, gated on clients.* permission strings
        // (the reports/users endpoints the pages previously rode on require
        // reports.*/users.* permissions the sales roles don't hold).
        Route::get('clients', [ClientController::class, 'index'])->name('clients.index');
        Route::post('clients', [ClientController::class, 'store'])->name('clients.store');
        Route::get('clients/{client}', [ClientController::class, 'show'])->name('clients.show');
        Route::put('clients/{client}', [ClientController::class, 'update'])->name('clients.update');
        Route::delete('clients/{client}', [ClientController::class, 'destroy'])->name('clients.destroy');
        Route::post('clients/{client}/contacts', [ClientController::class, 'storeContact'])->name('clients.contacts.store');
        Route::put('clients/{client}/contacts/{contact}', [ClientController::class, 'updateContact'])->name('clients.contacts.update');
        Route::delete('clients/{client}/contacts/{contact}', [ClientController::class, 'destroyContact'])->name('clients.contacts.destroy');

        Route::apiResource('clients/{client}/communications', ClientCommunicationController::class)->only(['index', 'store', 'destroy']);

        // ─── AI Assistant Module ────────────────────────────────────────────
        Route::prefix('ai')->name('ai.')->group(function () {
            Route::get('status', [AiController::class, 'status']);
            Route::get('conversations', [AiController::class, 'listConversations']);
            Route::post('conversations', [AiController::class, 'createConversation']);
            Route::get('conversations/{id}', [AiController::class, 'getConversation']);
            Route::delete('conversations/{id}', [AiController::class, 'deleteConversation']);
            Route::put('conversations/{id}/pin', [AiController::class, 'togglePin']);
            Route::put('conversations/{id}/save', [AiController::class, 'toggleSave']);
            Route::post('messages/{id}/react', [AiController::class, 'reactToMessage']);
            Route::post('chat', [AiController::class, 'chat']);
            Route::post('voice/talk', [AiController::class, 'voiceTalk']);
            Route::apiResource('automations', AiAutomationController::class);
        });
    });

    // ─── Client Portal Sprint 7 ───────────────────────────────────────────────
    // Public portal login (no auth required)
    Route::post('portal/login', [PortalController::class, 'login'])
        ->name('portal.login')
        ->middleware('throttle:login');

    // Authenticated portal endpoints (client role enforced inside controller)
    Route::middleware(['auth:sanctum', 'throttle:api'])
        ->prefix('portal')
        ->name('portal.')
        ->group(function () {
            Route::get('projects',                  [PortalController::class, 'projects'])->name('projects.index');
            Route::get('projects/{project}',        [PortalController::class, 'projectShow'])->name('projects.show');
            Route::get('projects/{project}/tasks',  [PortalController::class, 'projectTasks'])->name('projects.tasks');
            Route::get('invoices',                  [PortalController::class, 'invoices'])->name('invoices.index');
        });
});
