<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Currency;
use App\Models\LeadSource;
use App\Models\LeadStage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Drives the full revenue lifecycle through the public API with no mocks:
 * lead -> convert to quote -> approval flow -> invoice -> payments -> paid.
 * Each step asserts the state handoff the next step depends on, so a break
 * anywhere in the chain fails loudly at the exact link that regressed.
 */
class LifecycleEndToEndTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $client;
    private Currency $currency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();

        $this->client = User::create([
            'name' => 'Lifecycle Test Client',
            'email' => 'lifecycle_client@creativals.com',
            'password' => bcrypt('password'),
            'status' => 'active',
            'is_client_portal_user' => true,
        ]);
        $this->client->assignRole('client');

        $this->currency = Currency::where('code', 'INR')->first() ?? Currency::first();
    }

    public function test_full_lead_to_paid_invoice_lifecycle(): void
    {
        $this->actingAs($this->founder, 'sanctum');

        // 1. Lead comes in through the CRM.
        $leadResponse = $this->postJson('/api/v1/leads', [
            'company_name' => 'Lifecycle Corp',
            'lead_source_id' => LeadSource::first()->id,
            'stage_id' => LeadStage::first()->id,
            'sales_exec_id' => $this->founder->id,
            'priority' => 'high',
            'temperature' => 'hot',
            'estimated_monthly_budget' => 5000.00,
            'contacts' => [
                [
                    'name' => 'Lifecycle Contact',
                    'email' => 'contact@lifecyclecorp.com',
                ],
            ],
        ]);
        $leadResponse->assertStatus(201);
        $leadId = $leadResponse->json('data.id');

        // 2. Lead converts into a draft quote.
        $convertResponse = $this->postJson("/api/v1/leads/{$leadId}/convert", [
            'quote_title' => 'Lifecycle Proposal',
            'valid_until' => now()->addDays(30)->toDateString(),
        ]);
        $convertResponse->assertStatus(201);
        $quoteId = $convertResponse->json('quote_id');

        $this->assertDatabaseHas('leads', ['id' => $leadId, 'is_converted' => true]);
        $this->assertDatabaseHas('quotes', ['id' => $quoteId, 'status' => 'draft']);

        // 3. Quote goes through the approval flow.
        $this->postJson("/api/v1/quotes/{$quoteId}/submit-approval")->assertStatus(200);
        $this->assertDatabaseHas('quotes', ['id' => $quoteId, 'status' => 'pending_approval']);

        $this->postJson("/api/v1/quotes/{$quoteId}/approve")->assertStatus(200);
        $this->assertDatabaseHas('quotes', ['id' => $quoteId, 'status' => 'approved']);

        // 4. Approved quote converts into a draft invoice.
        //    Item: 1 x 5000 @ 18% tax => subtotal 5000, tax 900, total 5900.
        $invoiceResponse = $this->postJson('/api/v1/invoices', [
            'quote_id' => $quoteId,
            'client_id' => $this->client->id,
            'title' => 'Lifecycle Invoice',
            'currency_id' => $this->currency->id,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
            'items' => [
                [
                    'description' => 'Monthly retainer',
                    'quantity' => 1,
                    'unit_price' => 5000.00,
                    'tax_rate' => 18.00,
                ],
            ],
        ]);
        $invoiceResponse->assertStatus(201);
        $invoiceId = $invoiceResponse->json('data.id');

        $this->assertDatabaseHas('invoices', [
            'id' => $invoiceId,
            'quote_id' => $quoteId,
            'client_id' => $this->client->id,
            'status' => 'draft',
            'total_amount' => 5900.00,
            'due_amount' => 5900.00,
        ]);
        $this->assertDatabaseHas('quotes', ['id' => $quoteId, 'status' => 'converted']);

        // A quote can only be converted once.
        $this->postJson('/api/v1/invoices', [
            'quote_id' => $quoteId,
            'client_id' => $this->client->id,
            'title' => 'Duplicate Conversion',
            'currency_id' => $this->currency->id,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
            'items' => [
                ['description' => 'Dup', 'quantity' => 1, 'unit_price' => 1.00],
            ],
        ])->assertStatus(422);

        // 5. Invoice is issued to the client (draft -> sent). Payments only
        //    drive the status once the invoice has left the draft pipeline.
        $this->putJson("/api/v1/invoices/{$invoiceId}", [
            'title' => 'Lifecycle Invoice',
            'currency_id' => $this->currency->id,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
            'status' => 'sent',
            'items' => [
                [
                    'description' => 'Monthly retainer',
                    'quantity' => 1,
                    'unit_price' => 5000.00,
                    'tax_rate' => 18.00,
                ],
            ],
        ])->assertStatus(200);
        $this->assertDatabaseHas('invoices', ['id' => $invoiceId, 'status' => 'sent']);

        // 6. Partial payment marks the invoice partially paid.
        $this->postJson("/api/v1/invoices/{$invoiceId}/payments", [
            'amount' => 2000.00,
            'payment_date' => now()->toDateString(),
            'payment_method' => 'bank_transfer',
        ])->assertStatus(201);

        $this->assertDatabaseHas('invoices', [
            'id' => $invoiceId,
            'status' => 'partially_paid',
            'paid_amount' => 2000.00,
            'due_amount' => 3900.00,
        ]);

        // 7. Paying the balance settles the invoice.
        $this->postJson("/api/v1/invoices/{$invoiceId}/payments", [
            'amount' => 3900.00,
            'payment_date' => now()->toDateString(),
            'payment_method' => 'bank_transfer',
        ])->assertStatus(201);

        $this->assertDatabaseHas('invoices', [
            'id' => $invoiceId,
            'status' => 'paid',
            'paid_amount' => 5900.00,
            'due_amount' => 0.00,
        ]);
    }
}
