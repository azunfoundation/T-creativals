<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add unique constraints
        Schema::table('project_members', function (Blueprint $table) {
            $table->unique(['project_id', 'user_id'], 'pm_project_user_unique');
        });

        Schema::table('project_departments', function (Blueprint $table) {
            $table->unique(['project_id', 'department_id'], 'pd_project_dept_unique');
        });

        Schema::table('package_services', function (Blueprint $table) {
            $table->unique(['package_id', 'service_id'], 'ps_package_service_unique');
        });

        // Add indices
        Schema::table('leads', function (Blueprint $table) {
            $table->index('created_at', 'leads_created_at_index');
            $table->index('converted_at', 'leads_converted_at_index');
        });

        Schema::table('timesheets', function (Blueprint $table) {
            $table->index(['date', 'user_id'], 'timesheets_date_user_index');
        });

        Schema::table('expenses', function (Blueprint $table) {
            $table->index('project_id', 'expenses_project_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropIndex('expenses_project_id_index');
        });

        Schema::table('timesheets', function (Blueprint $table) {
            $table->dropIndex('timesheets_date_user_index');
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex('leads_converted_at_index');
            $table->dropIndex('leads_created_at_index');
        });

        Schema::table('package_services', function (Blueprint $table) {
            $table->dropUnique('ps_package_service_unique');
        });

        Schema::table('project_departments', function (Blueprint $table) {
            $table->dropUnique('pd_project_dept_unique');
        });

        Schema::table('project_members', function (Blueprint $table) {
            $table->dropUnique('pm_project_user_unique');
        });
    }
};
