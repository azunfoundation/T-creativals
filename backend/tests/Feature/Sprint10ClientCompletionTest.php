<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\ClientCommunication;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\User;
use App\Models\Currency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class Sprint10ClientCompletionTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $employee;
    private User $clientUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        
        $this->employee = User::factory()->create([
            'email' => 'employee_client_test@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => false
        ]);
        $this->employee->assignRole('employee');

        // Create a client user
        $this->clientUser = User::factory()->create([
            'email' => 'client_test_user@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => true,
            'password' => bcrypt('password123')
        ]);
        $this->clientUser->assignRole('client');
    }

    public function test_client_portal_login_toggles(): void
    {
        // 1. Success when is_client_portal_user is true
        $response = $this->postJson('/api/v1/portal/login', [
            'email' => 'client_test_user@creativals.com',
            'password' => 'password123'
        ])->assertStatus(200)
          ->assertJsonStructure(['token', 'user']);

        // 2. Denied when is_client_portal_user is toggled false
        $this->clientUser->update(['is_client_portal_user' => false]);

        $response = $this->postJson('/api/v1/portal/login', [
            'email' => 'client_test_user@creativals.com',
            'password' => 'password123'
        ])->assertStatus(403)
          ->assertJsonPath('message', 'Access denied. Portal access has been disabled for your account.');
    }

    public function test_health_score_calculation_in_summary(): void
    {
        $currency = Currency::where('is_default', true)->first() ?? Currency::first();

        // Create project for this client that is on_hold (deducts 15 points)
        $project = Project::create([
            'name' => 'Project Alpha',
            'client_id' => $this->clientUser->id,
            'status' => 'on_hold',
            'budget' => 5000,
        ]);

        // Create overdue invoice for this client (deducts 10 points + outstanding ratio)
        $invoice = Invoice::create([
            'client_id' => $this->clientUser->id,
            'created_by' => $this->founder->id,
            'title' => 'Overdue Invoice',
            'currency_id' => $currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'due_amount' => 1000.00, // 100% outstanding
            'status' => 'overdue',
            'issue_date' => now()->subDays(40)->toDateString(),
            'due_date' => now()->subDays(10)->toDateString(),
        ]);

        // Health score deduction = 100 - 15 (on_hold project) - 10 (overdue invoice) - 20 (100% outstanding ratio) = 55 points
        $response = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/clients')
            ->assertStatus(200);

        // Verify the client's health score in the list
        $breakdown = $response->json('breakdown');
        $this->assertNotEmpty($breakdown);

        $clientRecord = collect($breakdown)->firstWhere('client_id', $this->clientUser->id);
        $this->assertNotNull($clientRecord);
        $this->assertEquals(55, $clientRecord['health_score']);
        $this->assertEquals('active', $clientRecord['status']);
        $this->assertTrue($clientRecord['is_client_portal_user']);
    }

    public function test_client_communications_crud(): void
    {
        // 1. List initially empty
        $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/clients/{$this->clientUser->id}/communications")
            ->assertStatus(200)
            ->assertJsonCount(0, 'data');

        // 2. Create log entry
        $logData = [
            'type' => 'call',
            'subject' => 'Follow up on design proposal',
            'content' => 'Discussed logo iterations and timeline.',
            'communication_date' => now()->toDateTimeString(),
        ];

        $response = $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/clients/{$this->clientUser->id}/communications", $logData)
            ->assertStatus(201)
            ->assertJsonPath('data.subject', 'Follow up on design proposal');

        $logId = $response->json('data.id');

        // 3. List contains 1 entry
        $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/clients/{$this->clientUser->id}/communications")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');

        // 4. Delete entry
        $this->actingAs($this->employee, 'sanctum')
            ->deleteJson("/api/v1/clients/{$this->clientUser->id}/communications/{$logId}")
            ->assertStatus(200);

        // 5. Database missing communication
        $this->assertDatabaseMissing('client_communications', ['id' => $logId]);
    }
}
