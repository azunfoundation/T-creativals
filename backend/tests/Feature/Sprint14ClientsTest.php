<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\ClientContact;
use App\Models\Currency;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Clients module (Sprint 14) — the module's own API surface gated on
 * clients.* permission strings, the client detail payload, contact CRUD,
 * the delete in-use guard, and the ClientCommunication authorization fix.
 */
class Sprint14ClientsTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $salesHead;   // clients.view/create/edit/delete
    private User $salesExec;   // clients.view only
    private User $employee;    // no clients.* at all
    private User $clientUser;
    private Currency $inr;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        $this->inr = Currency::where('code', 'INR')->first();

        $this->salesHead = User::factory()->create(['email' => 'clients-saleshead@creativals.com', 'status' => 'active']);
        $this->salesHead->assignRole('sales_head');
        $this->salesExec = User::factory()->create(['email' => 'clients-salesexec@creativals.com', 'status' => 'active']);
        $this->salesExec->assignRole('sales_exec');
        $this->employee = User::factory()->create(['email' => 'clients-employee@creativals.com', 'status' => 'active']);
        $this->employee->assignRole('employee');

        $this->clientUser = User::factory()->create([
            'email' => 'clients-acme@creativals.com',
            'name' => 'Acme Contact',
            'company_name' => 'Acme Corp',
            'status' => 'active',
            'is_client_portal_user' => true,
        ]);
        $this->clientUser->assignRole('client');
    }

    public function test_client_directory_is_gated_on_clients_view(): void
    {
        // sales_exec holds only clients.view — previously the page's data
        // source (reports/clients) 403'd them.
        $data = $this->actingAs($this->salesExec, 'sanctum')
            ->getJson('/api/v1/clients')
            ->assertStatus(200)
            ->json();
        $this->assertArrayHasKey('summary', $data);
        $row = collect($data['breakdown'])->firstWhere('client_id', $this->clientUser->id);
        $this->assertNotNull($row);
        $this->assertSame('Acme Corp', $row['company_name']);

        $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/clients')
            ->assertStatus(403);
    }

    /**
     * Finance bills clients, so the seeder now grants them clients.view —
     * without it, the invoice builder's client picker was silently empty
     * for finance users.
     */
    public function test_finance_can_list_clients(): void
    {
        $finance = User::factory()->create(['email' => 'clients-finance@creativals.com', 'status' => 'active']);
        $finance->assignRole('finance');

        $this->actingAs($finance, 'sanctum')
            ->getJson('/api/v1/clients')
            ->assertStatus(200);
    }

    public function test_client_detail_payload_and_gating(): void
    {
        Project::create([
            'project_number' => 'PRJ-CL-1',
            'name' => 'Acme Website',
            'client_id' => $this->clientUser->id,
            'manager_id' => $this->founder->id,
            'status' => 'in_progress',
            'start_date' => now()->subMonth()->toDateString(),
        ]);
        Project::create([
            'project_number' => 'PRJ-CL-2',
            'name' => 'Acme SEO (done)',
            'client_id' => $this->clientUser->id,
            'manager_id' => $this->founder->id,
            'status' => 'completed',
        ]);
        Invoice::create([
            'invoice_number' => 'INV-CL-1',
            'title' => 'Acme Website Phase 1',
            'client_id' => $this->clientUser->id,
            'currency_id' => $this->inr->id,
            'exchange_rate' => 1,
            'status' => 'sent',
            'issue_date' => now()->subDays(10)->toDateString(),
            'due_date' => now()->addDays(20)->toDateString(),
            'subtotal' => 50000,
            'tax_amount' => 0,
            'total_amount' => 50000,
            'paid_amount' => 20000,
            'due_amount' => 30000,
            'created_by' => $this->founder->id,
        ]);
        ClientContact::create([
            'client_id' => $this->clientUser->id,
            'name' => 'Jane Billing',
            'email' => 'jane@acme.test',
            'is_primary' => true,
        ]);

        $data = $this->actingAs($this->salesExec, 'sanctum')
            ->getJson("/api/v1/clients/{$this->clientUser->id}")
            ->assertStatus(200)
            ->json();

        $this->assertSame('Acme Corp', $data['client']['company_name']);
        $this->assertCount(1, $data['contacts']);
        $this->assertCount(1, $data['projects']['active'], 'in_progress project must count as active');
        $this->assertCount(1, $data['projects']['closed']);
        $this->assertSame(1, $data['invoices']['total_count']);
        $this->assertSame(50000.0, (float) $data['totals']['total_billed']);
        $this->assertSame(30000.0, (float) $data['totals']['total_outstanding']);
        $this->assertCount(12, $data['revenue_history']);
        $historyBilledTotal = array_sum(array_column($data['revenue_history'], 'billed'));
        $this->assertSame(50000.0, (float) $historyBilledTotal, 'the invoice must appear in the 12-month billed history');
        $this->assertArrayHasKey('components', $data['health']);

        // A staff (non-client) user id 404s rather than leaking staff data
        $this->actingAs($this->salesExec, 'sanctum')
            ->getJson("/api/v1/clients/{$this->employee->id}")
            ->assertStatus(404);

        $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/clients/{$this->clientUser->id}")
            ->assertStatus(403);
    }

    public function test_client_invite_is_gated_on_clients_create_and_assigns_client_role(): void
    {
        Mail::fake();

        // sales_exec holds clients.view but NOT clients.create
        $this->actingAs($this->salesExec, 'sanctum')
            ->postJson('/api/v1/clients', [
                'name' => 'New Client', 'email' => 'newclient@test.dev', 'password' => 'secret123',
            ])
            ->assertStatus(403);

        $res = $this->actingAs($this->salesHead, 'sanctum')
            ->postJson('/api/v1/clients', [
                'name' => 'New Client',
                'company_name' => 'NewCo',
                'email' => 'newclient@test.dev',
                'password' => 'secret123',
                'default_currency_id' => $this->inr->id,
            ])
            ->assertStatus(201)
            ->json();

        $created = User::find($res['data']['id']);
        $this->assertTrue($created->hasRole('client'));
        $this->assertTrue((bool) $created->is_client_portal_user);
        $this->assertSame('NewCo', $created->company_name);
        Mail::assertQueued(\App\Mail\WelcomeUserMail::class);
    }

    public function test_client_update_is_gated_and_never_touches_roles(): void
    {
        // sales_exec: clients.view only → 403
        $this->actingAs($this->salesExec, 'sanctum')
            ->putJson("/api/v1/clients/{$this->clientUser->id}", ['name' => 'Nope'])
            ->assertStatus(403);

        // sales_head: clients.edit → 200, billing fields persist
        $this->actingAs($this->salesHead, 'sanctum')
            ->putJson("/api/v1/clients/{$this->clientUser->id}", [
                'name' => 'Acme Contact Updated',
                'billing_address' => '42 Industrial Way, Pune',
                'tax_number' => 'GSTIN-123',
                'default_currency_id' => $this->inr->id,
                'is_client_portal_user' => false,
                'role_ids' => [1], // must be ignored — role changes are Users-module territory
            ])
            ->assertStatus(200);

        $fresh = $this->clientUser->fresh();
        $this->assertSame('Acme Contact Updated', $fresh->name);
        $this->assertSame('42 Industrial Way, Pune', $fresh->billing_address);
        $this->assertSame('GSTIN-123', $fresh->tax_number);
        $this->assertFalse((bool) $fresh->is_client_portal_user);
        $this->assertTrue($fresh->hasRole('client'), 'roles must be untouched by client update');
        $this->assertFalse($fresh->hasRole('founder'));
    }

    public function test_client_delete_blocked_while_records_reference_them(): void
    {
        Project::create([
            'project_number' => 'PRJ-CL-DEL',
            'name' => 'Blocking project',
            'client_id' => $this->clientUser->id,
            'manager_id' => $this->founder->id,
            'status' => 'active',
        ]);

        $this->actingAs($this->salesHead, 'sanctum')
            ->deleteJson("/api/v1/clients/{$this->clientUser->id}")
            ->assertStatus(422);

        // A fresh, unreferenced client CAN be deleted (soft delete)
        $fresh = User::factory()->create(['email' => 'deletable-client@test.dev', 'status' => 'active']);
        $fresh->assignRole('client');
        $this->actingAs($this->salesHead, 'sanctum')
            ->deleteJson("/api/v1/clients/{$fresh->id}")
            ->assertStatus(200);
        $this->assertSoftDeleted('users', ['id' => $fresh->id]);

        $this->actingAs($this->salesExec, 'sanctum')
            ->deleteJson("/api/v1/clients/{$this->clientUser->id}")
            ->assertStatus(403);
    }

    public function test_contact_crud_and_primary_flag(): void
    {
        $res = $this->actingAs($this->salesHead, 'sanctum')
            ->postJson("/api/v1/clients/{$this->clientUser->id}/contacts", [
                'name' => 'First Contact', 'email' => 'first@acme.test', 'is_primary' => true,
            ])
            ->assertStatus(201)
            ->json();
        $firstId = $res['data']['id'];

        // Adding a second primary demotes the first
        $res2 = $this->actingAs($this->salesHead, 'sanctum')
            ->postJson("/api/v1/clients/{$this->clientUser->id}/contacts", [
                'name' => 'Second Contact', 'is_primary' => true,
            ])
            ->assertStatus(201)
            ->json();
        $this->assertFalse((bool) ClientContact::find($firstId)->is_primary);
        $this->assertTrue((bool) ClientContact::find($res2['data']['id'])->is_primary);

        $this->actingAs($this->salesHead, 'sanctum')
            ->putJson("/api/v1/clients/{$this->clientUser->id}/contacts/{$firstId}", ['designation' => 'CFO'])
            ->assertStatus(200);
        $this->assertSame('CFO', ClientContact::find($firstId)->designation);

        $this->actingAs($this->salesHead, 'sanctum')
            ->deleteJson("/api/v1/clients/{$this->clientUser->id}/contacts/{$firstId}")
            ->assertStatus(200);
        $this->assertNull(ClientContact::find($firstId));

        // clients.view alone cannot manage contacts
        $this->actingAs($this->salesExec, 'sanctum')
            ->postJson("/api/v1/clients/{$this->clientUser->id}/contacts", ['name' => 'Nope'])
            ->assertStatus(403);
    }

    public function test_communications_now_require_clients_permissions(): void
    {
        // Regression: this controller previously had NO authorization at all.
        $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/clients/{$this->clientUser->id}/communications")
            ->assertStatus(403);
        $this->actingAs($this->employee, 'sanctum')
            ->postJson("/api/v1/clients/{$this->clientUser->id}/communications", [
                'type' => 'call', 'subject' => 'Nope', 'communication_date' => now()->toDateTimeString(),
            ])
            ->assertStatus(403);

        // sales_exec (clients.view) can list and log…
        $created = $this->actingAs($this->salesExec, 'sanctum')
            ->postJson("/api/v1/clients/{$this->clientUser->id}/communications", [
                'type' => 'call', 'subject' => 'Intro call', 'communication_date' => now()->toDateTimeString(),
            ])
            ->assertStatus(201)
            ->json();
        $this->actingAs($this->salesExec, 'sanctum')
            ->getJson("/api/v1/clients/{$this->clientUser->id}/communications")
            ->assertStatus(200);

        // …and can delete their OWN log, but a different clients.view-only
        // user cannot delete someone else's.
        $otherExec = User::factory()->create(['email' => 'clients-exec2@creativals.com', 'status' => 'active']);
        $otherExec->assignRole('sales_exec');
        $this->actingAs($otherExec, 'sanctum')
            ->deleteJson("/api/v1/clients/{$this->clientUser->id}/communications/{$created['data']['id']}")
            ->assertStatus(403);
        $this->actingAs($this->salesExec, 'sanctum')
            ->deleteJson("/api/v1/clients/{$this->clientUser->id}/communications/{$created['data']['id']}")
            ->assertStatus(200);
    }
}
