<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pre-Sprint 5 schema corrections:
 *  1. Expand projects table with full Sprint 5 columns
 *  2. Add FK constraint on invoices.client_id
 *  3. Make quotes.valid_until nullable
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── 1. Expand projects table ───────────────────────────────────────────
        Schema::table('projects', function (Blueprint $table) {
            $table->string('project_number')->nullable()->unique()->after('id');
            $table->text('description')->nullable()->after('name');
            $table->date('start_date')->nullable()->after('invoice_id');
            $table->date('end_date')->nullable()->after('start_date');
            $table->decimal('budget_hours', 10, 2)->default(0)->after('end_date');
            $table->decimal('budget_amount', 12, 2)->default(0)->after('budget_hours');
            $table->foreignId('manager_id')
                ->nullable()
                ->after('budget_amount')
                ->constrained('users')
                ->nullOnDelete();
            $table->tinyInteger('completion_percentage')->unsigned()->default(0)->after('manager_id');
            $table->boolean('is_recurring')->default(false)->after('completion_percentage');
            $table->softDeletes()->after('updated_at');

            // Update status to proper enum
            $table->string('status')->default('planning')->change();

            $table->index('status');
            $table->index('manager_id');
            $table->index('client_id');
        });

        // ── 2. Add FK constraint on invoices.client_id ────────────────────────
        // SQLite in tests doesn't enforce FKs strictly — safe to add
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreign('client_id')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
        });

        // ── 3. Make quotes.valid_until nullable ───────────────────────────────
        Schema::table('quotes', function (Blueprint $table) {
            $table->date('valid_until')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['client_id']);
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropIndex(['manager_id']);
            $table->dropIndex(['client_id']);
            $table->dropForeign(['manager_id']);
            if (\Illuminate\Support\Facades\DB::getDriverName() === 'sqlite') {
                $table->dropUnique('projects_project_number_unique');
            }
            $table->dropColumn([
                'project_number', 'description', 'start_date', 'end_date',
                'budget_hours', 'budget_amount', 'manager_id',
                'completion_percentage', 'is_recurring', 'deleted_at',
            ]);
        });

        Schema::table('quotes', function (Blueprint $table) {
            $table->date('valid_until')->nullable(false)->change();
        });
    }
};
