<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Lead;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SystemResetTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        // Seed database defaults
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        
        // Ensure founder password is set to 'password'
        $this->founder->update([
            'password' => Hash::make('password')
        ]);

        $this->employee = User::where('email', 'dev@creativals.com')->first();
        if (!$this->employee) {
            $this->employee = User::factory()->create(['email' => 'dev@creativals.com', 'status' => 'active']);
            $this->employee->assignRole('employee');
        }
    }

    /**
     * Test that non-founder roles cannot access reset endpoints.
     */
    public function test_non_founder_is_forbidden(): void
    {
        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/system/reset', [
                'password' => 'password',
                'confirmation' => 'RESET ENTIRE PLATFORM'
            ])
            ->assertStatus(403);

        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/system/reset/module', [
                'password' => 'password',
                'module' => 'crm'
            ])
            ->assertStatus(403);

        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/system/factory-reset', [
                'password' => 'password',
                'confirmation' => 'FACTORY RESET'
            ])
            ->assertStatus(403);
    }

    /**
     * Test password verification.
     */
    public function test_reset_requires_correct_password(): void
    {
        $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/system/reset', [
                'password' => 'wrongpassword',
                'confirmation' => 'RESET ENTIRE PLATFORM'
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    /**
     * Test confirmation text verification.
     */
    public function test_reset_requires_correct_confirmation_text(): void
    {
        $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/system/reset', [
                'password' => 'password',
                'confirmation' => 'INVALID TEXT'
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['confirmation']);
    }

    /**
     * Test platform reset operation.
     */
    public function test_complete_platform_reset(): void
    {
        // 1. Create client user
        $client = User::factory()->create(['email' => 'client@test.com', 'is_client_portal_user' => true]);
        $client->assignRole('client');

        // 2. Create some sample business data
        Lead::create([
            'company_name' => 'Acme Corp',
            'priority' => 'medium',
            'temperature' => 'warm'
        ]);

        $project = Project::create([
            'client_id' => $client->id,
            'name' => 'Test Project',
            'status' => 'planning',
            'start_date' => '2026-06-01',
            'end_date' => '2026-06-30'
        ]);

        Task::create([
            'project_id' => $project->id,
            'title' => 'Test Task',
            'status' => 'todo',
            'priority' => 'medium'
        ]);

        $this->assertDatabaseHas('leads', ['company_name' => 'Acme Corp']);
        $this->assertDatabaseHas('projects', ['name' => 'Test Project']);
        $this->assertDatabaseHas('tasks', ['title' => 'Test Task']);
        $this->assertDatabaseHas('users', ['email' => 'client@test.com']);

        // 3. Perform platform reset
        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/system/reset', [
                'password' => 'password',
                'confirmation' => 'RESET ENTIRE PLATFORM'
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'message',
                'data' => [
                    'backup_file',
                    'deleted_counts'
                ]
            ]);

        // 4. Verify data was removed
        $this->assertDatabaseMissing('leads', ['company_name' => 'Acme Corp']);
        $this->assertDatabaseMissing('projects', ['name' => 'Test Project']);
        $this->assertDatabaseMissing('tasks', ['title' => 'Test Task']);
        $this->assertDatabaseMissing('users', ['email' => 'client@test.com']);

        // Founder must be preserved
        $this->assertDatabaseHas('users', ['email' => 'founder@creativals.com']);

        // Audit log must be created
        $this->assertDatabaseHas('audit_logs', [
            'event' => 'deleted',
            'user_id' => $this->founder->id,
        ]);

        // Cleanup created backup file
        $backupFilename = $response->json('data.backup_file');
        $backupPath = storage_path('app/backups') . '/' . $backupFilename;
        if (File::exists($backupPath)) {
            File::delete($backupPath);
        }
    }

    /**
     * Test module reset operation.
     */
    public function test_module_reset(): void
    {
        Lead::create([
            'company_name' => 'Acme Corp',
            'priority' => 'medium',
            'temperature' => 'warm'
        ]);

        $client = User::factory()->create(['email' => 'client@test.com', 'is_client_portal_user' => true]);
        $client->assignRole('client');

        $project = Project::create([
            'client_id' => $client->id,
            'name' => 'Test Project',
            'status' => 'planning',
            'start_date' => '2026-06-01',
            'end_date' => '2026-06-30'
        ]);

        $this->assertDatabaseHas('leads', ['company_name' => 'Acme Corp']);
        $this->assertDatabaseHas('projects', ['name' => 'Test Project']);

        // Reset only CRM (leads)
        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/system/reset/module', [
                'password' => 'password',
                'module' => 'crm'
            ]);

        $response->assertStatus(200);

        // Leads must be gone, projects must remain
        $this->assertDatabaseMissing('leads', ['company_name' => 'Acme Corp']);
        $this->assertDatabaseHas('projects', ['name' => 'Test Project']);

        $backupFilename = $response->json('data.backup_file');
        $backupPath = storage_path('app/backups') . '/' . $backupFilename;
        if (File::exists($backupPath)) {
            File::delete($backupPath);
        }
    }

    /**
     * Test factory reset operation.
     */
    public function test_factory_reset(): void
    {
        // Add non-founder user
        $director = User::factory()->create(['email' => 'director@test.com']);
        $director->assignRole('director');

        Lead::create([
            'company_name' => 'Acme Corp',
            'priority' => 'medium',
            'temperature' => 'warm'
        ]);

        $this->assertDatabaseHas('users', ['email' => 'director@test.com']);
        $this->assertDatabaseHas('leads', ['company_name' => 'Acme Corp']);

        // Execute Factory Reset
        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/system/factory-reset', [
                'password' => 'password',
                'confirmation' => 'FACTORY RESET'
            ]);

        $response->assertStatus(200);

        // Director user and Leads must be deleted
        $this->assertDatabaseMissing('users', ['email' => 'director@test.com']);
        $this->assertDatabaseMissing('leads', ['company_name' => 'Acme Corp']);

        // Founder must be preserved and still has role 'founder'
        $this->assertDatabaseHas('users', ['email' => 'founder@creativals.com']);
        $this->assertTrue($this->founder->fresh()->hasRole('founder'));

        // Default stages must be re-seeded
        $this->assertDatabaseHas('lead_stages', ['slug' => 'fresh-lead']);

        $backupFilename = $response->json('data.backup_file');
        $backupPath = storage_path('app/backups') . '/' . $backupFilename;
        if (File::exists($backupPath)) {
            File::delete($backupPath);
        }
    }
}
