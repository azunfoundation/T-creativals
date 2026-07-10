<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\Milestone;
use App\Models\Task;
use App\Models\Timesheet;
use App\Models\User;
use App\Models\Department;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

class Sprint5ProjectTaskTimesheetTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $pm;
    private User $employee;
    private User $client;
    private Department $department;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed();

        // Ensure permissions exist
        $permissions = [
            'projects.view', 'projects.view_all', 'projects.create', 'projects.edit', 'projects.delete', 'projects.profitability',
            'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.delete',
            'timesheets.view', 'timesheets.view_all', 'timesheets.log', 'timesheets.approve'
        ];

        foreach ($permissions as $p) {
            Permission::findOrCreate($p, 'web');
        }

        // Retrieve seeded founder
        $this->founder = User::where('email', 'founder@creativals.com')->first();
        if (!$this->founder) {
            $this->founder = User::factory()->create([
                'email' => 'founder@creativals.com',
                'status' => 'active',
            ]);
            $this->founder->assignRole('founder');
        }

        // Create PM user
        $this->pm = User::factory()->create([
            'email' => 'pm_test@creativals.com',
            'status' => 'active',
        ]);
        $this->pm->givePermissionTo($permissions);

        // Create employee
        $this->employee = User::factory()->create([
            'email' => 'employee_test@creativals.com',
            'status' => 'active',
        ]);
        $this->employee->givePermissionTo([
            'projects.view',
            'tasks.view',
            'timesheets.log',
            'timesheets.view',
        ]);

        // Create client
        $this->client = User::factory()->create([
            'email' => 'client_test@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => true,
        ]);
        $this->client->assignRole('client');
        $this->client->givePermissionTo(['projects.view', 'tasks.view']);

        // Create department
        $this->department = Department::first() ?? Department::create([
            'name' => 'Engineering',
            'slug' => 'engineering',
            'description' => 'Engineering team',
        ]);
    }

    private function getProjectData(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Creativals OS Rebuild',
            'description' => 'Rebuilding agency software',
            'client_id' => $this->client->id,
            'manager_id' => $this->pm->id,
            'status' => 'planning',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonths(3)->toDateString(),
            'budget_hours' => 500,
            'budget_amount' => 25000,
            'is_recurring' => false,
        ], $overrides);
    }

    // 1. Project CRUD: index authorized (founder/PM)
    public function test_project_index_pm_sees_all(): void
    {
        Project::create($this->getProjectData(['name' => 'Project A']));
        Project::create($this->getProjectData(['name' => 'Project B']));

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->getJson('/api/v1/projects');
        $response->assertStatus(200)
            ->assertJsonCount(2, 'data');
    }

    // 2. Project CRUD: index employee filtered
    public function test_project_index_employee_only_sees_assigned(): void
    {
        $projectA = Project::create($this->getProjectData(['name' => 'Project A']));
        $projectB = Project::create($this->getProjectData(['name' => 'Project B']));

        // Assign employee to project A
        $projectA->members()->create([
            'user_id' => $this->employee->id,
            'role' => 'member',
            'joined_at' => now(),
        ]);

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->getJson('/api/v1/projects');
        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['name' => 'Project A'])
            ->assertJsonMissing(['name' => 'Project B']);
    }

    // 3. Project CRUD: index client own
    public function test_project_index_client_sees_own(): void
    {
        $projectA = Project::create($this->getProjectData(['name' => 'Project A', 'client_id' => $this->client->id]));
        $otherClient = User::factory()->create();
        $projectB = Project::create($this->getProjectData(['name' => 'Project B', 'client_id' => $otherClient->id]));

        $this->actingAs($this->client, 'sanctum');
        $response = $this->getJson('/api/v1/projects');
        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['name' => 'Project A'])
            ->assertJsonMissing(['name' => 'Project B']);
    }

    // 4. Project CRUD: show authorized
    public function test_project_show_authorized(): void
    {
        $project = Project::create($this->getProjectData());

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->getJson("/api/v1/projects/{$project->id}");
        $response->assertStatus(200)
            ->assertJsonFragment(['name' => 'Creativals OS Rebuild']);
    }

    // 5. Project CRUD: show unauthorized
    public function test_project_show_unauthorized(): void
    {
        $project = Project::create($this->getProjectData());

        $otherEmployee = User::factory()->create();
        $otherEmployee->givePermissionTo('projects.view');

        $this->actingAs($otherEmployee, 'sanctum');
        $response = $this->getJson("/api/v1/projects/{$project->id}");
        $response->assertStatus(403);
    }

    // 6. Project CRUD: store authorized (with members)
    public function test_project_store_authorized_with_members(): void
    {
        $this->actingAs($this->pm, 'sanctum');
        $data = $this->getProjectData([
            'members' => [
                [
                    'user_id' => $this->employee->id,
                    'role' => 'member',
                    'department_id' => $this->department->id,
                    'joined_at' => now()->toDateString(),
                ]
            ]
        ]);

        $response = $this->postJson('/api/v1/projects', $data);
        $response->assertStatus(201);
        $this->assertDatabaseHas('projects', ['name' => 'Creativals OS Rebuild']);
        $this->assertDatabaseHas('project_members', [
            'user_id' => $this->employee->id,
            'role' => 'member',
        ]);
    }

    // 7. Project CRUD: store unauthorized
    public function test_project_store_unauthorized(): void
    {
        $this->actingAs($this->employee, 'sanctum');
        $data = $this->getProjectData();

        $response = $this->postJson('/api/v1/projects', $data);
        $response->assertStatus(403);
    }

    // 8. Project CRUD: update authorized
    public function test_project_update_authorized(): void
    {
        $project = Project::create($this->getProjectData());

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->putJson("/api/v1/projects/{$project->id}", [
            'name' => 'Updated Project Name'
        ]);
        $response->assertStatus(200);
        $this->assertEquals('Updated Project Name', $project->fresh()->name);
    }

    // 9. Project CRUD: update unauthorized
    public function test_project_update_unauthorized(): void
    {
        $project = Project::create($this->getProjectData());

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->putJson("/api/v1/projects/{$project->id}", [
            'name' => 'Updated Project Name'
        ]);
        $response->assertStatus(403);
    }

    // 10. Project CRUD: destroy authorized
    public function test_project_destroy_authorized(): void
    {
        $project = Project::create($this->getProjectData());

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->deleteJson("/api/v1/projects/{$project->id}");
        $response->assertStatus(200);
        $this->assertSoftDeleted('projects', ['id' => $project->id]);
    }

    // 11. Project CRUD: destroy unauthorized
    public function test_project_destroy_unauthorized(): void
    {
        $project = Project::create($this->getProjectData());

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->deleteJson("/api/v1/projects/{$project->id}");
        $response->assertStatus(403);
    }

    // 12. Project Member Add
    public function test_project_add_member(): void
    {
        $project = Project::create($this->getProjectData());

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->postJson("/api/v1/projects/{$project->id}/members", [
            'user_id' => $this->employee->id,
            'role' => 'lead',
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('project_members', [
            'project_id' => $project->id,
            'user_id' => $this->employee->id,
            'role' => 'lead',
        ]);
    }

    // 13. Project Member Remove
    public function test_project_remove_member(): void
    {
        $project = Project::create($this->getProjectData());
        $project->members()->create([
            'user_id' => $this->employee->id,
            'role' => 'member',
        ]);

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->deleteJson("/api/v1/projects/{$project->id}/members/{$this->employee->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('project_members', [
            'project_id' => $project->id,
            'user_id' => $this->employee->id,
        ]);
    }

    // 14. Project Profitability
    public function test_project_profitability(): void
    {
        $project = Project::create($this->getProjectData(['budget_amount' => 50000]));

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->getJson("/api/v1/projects/{$project->id}/profitability");

        $response->assertStatus(200)
            ->assertJsonFragment([
                'project_id' => $project->id,
                'revenue' => 50000.0,
            ]);
    }

    // 15. Task CRUD: store authorized
    public function test_task_store_authorized(): void
    {
        $project = Project::create($this->getProjectData());

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->postJson('/api/v1/tasks', [
            'project_id' => $project->id,
            'title' => 'Design Database',
            'status' => 'todo',
            'priority' => 'high',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('tasks', ['title' => 'Design Database']);
    }

    // 16. Task CRUD: store unauthorized
    public function test_task_store_unauthorized(): void
    {
        $project = Project::create($this->getProjectData());

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->postJson('/api/v1/tasks', [
            'project_id' => $project->id,
            'title' => 'Design Database',
        ]);

        $response->assertStatus(403);
    }

    // 17. Task CRUD: update full authorized
    public function test_task_update_full_authorized(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Old Title',
            'created_by' => $this->pm->id,
        ]);

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->putJson("/api/v1/tasks/{$task->id}", [
            'title' => 'New Title',
        ]);

        $response->assertStatus(200);
        $this->assertEquals('New Title', $task->fresh()->title);
    }

    // 18. Task CRUD: update restricted (assignee only status/completion)
    public function test_task_update_restricted_assignee(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Old Title',
            'assigned_to' => $this->employee->id,
            'created_by' => $this->pm->id,
        ]);

        $this->actingAs($this->employee, 'sanctum');
        
        $response = $this->putJson("/api/v1/tasks/{$task->id}", [
            'title' => 'Hacked Title',
            'status' => 'in_progress',
            'completion_percentage' => 50,
        ]);

        $response->assertStatus(200);
        $task->refresh();
        $this->assertEquals('Old Title', $task->title);
        $this->assertEquals('in_progress', $task->status);
        $this->assertEquals(50, $task->completion_percentage);
    }

    // 19. Task status patch
    public function test_task_status_patch(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Old Title',
            'assigned_to' => $this->employee->id,
            'created_by' => $this->pm->id,
        ]);

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->patchJson("/api/v1/tasks/{$task->id}/status", [
            'status' => 'review',
        ]);

        $response->assertStatus(200);
        $this->assertEquals('review', $task->fresh()->status);
    }

    // 20. Task completion patch
    public function test_task_completion_patch(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Old Title',
            'assigned_to' => $this->employee->id,
            'created_by' => $this->pm->id,
        ]);

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->patchJson("/api/v1/tasks/{$task->id}/completion", [
            'completion_percentage' => 80,
        ]);

        $response->assertStatus(200);
        $this->assertEquals(80, $task->fresh()->completion_percentage);
    }

    // 21. Task comments add & list
    public function test_task_comment_flow(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Task',
            'created_by' => $this->pm->id,
        ]);

        $this->actingAs($this->pm, 'sanctum');
        
        // Add comment
        $response = $this->postJson("/api/v1/tasks/{$task->id}/comments", [
            'comment' => 'This is a test comment',
            'is_internal' => false,
        ]);
        $response->assertStatus(201);

        // List comments
        $response = $this->getJson("/api/v1/tasks/{$task->id}/comments");
        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['comment' => 'This is a test comment']);
    }

    // 22. Timesheet log entry: authorized
    public function test_timesheet_log_authorized(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Task',
            'created_by' => $this->pm->id,
        ]);

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->postJson('/api/v1/timesheets', [
            'project_id' => $project->id,
            'task_id' => $task->id,
            'date' => now()->toDateString(),
            'hours_logged' => 4.5,
            'description' => 'Coding task',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('timesheets', [
            'hours_logged' => 4.5,
            'description' => 'Coding task',
        ]);
    }

    // 23. Timesheet submit + approve workflow
    public function test_timesheet_submit_and_approve(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Task',
            'created_by' => $this->pm->id,
        ]);

        $timesheet = Timesheet::create([
            'user_id' => $this->employee->id,
            'project_id' => $project->id,
            'task_id' => $task->id,
            'date' => now()->toDateString(),
            'hours_logged' => 2.0,
            'status' => 'draft',
        ]);

        // Submit
        $this->actingAs($this->employee, 'sanctum');
        $response = $this->postJson("/api/v1/timesheets/{$timesheet->id}/submit");
        $response->assertStatus(200);
        $this->assertEquals('submitted', $timesheet->fresh()->status);

        // Approve (as PM)
        $this->actingAs($this->pm, 'sanctum');
        $response = $this->postJson("/api/v1/timesheets/{$timesheet->id}/approve", [
            'notes' => 'Great work!',
        ]);
        $response->assertStatus(200);
        $this->assertEquals('approved', $timesheet->fresh()->status);
    }

    // 24. Timesheet reject workflow
    public function test_timesheet_reject_workflow(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Task',
            'created_by' => $this->pm->id,
        ]);

        $timesheet = Timesheet::create([
            'user_id' => $this->employee->id,
            'project_id' => $project->id,
            'task_id' => $task->id,
            'date' => now()->toDateString(),
            'hours_logged' => 2.0,
            'status' => 'submitted',
        ]);

        $this->actingAs($this->pm, 'sanctum');
        $response = $this->postJson("/api/v1/timesheets/{$timesheet->id}/reject", [
            'notes' => 'Please fill details properly',
        ]);
        $response->assertStatus(200);
        $this->assertEquals('rejected', $timesheet->fresh()->status);
    }

    // 25. TaskObserver: completion=100 sets status=done
    public function test_observer_task_completion_sets_done(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Task Observer Test',
            'created_by' => $this->pm->id,
            'status' => 'in_progress',
            'completion_percentage' => 50,
        ]);

        $task->update(['completion_percentage' => 100]);

        $this->assertEquals('done', $task->fresh()->status);
    }

    // 26. TimesheetObserver: actual_hours updated on task
    public function test_observer_timesheet_updates_actual_hours(): void
    {
        $project = Project::create($this->getProjectData());
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Task',
            'created_by' => $this->pm->id,
            'actual_hours' => 0,
        ]);

        $timesheet = Timesheet::create([
            'user_id' => $this->employee->id,
            'project_id' => $project->id,
            'task_id' => $task->id,
            'date' => now()->toDateString(),
            'hours_logged' => 3.5,
            'status' => 'submitted',
        ]);

        $this->assertEquals(3.5, (float) $task->fresh()->actual_hours);

        $timesheet->update(['status' => 'approved']);
        
        Timesheet::create([
            'user_id' => $this->employee->id,
            'project_id' => $project->id,
            'task_id' => $task->id,
            'date' => now()->subDay()->toDateString(),
            'hours_logged' => 2.0,
            'status' => 'draft',
        ]);

        $this->assertEquals(3.5, (float) $task->fresh()->actual_hours);
    }
}
