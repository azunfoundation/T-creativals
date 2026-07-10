<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('currencies', function (Blueprint $table) {
            $table->id();
            $table->char('code', 3)->unique();
            $table->string('name', 100);
            $table->string('symbol', 10);
            $table->decimal('exchange_rate_to_inr', 12, 4)->default(1.0000);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->timestamp('rate_updated_at')->nullable();
            $table->timestamps();

            $table->index('is_active');
        });

        Schema::create('company_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 100)->unique();
            $table->text('value')->nullable();
            $table->string('type', 30)->default('string'); // string, boolean, integer, json
            $table->string('group', 50)->default('general');
            $table->string('description')->nullable();
            $table->timestamps();

            $table->index('group');
        });

        Schema::create('number_sequences', function (Blueprint $table) {
            $table->id();
            $table->string('entity_type', 50)->unique(); // lead, quote, invoice, project, task, expense, payroll
            $table->string('prefix', 20);
            $table->unsignedInteger('current_number')->default(0);
            $table->tinyInteger('padding_length')->default(4);
            $table->string('format', 50)->default('{PREFIX}-{YEAR}-{NUMBER}');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('number_sequences');
        Schema::dropIfExists('company_settings');
        Schema::dropIfExists('currencies');
    }
};
