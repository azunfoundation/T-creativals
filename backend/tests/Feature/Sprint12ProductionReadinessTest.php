<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class Sprint12ProductionReadinessTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $director;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();

        $this->director = User::factory()->create(['status' => 'active']);
        $this->director->assignRole('director');

        $this->employee = User::factory()->create(['status' => 'active']);
        $this->employee->assignRole('employee');
    }

    /** A plain employee must not be able to grant themselves any role via their own profile update. */
    public function test_employee_cannot_self_grant_roles_via_update(): void
    {
        $founderRoleId = Role::findByName('founder')->id;

        $response = $this->actingAs($this->employee, 'sanctum')
            ->putJson("/api/v1/users/{$this->employee->id}", [
                'role_ids' => [$founderRoleId],
            ]);

        $response->assertStatus(403);
        $this->assertTrue($this->employee->fresh()->hasRole('employee'));
        $this->assertFalse($this->employee->fresh()->hasRole('founder'));
    }

    /** Same lockout via the dedicated syncRoles endpoint. */
    public function test_employee_cannot_self_grant_roles_via_sync_roles(): void
    {
        $founderRoleId = Role::findByName('founder')->id;

        $response = $this->actingAs($this->employee, 'sanctum')
            ->putJson("/api/v1/users/{$this->employee->id}/roles", [
                'role_ids' => [$founderRoleId],
            ]);

        $response->assertStatus(403);
        $this->assertFalse($this->employee->fresh()->hasRole('founder'));
    }

    /** A director holds users.edit but must not be able to grant the founder role to anyone, including themself. */
    public function test_director_cannot_grant_founder_role(): void
    {
        $founderRoleId = Role::findByName('founder')->id;
        $target = User::factory()->create(['status' => 'active']);
        $target->assignRole('employee');

        $response = $this->actingAs($this->director, 'sanctum')
            ->putJson("/api/v1/users/{$target->id}/roles", [
                'role_ids' => [$founderRoleId],
            ]);

        $response->assertStatus(403);
        $this->assertFalse($target->fresh()->hasRole('founder'));
    }

    /** A director (holds users.edit) can still legitimately reassign a non-founder role. */
    public function test_director_can_assign_non_founder_role(): void
    {
        $target = User::factory()->create(['status' => 'active']);
        $target->assignRole('employee');
        $teamLeadRoleId = Role::findByName('team_lead')->id;

        $response = $this->actingAs($this->director, 'sanctum')
            ->putJson("/api/v1/users/{$target->id}/roles", [
                'role_ids' => [$teamLeadRoleId],
            ]);

        $response->assertStatus(200);
        $this->assertTrue($target->fresh()->hasRole('team_lead'));
    }

    /** Founder can still grant the founder role (the one actor allowed to create another founder). */
    public function test_founder_can_grant_founder_role(): void
    {
        $founderRoleId = Role::findByName('founder')->id;
        $target = User::factory()->create(['status' => 'active']);
        $target->assignRole('employee');

        $response = $this->actingAs($this->founder, 'sanctum')
            ->putJson("/api/v1/users/{$target->id}/roles", [
                'role_ids' => [$founderRoleId],
            ]);

        $response->assertStatus(200);
        $this->assertTrue($target->fresh()->hasRole('founder'));
    }

    /** A plain employee's own name/phone self-edit must still work (the self-bypass is only closed for roles/departments). */
    public function test_employee_can_still_edit_own_profile_fields(): void
    {
        $response = $this->actingAs($this->employee, 'sanctum')
            ->putJson("/api/v1/users/{$this->employee->id}", [
                'phone' => '+1-555-0100',
            ]);

        $response->assertStatus(200);
        $this->assertSame('+1-555-0100', $this->employee->fresh()->phone);
    }

    /** Task attachment file_path can't traverse outside the uploads tree. */
    public function test_task_attachment_rejects_path_traversal(): void
    {
        Storage::fake('public');
        $project = Project::create(['name' => 'P', 'client_id' => $this->founder->id, 'status' => 'planning', 'budget' => 1000]);
        $task = Task::create(['project_id' => $project->id, 'title' => 'T', 'status' => 'todo', 'priority' => 'medium', 'created_by' => $this->founder->id]);

        $response = $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/tasks/{$task->id}/attachments", [
                'filename' => 'evil.txt',
                'file_path' => '../../../../etc/passwd',
                'file_size' => 10,
            ]);

        $response->assertStatus(422);
    }

    /** Task attachment file_path must reference a file that was actually uploaded. */
    public function test_task_attachment_rejects_nonexistent_file(): void
    {
        Storage::fake('public');
        $project = Project::create(['name' => 'P', 'client_id' => $this->founder->id, 'status' => 'planning', 'budget' => 1000]);
        $task = Task::create(['project_id' => $project->id, 'title' => 'T', 'status' => 'todo', 'priority' => 'medium', 'created_by' => $this->founder->id]);

        $response = $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/tasks/{$task->id}/attachments", [
                'filename' => 'someone-elses-receipt.pdf',
                'file_path' => 'uploads/receipts/someone-elses-receipt.pdf',
                'file_size' => 10,
            ]);

        $response->assertStatus(422);
    }

    /** GET /permissions groups by module — the frontend must consume it as a keyed object, not an array. */
    public function test_permissions_endpoint_returns_module_grouped_object(): void
    {
        $response = $this->actingAs($this->founder, 'sanctum')->getJson('/api/v1/permissions');

        $response->assertStatus(200);
        $data = $response->json('data');
        $this->assertIsArray($data);
        // A grouped object decodes as an associative array in Laravel's json() helper —
        // assert it's keyed by module name (e.g. "users"), not a numerically-indexed list.
        $this->assertArrayHasKey('users', $data);
        $this->assertNotEmpty($data['users']);
        $this->assertArrayHasKey('name', $data['users'][0]);
        $this->assertArrayHasKey('id', $data['users'][0]);
    }

    /** The founder role's permission set can't be edited away via syncPermissions, even by founder. */
    public function test_founder_role_permissions_cannot_be_synced(): void
    {
        $founderRole = Role::findByName('founder');
        $onePermId = \Spatie\Permission\Models\Permission::first()->id;

        $response = $this->actingAs($this->founder, 'sanctum')
            ->putJson("/api/v1/roles/{$founderRole->id}/permissions", [
                'permission_ids' => [$onePermId],
            ]);

        $response->assertStatus(403);
    }

    /** A non-founder custom role's permissions can still be synced normally by founder. */
    public function test_custom_role_permissions_can_be_synced(): void
    {
        $customRole = Role::create(['name' => 'support_agent', 'guard_name' => 'web']);
        $perm = \Spatie\Permission\Models\Permission::where('name', 'clients.view')->first();

        $response = $this->actingAs($this->founder, 'sanctum')
            ->putJson("/api/v1/roles/{$customRole->id}/permissions", [
                'permission_ids' => [$perm->id],
            ]);

        $response->assertStatus(200);
        $this->assertTrue($customRole->fresh()->hasPermissionTo('clients.view'));
    }
}
