<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

class RolesPermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Reset cached roles and permissions
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // ----------------------------------------------------------------
        // Define all permissions grouped by module
        // ----------------------------------------------------------------
        $permissions = [
            // Users
            'users.view',
            'users.create',
            'users.edit',
            'users.delete',

            // Roles
            'roles.view',
            'roles.manage',

            // Departments
            'departments.view',
            'departments.create',
            'departments.edit',
            'departments.delete',

            // Leads
            'leads.view',
            'leads.view_all',
            'leads.create',
            'leads.edit',
            'leads.delete',
            'leads.assign',
            'leads.convert',

            // Clients
            'clients.view',
            'clients.create',
            'clients.edit',
            'clients.delete',

            // Services
            'services.view',
            'services.manage',

            // Quotes
            'quotes.view',
            'quotes.view_all',
            'quotes.create',
            'quotes.edit',
            'quotes.delete',
            'quotes.approve',
            'quotes.send',

            // Invoices
            'invoices.view',
            'invoices.view_all',
            'invoices.create',
            'invoices.edit',
            'invoices.delete',
            'invoices.payment',

            // Projects
            'projects.view',
            'projects.view_all',
            'projects.create',
            'projects.edit',
            'projects.delete',
            'projects.profitability',

            // Tasks
            'tasks.view',
            'tasks.create',
            'tasks.edit',
            'tasks.delete',
            'tasks.approve',

            // Timesheets
            'timesheets.view',
            'timesheets.view_all',
            'timesheets.log',
            'timesheets.approve',

            // Attendance
            'attendance.view',
            'attendance.view_all',
            'attendance.manage',

            // Leave
            'leave.view',
            'leave.view_all',
            'leave.approve',

            // Holidays
            'holidays.manage',

            // Payroll
            'payroll.view',
            'payroll.manage',
            'payroll.approve',

            // Expenses
            'expenses.view',
            'expenses.view_all',
            'expenses.create',
            'expenses.approve',

            // Reports
            'reports.view',
            'reports.view_financial',
            'reports.view_hr',
            'reports.view_sales',
            'reports.export',

            // Audit
            'audit.view',

            // Recovery
            'recovery.restore',

            // Settings
            'settings.view',
            'settings.manage',
        ];

        // Create all permissions
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        // ----------------------------------------------------------------
        // Define all 11 roles
        // ----------------------------------------------------------------
        $roles = [
            'founder',
            'director',
            'sales_head',
            'sales_exec',
            'project_manager',
            'department_head',
            'team_lead',
            'employee',
            'finance',
            'hr',
            'client',
        ];

        foreach ($roles as $role) {
            Role::firstOrCreate(['name' => $role, 'guard_name' => 'web']);
        }

        // ----------------------------------------------------------------
        // Assign permissions to roles
        // ----------------------------------------------------------------

        // founder: ALL permissions
        Role::findByName('founder')->syncPermissions(Permission::all());

        // director: all EXCEPT recovery.restore, roles.manage, payroll.approve
        $directorExcluded = ['recovery.restore', 'roles.manage', 'payroll.approve'];
        $directorPermissions = Permission::whereNotIn('name', $directorExcluded)->pluck('name')->toArray();
        Role::findByName('director')->syncPermissions($directorPermissions);

        // sales_head: leads.*, clients.*, quotes.*, services.view, invoices.view, reports.view, reports.view_sales
        Role::findByName('sales_head')->syncPermissions([
            'leads.view',
            'leads.view_all',
            'leads.create',
            'leads.edit',
            'leads.delete',
            'leads.assign',
            'leads.convert',
            'clients.view',
            'clients.create',
            'clients.edit',
            'clients.delete',
            'quotes.view',
            'quotes.view_all',
            'quotes.create',
            'quotes.edit',
            'quotes.delete',
            'quotes.approve',
            'quotes.send',
            'services.view',
            'invoices.view',
            'reports.view',
            'reports.view_sales',
            'attendance.view',
            'leave.view',
        ]);

        // sales_exec: leads.view, leads.create, leads.edit, leads.view_all, clients.view,
        //             quotes.view, quotes.create, quotes.edit, services.view
        Role::findByName('sales_exec')->syncPermissions([
            'leads.view',
            'leads.create',
            'leads.edit',
            'leads.view_all',
            'clients.view',
            'quotes.view',
            'quotes.create',
            'quotes.edit',
            'services.view',
            'attendance.view',
            'leave.view',
        ]);

        // project_manager: projects.*, tasks.*, timesheets.view, timesheets.view_all,
        //                  timesheets.log, timesheets.approve, clients.view, reports.view
        Role::findByName('project_manager')->syncPermissions([
            'projects.view',
            'projects.view_all',
            'projects.create',
            'projects.edit',
            'projects.delete',
            'projects.profitability',
            'tasks.view',
            'tasks.create',
            'tasks.edit',
            'tasks.delete',
            'tasks.approve',
            'timesheets.view',
            'timesheets.view_all',
            'timesheets.log',
            'timesheets.approve',
            'clients.view',
            'reports.view',
            'attendance.view',
            'leave.view',
        ]);

        // department_head: projects.view, tasks.view, tasks.create, tasks.edit,
        //                  timesheets.view, reports.view
        Role::findByName('department_head')->syncPermissions([
            'projects.view',
            'tasks.view',
            'tasks.create',
            'tasks.edit',
            'timesheets.view',
            'reports.view',
            'attendance.view',
            'leave.view',
        ]);

        // team_lead: tasks.view, tasks.create, tasks.edit, timesheets.log, timesheets.view
        Role::findByName('team_lead')->syncPermissions([
            'projects.view',
            'tasks.view',
            'tasks.create',
            'tasks.edit',
            'timesheets.log',
            'timesheets.view',
            'attendance.view',
            'leave.view',
        ]);

        // employee: tasks.view, timesheets.log, timesheets.view
        Role::findByName('employee')->syncPermissions([
            'projects.view',
            'tasks.view',
            'timesheets.log',
            'timesheets.view',
            'attendance.view',
            'leave.view',
        ]);

        // finance: invoices.*, expenses.*, payroll.view, payroll.manage,
        //          reports.view, reports.export, reports.view_financial,
        //          clients.view (finance bills clients — they need the client
        //          directory to pick who an invoice is for)
        Role::findByName('finance')->syncPermissions([
            'clients.view',
            'invoices.view',
            'invoices.view_all',
            'invoices.create',
            'invoices.edit',
            'invoices.delete',
            'invoices.payment',
            'expenses.view',
            'expenses.view_all',
            'expenses.create',
            'expenses.approve',
            'payroll.view',
            'payroll.manage',
            'reports.view',
            'reports.export',
            'reports.view_financial',
            'attendance.view',
            'leave.view',
        ]);

        // hr: users.view, users.create, users.edit, reports.view, reports.view_hr,
        //     plus full attendance/leave/holiday oversight (the actual HR-facing role —
        //     note the controllers previously checked a phantom 'hr_manager' role name
        //     that was never seeded, silently locking every real 'hr' user out of
        //     Team Registry, leave approval, and holiday management).
        // Note: timesheets.view_all removed — HR does not need timesheet visibility (PM role handles that)
        Role::findByName('hr')->syncPermissions([
            'users.view',
            'users.create',
            'users.edit',
            'reports.view',
            'reports.view_hr',
            'attendance.view',
            'attendance.view_all',
            'attendance.manage',
            'leave.view',
            'leave.view_all',
            'leave.approve',
            'holidays.manage',
        ]);

        // client: limited read-only access to own data via Client Portal
        // Policies further restrict to client's own projects/tasks/invoices
        Role::findByName('client')->syncPermissions([
            'projects.view',
            'tasks.view',
            'invoices.view',
        ]);

        $this->command->info('✅ Roles and permissions seeded successfully.');
        $this->command->info('   Permissions created : ' . count($permissions));
        $this->command->info('   Roles created       : ' . count($roles));
    }
}
