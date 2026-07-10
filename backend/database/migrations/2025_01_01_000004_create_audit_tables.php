<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('session_id')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->string('auditable_type', 100);
            $table->unsignedBigInteger('auditable_id');
            $table->enum('event', [
                'created', 'updated', 'deleted', 'restored',
                'login', 'logout', 'approved', 'rejected', 'exported'
            ]);
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at'); // No updated_at — immutable

            $table->index('user_id');
            $table->index(['auditable_type', 'auditable_id']);
            $table->index('event');
            $table->index('created_at');
        });

        Schema::create('deleted_records', function (Blueprint $table) {
            $table->id();
            $table->string('deletable_type', 100);
            $table->unsignedBigInteger('deletable_id');
            $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('restored_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('record_snapshot'); // Full model snapshot at time of deletion
            $table->timestamp('deleted_at');
            $table->timestamp('restored_at')->nullable();
            $table->text('restore_reason')->nullable();
            $table->timestamps();

            $table->index(['deletable_type', 'deletable_id']);
            $table->index('deleted_by');
            $table->index('restored_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deleted_records');
        Schema::dropIfExists('audit_logs');
    }
};
