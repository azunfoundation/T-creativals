<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Users, Departments & Roles verification pass (Sprint 16) — reporting-line
 * (manager) sync on update, permission-driven password resets, and the
 * founder-role protection surviving the phantom super-admin removal.
 */
class Sprint16UsersRolesTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $hr;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();

        $this->hr = User::factory()->create(['email' => 'users-hr@creativals.com', 'status' => 'active']);
        $this->hr->assignRole('hr');
        $this->employee = User::factory()->create(['email' => 'users-employee@creativals.com', 'status' => 'active']);
        $this->employee->assignRole('employee');
    }

    /**
     * PRD: many-to-many reporting. store() could set managers since Sprint 12,
     * but update() silently ignored manager_ids — reporting lines could never
     * be changed after creation.
     */
    public function test_managers_can_be_synced_on_update(): void
    {
        $managerA = User::factory()->create(['email' => 'mgr-a@creativals.com', 'status' => 'active']);
        $managerB = User::factory()->create(['email' => 'mgr-b@creativals.com', 'status' => 'active']);

        $res = $this->actingAs($this->hr, 'sanctum')
            ->putJson("/api/v1/users/{$this->employee->id}", [
                'manager_ids' => [$managerA->id, $managerB->id, $this->employee->id], // self must be dropped
            ])
            ->assertStatus(200)
            ->json();

        $managers = collect($res['data']['managers']);
        $this->assertCount(2, $managers, 'self-reporting must be filtered out');
        $this->assertTrue($managers->pluck('id')->contains($managerA->id));
        $this->assertTrue($managers->pluck('id')->contains($managerB->id));

        // First listed manager is the primary reporting line
        $primary = $this->employee->fresh()->managers()->wherePivot('is_primary', true)->get();
        $this->assertCount(1, $primary);
        $this->assertSame($managerA->id, $primary->first()->id);

        // A plain employee cannot change reporting lines (privileged like roles)
        $this->actingAs($this->employee, 'sanctum')
            ->putJson("/api/v1/users/{$this->employee->id}", [
                'manager_ids' => [],
            ])
            ->assertStatus(403);
    }

    /**
     * resetPassword is now gated on users.edit (permission string) instead of
     * a hardcoded role-name list.
     */
    public function test_password_reset_requires_users_edit(): void
    {
        $payload = ['password' => 'newsecret123', 'password_confirmation' => 'newsecret123'];

        $this->actingAs($this->hr, 'sanctum')
            ->postJson("/api/v1/users/{$this->employee->id}/reset-password", $payload)
            ->assertStatus(200);

        $target = User::factory()->create(['email' => 'users-target@creativals.com', 'status' => 'active']);
        $target->assignRole('employee');
        $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/users/{$target->id}/reset-password", $payload)
            ->assertStatus(403);
    }

    /**
     * The founder role stays protected after removing the phantom
     * 'super-admin' from RoleController's guard lists.
     */
    public function test_founder_role_remains_protected(): void
    {
        $founderRoleId = \Spatie\Permission\Models\Role::findByName('founder')->id;

        $this->actingAs($this->founder, 'sanctum')
            ->putJson("/api/v1/roles/{$founderRoleId}", ['display_name' => 'Renamed'])
            ->assertStatus(403);
        $this->actingAs($this->founder, 'sanctum')
            ->deleteJson("/api/v1/roles/{$founderRoleId}")
            ->assertStatus(403);
    }
}
