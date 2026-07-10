<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Models\AiAutomation;
use App\Models\Lead;
use App\Models\Task;
use App\Models\Alert;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AiTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        
        $this->employee = User::factory()->create([
            'email' => 'employee_ai_test@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => false
        ]);
        $this->employee->assignRole('employee');
    }

    /**
     * Test conversation management APIs.
     */
    public function test_conversation_crud_and_status_toggles(): void
    {
        // 1. Create Conversation
        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/ai/conversations', [
                'title' => 'Project Strategy Consultation'
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('title', 'Project Strategy Consultation');

        $conversationId = $response->json('id');

        // 2. List Conversations
        $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/ai/conversations')
            ->assertStatus(200)
            ->assertJsonFragment(['title' => 'Project Strategy Consultation']);

        // 3. Toggle Pin
        $this->actingAs($this->founder, 'sanctum')
            ->putJson("/api/v1/ai/conversations/{$conversationId}/pin")
            ->assertStatus(200)
            ->assertJsonPath('is_pinned', true);

        // 4. Toggle Save
        $this->actingAs($this->founder, 'sanctum')
            ->putJson("/api/v1/ai/conversations/{$conversationId}/save")
            ->assertStatus(200)
            ->assertJsonPath('is_saved', true);

        // 5. Get Single Conversation
        $this->actingAs($this->founder, 'sanctum')
            ->getJson("/api/v1/ai/conversations/{$conversationId}")
            ->assertStatus(200)
            ->assertJsonPath('title', 'Project Strategy Consultation');

        // 6. Delete Conversation
        $this->actingAs($this->founder, 'sanctum')
            ->deleteJson("/api/v1/ai/conversations/{$conversationId}")
            ->assertStatus(200);

        // Verify deletion
        $this->actingAs($this->founder, 'sanctum')
            ->getJson("/api/v1/ai/conversations/{$conversationId}")
            ->assertStatus(404);
    }

    /**
     * Test chat assistant interaction (simulated keyless mode).
     */
    public function test_chat_interaction_simulator_fallback(): void
    {
        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/ai/chat', [
                'content' => 'Review our financial summary please'
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['conversation_id', 'message'])
            ->assertJsonFragment(['role' => 'assistant']);

        // Verify a mock summary structure is returned
        $this->assertStringContainsString('Financial Analysis', $response->json('message.content'));
    }

    /**
     * Test message reaction toggle endpoint.
     */
    public function test_message_reaction_toggling(): void
    {
        $conversation = AiConversation::create([
            'user_id' => $this->founder->id,
            'title' => 'Design Mockup Chat'
        ]);

        $message = AiMessage::create([
            'conversation_id' => $conversation->id,
            'role' => 'assistant',
            'content' => 'I can analyze the layout constraints.'
        ]);

        // Toggle on thumbs-up reaction
        $this->actingAs($this->founder, 'sanctum')
            ->postJson("/api/v1/ai/messages/{$message->id}/react", [
                'reaction' => 'thumbs-up'
            ])
            ->assertStatus(200)
            ->assertJsonPath('reactions', ['thumbs-up']);

        // Toggle off reaction
        $this->actingAs($this->founder, 'sanctum')
            ->postJson("/api/v1/ai/messages/{$message->id}/react", [
                'reaction' => 'thumbs-up'
            ])
            ->assertStatus(200)
            ->assertJsonPath('reactions', []);
    }

    /**
     * Test sensitive action confirmation interception.
     */
    public function test_sensitive_action_requires_explicit_confirmation(): void
    {
        // When sending a message to approve a payroll run (which is a sensitive action),
        // the system should return a confirmation request payload.
        config(['services.gemini.key' => 'fake-api-key']); // trigger real api request parsing

        // Force a mock response from Http client to simulate Gemini calling "approve_payroll_run" function.
        \Illuminate\Support\Facades\Http::fake([
            'generativelanguage.googleapis.com/*' => \Illuminate\Support\Facades\Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                [
                                    'functionCall' => [
                                        'name' => 'approve_payroll_run',
                                        'args' => ['id' => 42]
                                    ]
                                ]
                            ]
                        ]
                    ]
                ]
            ], 200)
        ]);

        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/ai/chat', [
                'content' => 'Approve payroll run 42'
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'conversation_id',
                'action_confirmation' => ['action', 'params', 'message']
            ])
            ->assertJsonPath('action_confirmation.action', 'approve_payroll_run');
    }

    /**
     * Test reactive Automation engine triggers and sub-actions.
     */
    public function test_reactive_ai_automations(): void
    {
        // Create a project first to satisfy the Task project_id foreign key constraint
        $client = User::factory()->create(['is_client_portal_user' => true]);
        $project = \App\Models\Project::create([
            'name' => 'Test Project',
            'client_id' => $client->id,
            'manager_id' => $this->founder->id,
            'status' => 'planning',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(1)->toDateString(),
            'budget_hours' => 100,
            'budget_amount' => 5000,
            'is_recurring' => false,
        ]);

        // Create an automation rule:
        // When lead becomes 'qualified' (stage_id = 4), create a follow-up Task.
        AiAutomation::create([
            'user_id' => $this->founder->id,
            'name' => 'Lead Qualification Task Auto-Generation',
            'trigger_event' => 'lead.updated',
            'conditions' => [
                ['field' => 'stage_id', 'operator' => '=', 'value' => 4]
            ],
            'actions' => [
                [
                    'type' => 'create_task',
                    'params' => [
                        'project_id' => $project->id,
                        'title' => 'Follow up on newly qualified lead: {company_name}',
                        'assigned_to' => $this->founder->id,
                        'priority' => 'high'
                    ]
                ]
            ],
            'is_active' => true
        ]);

        $source = \App\Models\LeadSource::first();
        // Create a lead in planning stage (stage_id = 1)
        $lead = Lead::create([
            'company_name' => 'Stark Tech Industries',
            'stage_id' => 1,
            'sales_exec_id' => $this->founder->id,
            'lead_source_id' => $source ? $source->id : null,
            'priority' => 'medium',
            'temperature' => 'warm',
        ]);

        // Update lead to qualified stage (stage_id = 4)
        $lead->update([
            'stage_id' => 4
        ]);

        // Verify task was automatically generated by observer
        $this->assertDatabaseHas('tasks', [
            'title' => 'Follow up on newly qualified lead: Stark Tech Industries',
            'priority' => 'high',
            'assigned_to' => $this->founder->id
        ]);
    }

    /**
     * Test chat assistant with attachments.
     */
    public function test_chat_with_attachment(): void
    {
        config(['services.gemini.key' => 'fake-api-key']);
        
        \Illuminate\Support\Facades\Http::fake([
            'generativelanguage.googleapis.com/*' => \Illuminate\Support\Facades\Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                [
                                    'text' => 'I have read the document.'
                                ]
                            ]
                        ]
                    ]
                ]
            ], 200)
        ]);

        // Create a dummy file in local storage
        $filename = 'test_document.txt';
        $filePath = 'uploads/attachments/test_document.txt';
        \Illuminate\Support\Facades\Storage::disk('public')->put($filePath, 'Hello Gemini, this is a test document content.');

        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/ai/chat', [
                'content' => 'Please read this document',
                'attachments' => [
                    [
                        'filename' => $filename,
                        'file_path' => $filePath,
                        'mime_type' => 'text/plain',
                        'file_size' => 100
                    ]
                ]
            ]);

        $response->assertStatus(200)
            ->assertJsonFragment(['role' => 'assistant', 'content' => 'I have read the document.']);
    }
}


