<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\DeletedRecord;
use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class Sprint1ApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Seed roles, permissions, departments, currencies, and settings
        $this->seed();
    }

    public function test_user_can_login_with_valid_credentials(): void
    {
        $user = User::factory()->create([
            'email' => 'test@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'is_client_portal_user' => false,
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'test@creativals.com',
            'password' => 'password',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'user', 'message'])
            ->assertJsonFragment(['email' => 'test@creativals.com']);

        $this->assertDatabaseHas('login_activities', [
            'user_id' => $user->id,
            'status' => 'success',
        ]);
    }

    public function test_login_fails_with_invalid_credentials(): void
    {
        $user = User::factory()->create([
            'email' => 'test@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'is_client_portal_user' => false,
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'test@creativals.com',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->assertDatabaseHas('login_activities', [
            'user_id' => $user->id,
            'status' => 'failed',
        ]);
    }

    public function test_login_rate_limiting(): void
    {
        // Login route is rate limited at 5 attempts per minute.
        // Let's call it 6 times.
        $user = User::factory()->create([
            'email' => 'rate@creativals.com',
            'password' => Hash::make('password'),
            'status' => 'active',
            'is_client_portal_user' => false,
        ]);

        for ($i = 0; $i < 5; $i++) {
            $response = $this->postJson('/api/v1/auth/login', [
                'email' => 'rate@creativals.com',
                'password' => 'wrong-password',
            ]);
            $response->assertStatus(422);
        }

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'rate@creativals.com',
            'password' => 'password',
        ]);

        $response->assertStatus(429); // Too Many Requests
    }

    public function test_authenticated_user_profile(): void
    {
        $user = User::where('email', 'founder@creativals.com')->first();
        $token = $user->createToken('test-device')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/auth/me');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'id', 'name', 'email', 'roles', 'permissions', 'departments',
                ]
            ])
            ->assertJsonFragment(['email' => 'founder@creativals.com']);
    }

    public function test_founder_can_create_user_and_department(): void
    {
        $founder = User::where('email', 'founder@creativals.com')->first();
        $this->actingAs($founder, 'sanctum');

        // Test creating a department
        $deptResponse = $this->postJson('/api/v1/departments', [
            'name' => 'Design Lab',
            'slug' => 'design-lab',
            'description' => 'Creative designers',
            'color' => '#E0F2FE',
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $deptResponse->assertStatus(201);
        $deptId = $deptResponse->json('data.id');

        $this->assertDatabaseHas('departments', [
            'name' => 'Design Lab',
        ]);

        // Test audit log generated
        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => Department::class,
            'auditable_id' => $deptId,
            'event' => 'created',
        ]);

        // Test creating a user
        $userResponse = $this->postJson('/api/v1/users', [
            'name' => 'Alice Cooper',
            'email' => 'alice@creativals.com',
            'password' => 'password123',
            'phone' => '1234567890',
            'employee_id' => 'EMP-009',
            'status' => 'active',
            'role_ids' => [Role::where('name', 'employee')->first()->id],
            'department_ids' => [$deptId],
        ]);

        $userResponse->assertStatus(201);
        $userId = $userResponse->json('data.id');

        $this->assertDatabaseHas('users', [
            'email' => 'alice@creativals.com',
            'employee_id' => 'EMP-009',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => User::class,
            'auditable_id' => $userId,
            'event' => 'created',
        ]);
    }

    public function test_non_founder_cannot_create_department(): void
    {
        $employee = User::where('email', 'dev@creativals.com')->first();
        $this->actingAs($employee, 'sanctum');

        $response = $this->postJson('/api/v1/departments', [
            'name' => 'Design Lab',
            'slug' => 'design-lab',
            'description' => 'Creative designers',
            'color' => '#E0F2FE',
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $response->assertStatus(403);
    }

    public function test_department_soft_delete_and_recovery_bin(): void
    {
        $founder = User::where('email', 'founder@creativals.com')->first();
        $this->actingAs($founder, 'sanctum');

        // Create department
        $dept = Department::create([
            'name' => 'Content Lab',
            'slug' => 'content-lab',
            'description' => 'Content writers',
            'color' => '#E0F2FE',
            'is_active' => true,
            'sort_order' => 2,
        ]);

        // Delete department
        $response = $this->deleteJson('/api/v1/departments/' . $dept->id);
        $response->assertStatus(200);

        $this->assertSoftDeleted('departments', [
            'id' => $dept->id,
        ]);

        // Verify DeletedRecord created
        $deletedRecord = DeletedRecord::where('deletable_type', Department::class)
            ->where('deletable_id', $dept->id)
            ->first();

        $this->assertNotNull($deletedRecord);

        // Verify recovery bin view
        $binResponse = $this->getJson('/api/v1/recovery-bin');
        $binResponse->assertStatus(200)
            ->assertJsonFragment(['deletable_id' => $dept->id]);

        // Restore department
        $restoreResponse = $this->postJson("/api/v1/recovery-bin/{$deletedRecord->id}/restore", [
            'reason' => 'Accidental deletion',
        ]);
        $restoreResponse->assertStatus(200);

        $this->assertDatabaseHas('departments', [
            'id' => $dept->id,
            'deleted_at' => null,
        ]);

        // DeletedRecord should be removed after restore
        $this->assertDatabaseMissing('deleted_records', [
            'id' => $deletedRecord->id,
        ]);
    }
}
