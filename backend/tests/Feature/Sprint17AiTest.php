<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AiAutomation;
use App\Models\AiConversation;
use App\Models\Alert;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * AI Assistant & Automations (Sprint 17) — conversation pagination, the
 * honest AI status endpoint, and automations actually recording that they
 * fired (plus the create_task project guard and cascade protection).
 */
class Sprint17AiTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->founder = User::where('email', 'founder@creativals.com')->first();
    }

    public function test_conversations_are_paginated(): void
    {
        foreach (range(1, 3) as $i) {
            AiConversation::create(['user_id' => $this->founder->id, 'title' => "Chat {$i}"]);
        }

        $res = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/ai/conversations?per_page=2')
            ->assertStatus(200)
            ->json();

        $this->assertArrayHasKey('data', $res);
        $this->assertArrayHasKey('current_page', $res);
        $this->assertCount(2, $res['data']);
        $this->assertGreaterThanOrEqual(2, $res['last_page']);
    }

    public function test_ai_status_is_honest_when_keyless(): void
    {
        $res = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/ai/status')
            ->assertStatus(200)
            ->json();

        // The testing environment nulls the API key — the status must say a
        // real model is NOT reachable.
        $this->assertFalse($res['configured']);
        $this->assertArrayHasKey('enabled', $res);
    }

    public function test_automation_records_that_it_fired(): void
    {
        $automation = AiAutomation::create([
            'user_id' => $this->founder->id,
            'name' => 'Alert on new task',
            'trigger_event' => 'task.created',
            'conditions' => [],
            'actions' => [['type' => 'send_alert', 'params' => ['title' => 'Task {title} created']]],
            'is_active' => true,
        ]);

        $project = Project::create([
            'project_number' => 'PRJ-AI-1',
            'name' => 'Automation fixture',
            'client_id' => $this->founder->id,
            'manager_id' => $this->founder->id,
            'status' => 'active',
        ]);
        Task::create([
            'project_id' => $project->id,
            'title' => 'Trigger me',
            'created_by' => $this->founder->id,
            'status' => 'todo',
        ]);

        $automation->refresh();
        $this->assertNotNull($automation->last_triggered_at, 'firing must stamp last_triggered_at');
        $this->assertSame(1, $automation->trigger_count);
        $this->assertDatabaseHas('alerts', ['title' => 'Task Trigger me created']);
        $this->assertDatabaseHas('ai_audit_logs', ['action_type' => 'automation_executed']);
    }

    public function test_create_task_action_requires_a_real_project_and_never_cascades(): void
    {
        // Rule with NO project_id — must skip instead of defaulting to id 1.
        AiAutomation::create([
            'user_id' => $this->founder->id,
            'name' => 'Bad task rule',
            'trigger_event' => 'lead.created',
            'conditions' => [],
            'actions' => [['type' => 'create_task', 'params' => ['title' => 'Ghost task']]],
            'is_active' => true,
        ]);
        // Rule that fires on task.created and creates another task — the
        // cascade guard must prevent an infinite loop.
        $project = Project::create([
            'project_number' => 'PRJ-AI-2',
            'name' => 'Cascade fixture',
            'client_id' => $this->founder->id,
            'manager_id' => $this->founder->id,
            'status' => 'active',
        ]);
        AiAutomation::create([
            'user_id' => $this->founder->id,
            'name' => 'Task on task',
            'trigger_event' => 'task.created',
            'conditions' => [],
            'actions' => [['type' => 'create_task', 'params' => ['project_id' => $project->id, 'title' => 'Chained task']]],
            'is_active' => true,
        ]);

        $lead = \App\Models\Lead::create([
            'company_name' => 'Automation Lead Co',
            'created_by' => $this->founder->id,
            'priority' => 'medium',
            'temperature' => 'warm',
        ]);
        $this->assertNotNull($lead);
        $this->assertDatabaseMissing('tasks', ['title' => 'Ghost task']);

        // Manually created task fires the rule ONCE; the task the rule
        // creates must not re-trigger it.
        Task::create([
            'project_id' => $project->id,
            'title' => 'Seed task',
            'created_by' => $this->founder->id,
            'status' => 'todo',
        ]);
        $this->assertSame(1, Task::where('title', 'Chained task')->count());
    }
}
