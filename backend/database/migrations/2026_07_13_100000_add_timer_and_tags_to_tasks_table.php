<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->json('tags')->nullable()->after('completion_percentage');
            $table->timestamp('timer_started_at')->nullable()->after('tags');
            $table->unsignedInteger('timer_accumulated_seconds')->default(0)->after('timer_started_at');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['tags', 'timer_started_at', 'timer_accumulated_seconds']);
        });
    }
};
