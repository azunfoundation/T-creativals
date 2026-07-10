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
        // 1. recurring_billing_rules
        Schema::create('recurring_billing_rules', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedBigInteger('client_id')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->enum('frequency', ['daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly']);
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->timestamp('last_generated_at')->nullable();
            $table->date('next_generation_date')->nullable();
            $table->foreignId('currency_id')->constrained('currencies');
            $table->string('base_currency')->default('INR');
            $table->decimal('exchange_rate', 12, 4)->default(1.0000);
            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('tax_amount', 12, 2)->default(0.00);
            $table->decimal('total_amount', 12, 2)->default(0.00);
            $table->foreignId('coupon_id')->nullable()->constrained('discount_coupons')->nullOnDelete();
            $table->decimal('coupon_discount', 12, 2)->default(0.00);
            $table->text('terms_conditions')->nullable();
            $table->text('client_notes')->nullable();
            $table->text('internal_notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('next_generation_date');
        });

        // 2. recurring_billing_rule_items
        Schema::create('recurring_billing_rule_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('recurring_billing_rule_id')
                ->constrained('recurring_billing_rules')
                ->cascadeOnDelete();
            $table->foreignId('service_id')
                ->nullable()
                ->constrained('services')
                ->nullOnDelete();
            $table->text('description');
            $table->decimal('quantity', 12, 2)->default(1.00);
            $table->string('unit')->nullable();
            $table->decimal('unit_price', 12, 2);
            $table->string('tax_type')->default('none');
            $table->decimal('discount_percent', 5, 2)->default(0.00);
            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('tax_rate', 5, 2)->default(0.00);
            $table->decimal('tax_amount', 12, 2)->default(0.00);
            $table->decimal('total_amount', 12, 2);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // 3. invoices
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_number')->unique();
            $table->foreignId('quote_id')->nullable()->constrained('quotes')->nullOnDelete();
            $table->unsignedBigInteger('client_id')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('recurring_rule_id')->nullable()->constrained('recurring_billing_rules')->nullOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->foreignId('currency_id')->constrained('currencies');
            $table->string('base_currency')->default('INR');
            $table->decimal('exchange_rate', 12, 4)->default(1.0000);
            $table->decimal('subtotal', 12, 2);
            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('tax_amount', 12, 2)->default(0.00);
            $table->decimal('total_amount', 12, 2);
            $table->foreignId('coupon_id')->nullable()->constrained('discount_coupons')->nullOnDelete();
            $table->decimal('coupon_discount', 12, 2)->default(0.00);
            $table->decimal('paid_amount', 12, 2)->default(0.00);
            $table->decimal('due_amount', 12, 2)->default(0.00);
            $table->enum('status', ['draft', 'pending_review', 'pending_approval', 'approved', 'sent', 'paid', 'partially_paid', 'overdue', 'void', 'cancelled'])->default('draft');
            $table->date('issue_date');
            $table->date('due_date');
            $table->text('terms_conditions')->nullable();
            $table->text('client_notes')->nullable();
            $table->text('internal_notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('issue_date');
            $table->index('due_date');
        });

        // 4. invoice_items
        Schema::create('invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->foreignId('service_id')->nullable()->constrained('services')->nullOnDelete();
            $table->text('description');
            $table->decimal('quantity', 12, 2)->default(1.00);
            $table->string('unit')->nullable();
            $table->decimal('unit_price', 12, 2);
            $table->string('tax_type')->default('none');
            $table->decimal('discount_percent', 5, 2)->default(0.00);
            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('tax_rate', 5, 2)->default(0.00);
            $table->decimal('tax_amount', 12, 2)->default(0.00);
            $table->decimal('total_amount', 12, 2);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // 5. payments
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_number')->unique();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->date('payment_date');
            $table->string('payment_method');
            $table->string('transaction_reference')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('recorded_by')->constrained('users');
            $table->timestamps();
            $table->softDeletes();

            $table->index('payment_date');
        });

        // 6. invoice_approvals
        Schema::create('invoice_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->enum('action', ['submitted', 'reviewed', 'approved', 'rejected']);
            $table->foreignId('actor_id')->constrained('users');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // 7. projects
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->foreignId('client_id')->constrained('users');
            $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->string('status')->default('active');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('projects');
        Schema::dropIfExists('invoice_approvals');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('invoice_items');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('recurring_billing_rule_items');
        Schema::dropIfExists('recurring_billing_rules');
    }
};
