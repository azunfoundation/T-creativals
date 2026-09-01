<?php

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
        if (!Schema::hasColumn('services', 'badge')) {
            Schema::table('services', function (Blueprint $table) {
                $table->string('badge')->nullable()->after('unit');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('services', 'badge')) {
            Schema::table('services', function (Blueprint $table) {
                $table->dropColumn('badge');
            });
        }
    }
};
