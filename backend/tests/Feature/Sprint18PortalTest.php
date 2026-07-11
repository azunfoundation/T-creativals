<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Currency;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Client Portal (Sprint 18) — suspended-account lockout, portal tokens
 * blocked from the staff API, and clients never seeing internal draft
 * invoices.
 */
class Sprint18PortalTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $client;
    private Currency $inr;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        $this->inr = Currency::where('code', 'INR')->first();

        $this->client = User::factory()->create([
            'email' => 'portal-client@creativals.com',
            'password' => bcrypt('secret123'),
            'status' => 'active',
            'is_client_portal_user' => true,
        ]);
        $this->client->assignRole('client');
    }

    public function test_suspended_client_cannot_login_or_use_existing_session(): void
    {
        // Active client logs in fine
        $login = $this->postJson('/api/v1/portal/login', [
            'email' => 'portal-client@creativals.com',
            'password' => 'secret123',
        ])->assertStatus(200)->json();

        // Suspension blocks new logins…
        $this->client->update(['status' => 'suspended']);
        $this->postJson('/api/v1/portal/login', [
            'email' => 'portal-client@creativals.com',
            'password' => 'secret123',
        ])->assertStatus(403);

        // …and kills the existing session on the next data request
        $this->getJson('/api/v1/portal/projects', [
            'Authorization' => 'Bearer ' . $login['token'],
        ])->assertStatus(403);
    }

    public function test_portal_tokens_cannot_reach_the_staff_api(): void
    {
        // A real portal-scoped token (abilities: portal:read)
        Sanctum::actingAs($this->client, ['portal:read']);

        // Portal endpoints work…
        $this->getJson('/api/v1/portal/projects')->assertStatus(200);

        // …but staff endpoints are closed to portal sessions, regardless of
        // what the client role's permissions would otherwise allow.
        $this->getJson('/api/v1/projects')->assertStatus(403);
        $this->getJson('/api/v1/reports/dashboard')->assertStatus(403);
        $this->postJson('/api/v1/attendance/clock-in')->assertStatus(403);

        // A staff token (abilities: *) is unaffected.
        Sanctum::actingAs($this->founder, ['*']);
        $this->getJson('/api/v1/reports/dashboard')->assertStatus(200);
    }

    public function test_portal_only_lists_issued_invoices(): void
    {
        $mk = function (string $status, string $number) {
            return Invoice::create([
                'invoice_number' => $number,
                'title' => "Invoice {$status}",
                'client_id' => $this->client->id,
                'created_by' => $this->founder->id,
                'currency_id' => $this->inr->id,
                'exchange_rate' => 1,
                'status' => $status,
                'issue_date' => now()->toDateString(),
                'due_date' => now()->addDays(15)->toDateString(),
                'subtotal' => 1000,
                'tax_amount' => 0,
                'total_amount' => 1000,
                'paid_amount' => 0,
                'due_amount' => 1000,
            ]);
        };
        $mk('draft', 'INV-P-DRAFT');
        $mk('pending_approval', 'INV-P-PENDING');
        $mk('sent', 'INV-P-SENT');
        $mk('paid', 'INV-P-PAID');

        Sanctum::actingAs($this->client, ['portal:read']);
        $res = $this->getJson('/api/v1/portal/invoices')->assertStatus(200)->json();

        $numbers = collect($res['data'])->pluck('invoice_number');
        $this->assertTrue($numbers->contains('INV-P-SENT'));
        $this->assertTrue($numbers->contains('INV-P-PAID'));
        $this->assertFalse($numbers->contains('INV-P-DRAFT'), 'internal drafts must never reach the portal');
        $this->assertFalse($numbers->contains('INV-P-PENDING'));
    }
}
