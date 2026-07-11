<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * PRD client spec: company name, multiple contacts, billing details, and a
 * preferred currency per client. Clients are Users (role `client`), so the
 * billing fields live on users (all nullable — staff rows simply leave them
 * empty) and contacts get their own table. Additive only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('company_name')->nullable()->after('name');
            $table->text('billing_address')->nullable()->after('phone');
            $table->string('tax_number', 50)->nullable()->after('billing_address');
            $table->foreignId('default_currency_id')->nullable()->after('tax_number')
                ->constrained('currencies')->nullOnDelete();
        });

        Schema::create('client_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('designation')->nullable();
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            $table->index('client_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_contacts');
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('default_currency_id');
            $table->dropColumn(['company_name', 'billing_address', 'tax_number']);
        });
    }
};
