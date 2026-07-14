<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Alert;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadFollowup;
use App\Models\LeadSource;
use App\Models\LeadStage;
use App\Models\Quote;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class Sprint2CrmTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $salesHead;
    private User $salesExec;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        // Run migrations and seed roles/permissions, departments, number sequences, etc.
        $this->seed();

        // Retrieve seeded users
        $this->founder = User::where('email', 'founder@creativals.com')->first();
        $this->salesHead = User::where('email', 'sales@creativals.com')->first();
        $this->salesExec = User::factory()->create([
            'email' => 'exec@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => false,
        ]);
        $this->salesExec->givePermissionTo('leads.view');

        $this->employee = User::where('email', 'dev@creativals.com')->first();
    }

    /**
     * Test Lead Stage CRUD.
     */
    public function test_lead_stages_crud(): void
    {
        // 1. Index (All logged in users can view)
        $this->actingAs($this->salesExec, 'sanctum');
        $response = $this->getJson('/api/v1/lead-stages');
        $response->assertStatus(200)
            ->assertJsonStructure(['data' => [['id', 'name', 'slug', 'color', 'is_system']]]);

        // 2. Store (Unauthorized for sales exec)
        $response = $this->postJson('/api/v1/lead-stages', [
            'name' => 'Custom Stage',
            'color' => '#FFFFFF',
        ]);
        $response->assertStatus(403);

        // Store (Authorized for founder)
        $this->actingAs($this->founder, 'sanctum');
        $response = $this->postJson('/api/v1/lead-stages', [
            'name' => 'Custom Stage',
            'color' => '#FFFFFF',
        ]);
        $response->assertStatus(201)
            ->assertJsonFragment(['name' => 'Custom Stage', 'slug' => 'custom-stage']);

        $stageId = $response->json('data.id');

        // 3. Update (Authorized for founder)
        $response = $this->putJson("/api/v1/lead-stages/{$stageId}", [
            'name' => 'Updated Custom Stage',
        ]);
        $response->assertStatus(200)
            ->assertJsonFragment(['name' => 'Updated Custom Stage']);

        // 4. Destroy (Authorized for founder)
        $response = $this->deleteJson("/api/v1/lead-stages/{$stageId}");
        $response->assertStatus(200);

        $this->assertDatabaseMissing('lead_stages', ['id' => $stageId]);

        // Attempting to delete a system stage should fail
        $systemStage = LeadStage::where('is_system', true)->first();
        $response = $this->deleteJson("/api/v1/lead-stages/{$systemStage->id}");
        $response->assertStatus(422)
            ->assertJsonFragment(['message' => 'System stages cannot be deleted.']);
    }

    /**
     * Test Lead Source CRUD.
     */
    public function test_lead_sources_crud(): void
    {
        // 1. Index (All logged in users can view)
        $this->actingAs($this->salesExec, 'sanctum');
        $response = $this->getJson('/api/v1/lead-sources');
        $response->assertStatus(200)
            ->assertJsonStructure(['data' => [['id', 'name', 'slug', 'icon', 'color', 'is_active']]]);

        // 2. Store (Unauthorized for sales exec)
        $response = $this->postJson('/api/v1/lead-sources', [
            'name' => 'Custom Source',
            'color' => '#000000',
        ]);
        $response->assertStatus(403);

        // Store (Authorized for founder)
        $this->actingAs($this->founder, 'sanctum');
        $response = $this->postJson('/api/v1/lead-sources', [
            'name' => 'Custom Source',
            'color' => '#000000',
        ]);
        $response->assertStatus(201)
            ->assertJsonFragment(['name' => 'Custom Source', 'slug' => 'custom-source']);

        $sourceId = $response->json('data.id');

        // 3. Update (Authorized for founder)
        $response = $this->putJson("/api/v1/lead-sources/{$sourceId}", [
            'name' => 'Updated Custom Source',
        ]);
        $response->assertStatus(200)
            ->assertJsonFragment(['name' => 'Updated Custom Source']);

        // 4. Destroy (Authorized for founder)
        $response = $this->deleteJson("/api/v1/lead-sources/{$sourceId}");
        $response->assertStatus(200);

        $this->assertDatabaseMissing('lead_sources', ['id' => $sourceId]);
    }

    /**
     * Test Lead creation, nested contacts, services attachment, and number sequence generation.
     */
    public function test_lead_creation_and_attributes(): void
    {
        $this->actingAs($this->salesHead, 'sanctum');

        $stage = LeadStage::first();
        $source = LeadSource::first();
        $service = Service::first();

        $response = $this->postJson('/api/v1/leads', [
            'company_name' => 'Test Corp',
            'website_url' => 'https://testcorp.com',
            'whatsapp_number' => '+919999999999',
            'city' => 'Mumbai',
            'country' => 'India',
            'timezone' => 'Asia/Kolkata',
            'lead_source_id' => $source->id,
            'stage_id' => $stage->id,
            'sales_exec_id' => $this->salesExec->id,
            'sales_head_id' => $this->salesHead->id,
            'priority' => 'high',
            'temperature' => 'warm',
            'estimated_monthly_budget' => 4500.00,
            'expected_start_date' => now()->addDays(10)->toDateString(),
            'notes' => 'Some details about test corp.',
            'contacts' => [
                [
                    'name' => 'Alice Primary',
                    'designation' => 'Director',
                    'email' => 'alice@testcorp.com',
                    'phone' => '9999999991',
                ],
                [
                    'name' => 'Bob Secondary',
                    'designation' => 'Manager',
                    'email' => 'bob@testcorp.com',
                    'phone' => '9999999992',
                ]
            ],
            'interested_service_ids' => [$service->id],
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'data' => [
                    'id', 'lead_number', 'company_name', 'lead_stage', 'lead_source',
                    'sales_exec', 'sales_head', 'contacts', 'created_at'
                ]
            ])
            ->assertJsonFragment(['company_name' => 'Test Corp']);

        $leadId = $response->json('data.id');

        // Verify lead_number sequence was generated automatically (e.g. LEAD-YEAR-0004 since seed has 3)
        $leadNumber = $response->json('data.lead_number');
        $this->assertNotEmpty($leadNumber);
        $this->assertStringContainsString('LEAD-', $leadNumber);

        // Verify contacts created and primary is marked
        $this->assertDatabaseHas('lead_contacts', [
            'lead_id' => $leadId,
            'name' => 'Alice Primary',
            'is_primary' => true,
        ]);
        $this->assertDatabaseHas('lead_contacts', [
            'lead_id' => $leadId,
            'name' => 'Bob Secondary',
            'is_primary' => false,
        ]);

        // Verify service pivot created
        $this->assertDatabaseHas('lead_services', [
            'lead_id' => $leadId,
            'service_id' => $service->id,
        ]);

        // Verify that the LeadObserver automatically logged the assignment_change activity and triggered an alert
        $this->assertDatabaseHas('lead_activities', [
            'lead_id' => $leadId,
            'type' => 'assignment_change',
        ]);

        $this->assertDatabaseHas('alerts', [
            'user_id' => $this->salesExec->id,
            'type' => 'lead_assigned',
        ]);
    }

    /**
     * Test Lead Policy view boundaries.
     */
    public function test_lead_policy_view_boundaries(): void
    {
        $stage = LeadStage::first();
        $source = LeadSource::first();

        // Create a lead assigned to salesExec
        $lead1 = Lead::create([
            'company_name' => 'Assigned Lead',
            'lead_source_id' => $source->id,
            'stage_id' => $stage->id,
            'sales_exec_id' => $this->salesExec->id,
            'priority' => 'medium',
            'temperature' => 'warm',
        ]);

        // Create another lead not assigned to salesExec (assigned to founder)
        $lead2 = Lead::create([
            'company_name' => 'Unassigned Lead',
            'lead_source_id' => $source->id,
            'stage_id' => $stage->id,
            'sales_exec_id' => $this->founder->id,
            'priority' => 'medium',
            'temperature' => 'warm',
        ]);

        // 1. Employee cannot view any leads
        $this->actingAs($this->employee, 'sanctum');
        $this->getJson('/api/v1/leads')->assertStatus(403);
        $this->getJson("/api/v1/leads/{$lead1->id}")->assertStatus(403);

        // 2. Sales exec (with leads.view) can only view assigned leads, not unassigned leads
        $this->actingAs($this->salesExec, 'sanctum');
        
        // Index lists both, but we scope results to only own leads
        $indexResponse = $this->getJson('/api/v1/leads');
        $indexResponse->assertStatus(200);
        $leadIds = collect($indexResponse->json('data'))->pluck('id')->toArray();
        $this->assertContains($lead1->id, $leadIds);
        $this->assertNotContains($lead2->id, $leadIds);

        // Show endpoint
        $this->getJson("/api/v1/leads/{$lead1->id}")->assertStatus(200);
        $this->getJson("/api/v1/leads/{$lead2->id}")->assertStatus(403);

        // 3. Founder can view all
        $this->actingAs($this->founder, 'sanctum');
        $this->getJson("/api/v1/leads/{$lead2->id}")->assertStatus(200);
    }

    /**
     * Test Lead Stage transitions and Observer side-effects.
     */
    public function test_lead_stage_transitions(): void
    {
        $this->actingAs($this->founder, 'sanctum');

        $stage1 = LeadStage::where('slug', 'fresh-lead')->first();
        $stage2 = LeadStage::where('slug', 'hot-lead')->first();
        $source = LeadSource::first();

        $lead = Lead::create([
            'company_name' => 'Stage Test Corp',
            'lead_source_id' => $source->id,
            'stage_id' => $stage1->id,
            'sales_exec_id' => $this->salesExec->id,
            'sales_head_id' => $this->salesHead->id,
            'priority' => 'medium',
            'temperature' => 'warm',
        ]);

        // Change stage
        $response = $this->patchJson("/api/v1/leads/{$lead->id}/stage", [
            'stage_id' => $stage2->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.lead_stage.id', $stage2->id);

        // Verify stage change activity was created
        $this->assertDatabaseHas('lead_activities', [
            'lead_id' => $lead->id,
            'type' => 'stage_change',
        ]);

        // Verify alert was triggered for both sales exec and sales head
        $this->assertDatabaseHas('alerts', [
            'user_id' => $this->salesExec->id,
            'type' => 'lead_stage_changed',
        ]);

        $this->assertDatabaseHas('alerts', [
            'user_id' => $this->salesHead->id,
            'type' => 'lead_stage_changed',
        ]);
    }

    /**
     * Test converting lead to Quote.
     */
    public function test_convert_lead_to_quote(): void
    {
        $this->actingAs($this->founder, 'sanctum');

        $stage = LeadStage::first();
        $source = LeadSource::first();

        $lead = Lead::create([
            'company_name' => 'Convert Test Corp',
            'lead_source_id' => $source->id,
            'stage_id' => $stage->id,
            'sales_exec_id' => $this->salesExec->id,
            'priority' => 'medium',
            'temperature' => 'warm',
            'estimated_monthly_budget' => 6000.00,
        ]);

        $lead->contacts()->create([
            'name' => 'Convert Test Contact',
            'email' => 'convert-test-contact@example.com',
            'is_primary' => true,
        ]);

        $response = $this->postJson("/api/v1/leads/{$lead->id}/convert", [
            'quote_title' => 'Redesign Proposal v1',
            'valid_until' => now()->addDays(30)->toDateString(),
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['message', 'quote_id', 'quote_number']);

        $quoteId = $response->json('quote_id');

        // Check quote record created
        $this->assertDatabaseHas('quotes', [
            'id' => $quoteId,
            'title' => 'Redesign Proposal v1',
            'total_amount' => 6000.00,
            'lead_id' => $lead->id,
        ]);

        // Check lead status updated
        $this->assertDatabaseHas('leads', [
            'id' => $lead->id,
            'is_converted' => true,
        ]);

        // Check lead activity logged
        $this->assertDatabaseHas('lead_activities', [
            'lead_id' => $lead->id,
            'type' => 'lead_converted',
        ]);
    }

    /**
     * Test timeline activity logging and scheduling followups.
     */
    public function test_timeline_activity_and_followup(): void
    {
        $this->actingAs($this->founder, 'sanctum');

        $stage = LeadStage::first();
        $source = LeadSource::first();

        $lead = Lead::create([
            'company_name' => 'Activity Test Corp',
            'lead_source_id' => $source->id,
            'stage_id' => $stage->id,
            'sales_exec_id' => $this->salesExec->id,
            'priority' => 'medium',
            'temperature' => 'warm',
        ]);

        // Post activity without followup
        $response = $this->postJson("/api/v1/leads/{$lead->id}/activities", [
            'type' => 'note',
            'description' => 'Left a voicemail.',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('lead_activities', [
            'lead_id' => $lead->id,
            'type' => 'note',
            'description' => 'Left a voicemail.',
        ]);
        $this->assertDatabaseMissing('lead_followups', [
            'lead_id' => $lead->id,
        ]);

        // Post activity WITH followup
        $response = $this->postJson("/api/v1/leads/{$lead->id}/activities", [
            'type' => 'call',
            'description' => 'Scheduled followup call.',
            'due_at' => now()->addDays(3)->toDateTimeString(),
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('lead_activities', [
            'lead_id' => $lead->id,
            'type' => 'call',
            'description' => 'Scheduled followup call.',
        ]);
        $this->assertDatabaseHas('lead_followups', [
            'lead_id' => $lead->id,
            'type' => 'call',
        ]);
    }

    /**
     * Test Alerts read management.
     */
    public function test_alerts_read_management(): void
    {
        $this->actingAs($this->salesExec, 'sanctum');

        // Create 2 unread alerts for this user
        $alert1 = Alert::create([
            'user_id' => $this->salesExec->id,
            'type' => 'test',
            'title' => 'Title 1',
            'body' => 'Body 1',
            'is_read' => false,
        ]);

        $alert2 = Alert::create([
            'user_id' => $this->salesExec->id,
            'type' => 'test',
            'title' => 'Title 2',
            'body' => 'Body 2',
            'is_read' => false,
        ]);

        // Get unread alerts
        $response = $this->getJson('/api/v1/alerts?filter=unread');
        $response->assertStatus(200);
        $this->assertCount(2, $response->json('data'));

        // Mark one as read
        $response = $this->postJson("/api/v1/alerts/{$alert1->id}/read");
        $response->assertStatus(200);
        $this->assertTrue($alert1->fresh()->is_read);

        // Get unread alerts again (should be 1 now)
        $response = $this->getJson('/api/v1/alerts?filter=unread');
        $this->assertCount(1, $response->json('data'));

        // Mark all as read
        $response = $this->postJson('/api/v1/alerts/read-all');
        $response->assertStatus(200);
        $this->assertTrue($alert2->fresh()->is_read);

        // Get unread alerts again (should be 0 now)
        $response = $this->getJson('/api/v1/alerts?filter=unread');
        $this->assertCount(0, $response->json('data'));
    }
}
