<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->index('client_id');
            $table->index('quote_id');
            $table->index('recurring_rule_id');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->index('invoice_id');
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->index('invoice_id');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->index('milestone_id');
            $table->index('parent_task_id');
        });

        Schema::table('timesheets', function (Blueprint $table) {
            $table->index('task_id');
        });

        Schema::table('expenses', function (Blueprint $table) {
            $table->index('category_id');
            $table->index('vendor_id');
            $table->index('currency_id');
        });

        Schema::table('payroll_run_items', function (Blueprint $table) {
            $table->index('payroll_run_id');
            $table->index('user_id');
        });

        Schema::table('bonuses', function (Blueprint $table) {
            $table->index('user_id');
        });

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->index('user_id');
            $table->index('leave_type_id');
        });

        Schema::table('project_members', function (Blueprint $table) {
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('project_members', function (Blueprint $table) {
            $table->dropIndex(['user_id']);
        });

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropIndex(['leave_type_id']);
            $table->dropIndex(['user_id']);
        });

        Schema::table('bonuses', function (Blueprint $table) {
            $table->dropIndex(['user_id']);
        });

        Schema::table('payroll_run_items', function (Blueprint $table) {
            $table->dropIndex(['user_id']);
            $table->dropIndex(['payroll_run_id']);
        });

        Schema::table('expenses', function (Blueprint $table) {
            $table->dropIndex(['currency_id']);
            $table->dropIndex(['vendor_id']);
            $table->dropIndex(['category_id']);
        });

        Schema::table('timesheets', function (Blueprint $table) {
            $table->dropIndex(['task_id']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropIndex(['parent_task_id']);
            $table->dropIndex(['milestone_id']);
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['invoice_id']);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['invoice_id']);
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex(['recurring_rule_id']);
            $table->dropIndex(['quote_id']);
            $table->dropIndex(['client_id']);
        });
    }
};
