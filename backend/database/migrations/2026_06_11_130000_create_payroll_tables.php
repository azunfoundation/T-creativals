<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('compensation_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('type', 30); // fixed, hourly, hybrid
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('employee_compensations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('compensation_type_id')->constrained('compensation_types');
            $table->decimal('base_amount', 12, 2);
            $table->foreignId('currency_id')->constrained('currencies');
            $table->decimal('expected_monthly_hours', 8, 2);
            $table->decimal('hourly_rate', 10, 2);
            $table->date('effective_from');
            $table->date('effective_until')->nullable();
            $table->boolean('is_current')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('payroll_runs', function (Blueprint $table) {
            $table->id();
            $table->string('run_number', 50)->unique();
            $table->integer('year');
            $table->integer('month');
            $table->string('status', 30)->default('draft'); // draft, submitted, approved, processed, paid
            $table->foreignId('submitted_by')->constrained('users');
            $table->foreignId('approved_by')->nullable()->constrained('users');
            $table->decimal('total_gross', 12, 2)->default(0.00);
            $table->decimal('total_deductions', 12, 2)->default(0.00);
            $table->decimal('total_net', 12, 2)->default(0.00);
            $table->foreignId('currency_id')->constrained('currencies');
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('bonuses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('payroll_run_id')->nullable()->constrained('payroll_runs')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users');
            $table->decimal('amount', 12, 2);
            $table->foreignId('currency_id')->constrained('currencies');
            $table->string('type', 30); // performance, festival, referral
            $table->text('reason')->nullable();
            $table->date('effective_date');
            $table->string('status', 30)->default('pending'); // pending, approved, rejected, paid
            $table->timestamps();
        });

        Schema::create('payroll_run_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_run_id')->constrained('payroll_runs')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->decimal('base_salary', 12, 2)->default(0.00);
            $table->decimal('bonus_amount', 12, 2)->default(0.00);
            $table->decimal('deductions', 12, 2)->default(0.00);
            $table->decimal('net_salary', 12, 2)->default(0.00);
            $table->decimal('hours_logged', 8, 2)->default(0.00);
            $table->decimal('expected_hours', 8, 2)->default(0.00);
            $table->decimal('utilization_rate', 5, 2)->default(0.00);
            $table->json('breakdown')->nullable();
            $table->timestamps();
        });

        Schema::create('payroll_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payroll_run_item_id')->constrained('payroll_run_items')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type', 30); // addition, deduction
            $table->string('description');
            $table->decimal('amount', 12, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_adjustments');
        Schema::dropIfExists('payroll_run_items');
        Schema::dropIfExists('bonuses');
        Schema::dropIfExists('payroll_runs');
        Schema::dropIfExists('employee_compensations');
        Schema::dropIfExists('compensation_types');
    }
};
