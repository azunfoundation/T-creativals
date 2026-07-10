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
        // First drop existing dependent tables to avoid foreign key issues
        Schema::dropIfExists('quotes');
        Schema::dropIfExists('lead_services');
        Schema::dropIfExists('services');

        // 1. service_categories
        Schema::create('service_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('color')->nullable();
            $table->smallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        // 2. services
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')
                ->nullable()
                ->constrained('service_categories')
                ->nullOnDelete();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->decimal('default_price', 12, 2);
            $table->foreignId('currency_id')
                ->constrained('currencies');
            $table->enum('billing_type', ['fixed', 'hourly', 'monthly', 'yearly']);
            $table->string('unit')->default('project');
            $table->boolean('is_active')->default(true);
            $table->boolean('is_taxable')->default(true);
            $table->decimal('tax_rate', 5, 2)->default(18.00);
            $table->timestamps();
            $table->softDeletes();
        });

        // Recreate lead_services table so the CRM functionality remains completely intact
        Schema::create('lead_services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')
                ->constrained('leads')
                ->cascadeOnDelete();
            $table->foreignId('service_id')
                ->constrained('services')
                ->cascadeOnDelete();
            $table->timestamps();
        });

        // 3. packages
        Schema::create('packages', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->decimal('price', 12, 2);
            $table->foreignId('currency_id')
                ->constrained('currencies');
            $table->enum('billing_cycle', ['one_time', 'monthly', 'quarterly', 'yearly']);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_featured')->default(false);
            $table->timestamps();
            $table->softDeletes();
        });

        // 4. package_services
        Schema::create('package_services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('package_id')
                ->constrained('packages')
                ->cascadeOnDelete();
            $table->foreignId('service_id')
                ->constrained('services')
                ->cascadeOnDelete();
            $table->decimal('custom_price', 12, 2)->nullable();
            $table->integer('quantity')->default(1);
            $table->text('description')->nullable();
            $table->timestamps();
        });

        // 5. discount_coupons
        Schema::create('discount_coupons', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->text('description')->nullable();
            $table->enum('type', ['percentage', 'fixed']);
            $table->decimal('value', 12, 2);
            $table->decimal('minimum_amount', 12, 2)->default(0);
            $table->decimal('maximum_discount', 12, 2)->nullable();
            $table->integer('usage_limit')->nullable();
            $table->integer('used_count')->default(0);
            $table->date('valid_from')->nullable();
            $table->date('valid_until')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        // 6. quotes
        Schema::create('quotes', function (Blueprint $table) {
            $table->id();
            $table->string('quote_number')->unique();
            $table->foreignId('lead_id')
                ->nullable()
                ->constrained('leads')
                ->nullOnDelete();
            $table->unsignedBigInteger('client_id')->nullable();
            $table->foreignId('created_by')
                ->constrained('users');
            $table->string('title');
            $table->text('description')->nullable();
            $table->foreignId('currency_id')
                ->constrained('currencies');
            $table->decimal('exchange_rate', 12, 4)->default(1.0000);
            $table->decimal('subtotal', 12, 2);
            $table->decimal('discount_amount', 12, 2)->default(0);
            $table->decimal('tax_amount', 12, 2)->default(0);
            $table->decimal('total_amount', 12, 2);
            $table->foreignId('coupon_id')
                ->nullable()
                ->constrained('discount_coupons')
                ->nullOnDelete();
            $table->decimal('coupon_discount', 12, 2)->default(0);
            $table->enum('status', ['draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'converted'])->default('draft');
            $table->date('valid_until')->nullable();
            $table->text('terms_conditions')->nullable();
            $table->text('internal_notes')->nullable();
            $table->text('client_notes')->nullable();
            $table->integer('revision_number')->default(1);
            $table->unsignedBigInteger('parent_quote_id')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // 7. quote_items
        Schema::create('quote_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quote_id')
                ->constrained('quotes')
                ->cascadeOnDelete();
            $table->foreignId('service_id')
                ->nullable()
                ->constrained('services')
                ->nullOnDelete();
            $table->text('description');
            $table->decimal('quantity', 12, 2)->default(1.00);
            $table->string('unit')->nullable();
            $table->decimal('unit_price', 12, 2);
            $table->decimal('discount_percent', 5, 2)->default(0.00);
            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('tax_rate', 5, 2)->default(0.00);
            $table->decimal('tax_amount', 12, 2)->default(0.00);
            $table->decimal('total_amount', 12, 2);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // 8. quote_approvals
        Schema::create('quote_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quote_id')
                ->constrained('quotes')
                ->cascadeOnDelete();
            $table->foreignId('requested_by')
                ->constrained('users');
            $table->foreignId('approver_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->integer('step_number')->default(1);
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->text('comments')->nullable();
            $table->timestamp('actioned_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('quote_approvals');
        Schema::dropIfExists('quote_items');
        Schema::dropIfExists('quotes');
        Schema::dropIfExists('discount_coupons');
        Schema::dropIfExists('package_services');
        Schema::dropIfExists('packages');
        Schema::dropIfExists('lead_services');
        Schema::dropIfExists('services');
        Schema::dropIfExists('service_categories');
    }
};
