<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    public function up(): void
    {
        // Reset cached roles and permissions
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // Ensure the permission exists
        $permission = Permission::firstOrCreate(['name' => 'projects.view', 'guard_name' => 'web']);

        // Assign to employee role
        $employee = Role::where('name', 'employee')->where('guard_name', 'web')->first();
        if ($employee) {
            $employee->givePermissionTo($permission);
        }

        // Assign to team_lead role
        $teamLead = Role::where('name', 'team_lead')->where('guard_name', 'web')->first();
        if ($teamLead) {
            $teamLead->givePermissionTo($permission);
        }
    }

    public function down(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $permission = Permission::where('name', 'projects.view')->where('guard_name', 'web')->first();
        if ($permission) {
            $employee = Role::where('name', 'employee')->where('guard_name', 'web')->first();
            if ($employee) {
                $employee->revokePermissionTo($permission);
            }

            $teamLead = Role::where('name', 'team_lead')->where('guard_name', 'web')->first();
            if ($teamLead) {
                $teamLead->revokePermissionTo($permission);
            }
        }
    }
};
