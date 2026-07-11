<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Automations gave the user no way to tell whether a rule ever actually
 * fired. Track the last execution time and a run counter so the UI can show
 * an honest activity signal per rule. Additive only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_automations', function (Blueprint $table) {
            $table->timestamp('last_triggered_at')->nullable()->after('is_active');
            $table->unsignedInteger('trigger_count')->default(0)->after('last_triggered_at');
        });
    }

    public function down(): void
    {
        Schema::table('ai_automations', function (Blueprint $table) {
            $table->dropColumn(['last_triggered_at', 'trigger_count']);
        });
    }
};
