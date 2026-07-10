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
        Schema::table('employee_compensations', function (Blueprint $table) {
            $table->decimal('tds_percent', 5, 2)->nullable();
            $table->decimal('pf_percent', 5, 2)->nullable();
            $table->decimal('esi_percent', 5, 2)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employee_compensations', function (Blueprint $table) {
            $table->dropColumn(['tds_percent', 'pf_percent', 'esi_percent']);
        });
    }
};
