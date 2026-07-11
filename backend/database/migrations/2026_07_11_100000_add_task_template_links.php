<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Wires the (previously schema-only) task-template layer into projects and
 * tasks, per the PRD's Task Templates / Recurring Projects sections:
 * - projects.task_template_id — the template a recurring project generates
 *   its monthly tasks from (and the default template applied at kickoff).
 * - tasks.task_template_id — which template created a task; also the
 *   idempotence marker so a recurring run never double-creates a month.
 * Additive only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->foreignId('task_template_id')->nullable()->after('is_recurring')
                ->constrained('task_templates')->nullOnDelete();
        });
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('task_template_id')->nullable()->after('parent_task_id')
                ->constrained('task_templates')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropConstrainedForeignId('task_template_id');
        });
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('task_template_id');
        });
    }
};
