<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('notification_preferences')) {
            Schema::table('notification_preferences', function (Blueprint $table) {
                if (!Schema::hasColumn('notification_preferences', 'sound_enabled')) {
                    $table->boolean('sound_enabled')->default(true);
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('notification_preferences')) {
            Schema::table('notification_preferences', function (Blueprint $table) {
                if (Schema::hasColumn('notification_preferences', 'sound_enabled')) {
                    $table->dropColumn('sound_enabled');
                }
            });
        }
    }
};
