<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Packages previously stored only the final `price`; the discount model the
 * UI collects (percentage vs fixed, and its value) was discarded on save and
 * fabricated as "fixed" on every reload. Persist it for real. Additive only;
 * legacy rows keep NULL discount_type (the UI derives a fixed-amount display
 * for those).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('packages', function (Blueprint $table) {
            $table->string('discount_type', 20)->nullable()->after('price');
            $table->decimal('discount_value', 12, 2)->default(0)->after('discount_type');
        });
    }

    public function down(): void
    {
        Schema::table('packages', function (Blueprint $table) {
            $table->dropColumn(['discount_type', 'discount_value']);
        });
    }
};
