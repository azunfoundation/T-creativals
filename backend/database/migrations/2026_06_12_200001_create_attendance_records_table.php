<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('attendance_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->datetime('check_in_at')->nullable();
            $table->datetime('check_out_at')->nullable();
            $table->integer('break_minutes')->default(0);
            $table->enum('status', ['present', 'partial', 'absent', 'leave', 'holiday'])->default('present');
            $table->text('notes')->nullable();
            $table->string('location', 100)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['user_id', 'date']);
        });
    }
    public function down(): void { Schema::dropIfExists('attendance_records'); }
};
