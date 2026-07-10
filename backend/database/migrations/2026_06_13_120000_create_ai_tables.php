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
        // 1. Conversations
        Schema::create('ai_conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->string('title');
            $table->boolean('is_pinned')->default(false);
            $table->boolean('is_saved')->default(false);
            $table->timestamps();

            $table->index('user_id');
            $table->index('is_pinned');
            $table->index('is_saved');
        });

        // 2. Messages
        Schema::create('ai_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')
                ->constrained('ai_conversations')
                ->cascadeOnDelete();
            $table->string('role'); // 'user' or 'assistant'
            $table->text('content');
            $table->json('reactions')->nullable(); // Thumbs up/down, emojis
            $table->timestamps();

            $table->index('conversation_id');
        });

        // 3. Attachments
        Schema::create('ai_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')
                ->constrained('ai_messages')
                ->cascadeOnDelete();
            $table->string('filename');
            $table->string('file_path');
            $table->string('mime_type');
            $table->integer('file_size');
            $table->timestamps();

            $table->index('message_id');
        });

        // 4. Memory (long-term, preferences, client/project context)
        Schema::create('ai_memories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->string('key');
            $table->json('value');
            $table->string('type'); // 'session', 'long-term', 'project', 'client'
            $table->timestamps();

            $table->unique(['user_id', 'key', 'type']);
            $table->index(['user_id', 'type']);
        });

        // 5. Automations (Triggers, Conditions, Actions)
        Schema::create('ai_automations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->string('name');
            $table->string('trigger_event'); // e.g., 'lead.qualified', 'invoice.overdue', etc.
            $table->json('conditions')->nullable();
            $table->json('actions');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('user_id');
            $table->index('trigger_event');
            $table->index('is_active');
        });

        // 6. AI Audit Logs (Sensitive actions tracking)
        Schema::create('ai_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->string('action_type'); // e.g. 'task_created', 'payroll_approved', 'lead_converted'
            $table->text('description');
            $table->json('payload')->nullable(); // action request payload
            $table->json('result')->nullable();  // action response
            $table->timestamp('created_at')->useCurrent();

            $table->index('user_id');
            $table->index('action_type');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ai_audit_logs');
        Schema::dropIfExists('ai_automations');
        Schema::dropIfExists('ai_memories');
        Schema::dropIfExists('ai_attachments');
        Schema::dropIfExists('ai_messages');
        Schema::dropIfExists('ai_conversations');
    }
};
