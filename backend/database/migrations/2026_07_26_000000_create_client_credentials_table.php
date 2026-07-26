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
        Schema::create('client_credentials', function (Blueprint $table) {
            $table->id();
            $table->boolean('is_favorite')->default(false);
            $table->boolean('is_archived')->default(false);
            $table->string('client_name');
            $table->foreignId('client_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('platform'); // e.g. "WordPress Admin", "cPanel Hosting"
            $table->string('credential_type'); // e.g. "Website", "Hosting", "API Key"
            $table->string('username');
            $table->text('password'); // Stored encrypted
            $table->string('login_url')->nullable();
            $table->text('notes')->nullable();
            $table->string('tags')->nullable(); // Comma-separated or JSON
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('is_favorite');
            $table->index('is_archived');
            $table->index('client_id');
            $table->index('platform');
            $table->index('credential_type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('client_credentials');
    }
};
