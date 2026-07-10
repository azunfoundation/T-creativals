<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Currency;
use App\Models\DiscountCoupon;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Payment;
use App\Models\Quote;
use App\Models\RecurringBillingRule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Carbon\Carbon;
use Tests\TestCase;

class Sprint4InvoiceTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $finance;
    private User $employee;
    private User $client;
    private Currency $currency;

    protected function setUp(): void
    {
        parent::setUp();

        // Run migrations and seed data
        $this->seed();

        // Retrieve seeded founder
        $this->founder = User::where('email', 'founder@creativals.com')->first();

        // Create/Retrieve finance user
        $this->finance = User::where('email', 'finance@creativals.com')->first();
        if (!$this->finance) {
            $this->finance = User::create([
                'name' => 'Finance Manager',
                'email' => 'finance@creativals.com',
                'password' => bcrypt('password'),
                'status' => 'active',
            ]);
            $this->finance->assignRole('finance');
        }

        // Create employee user
        $this->employee = User::factory()->create([
            'email' => 'employee_test@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => false,
        ]);
        $this->employee->assignRole('employee');

        // Create client user
        $this->client = User::create([
            'name' => 'Acme Test Corp',
            'email' => 'client_test@creativals.com',
            'password' => bcrypt('password'),
            'status' => 'active',
            'is_client_portal_user' => true,
        ]);
        $this->client->assignRole('client');

        $this->currency = Currency::where('code', 'INR')->first() ?? Currency::first();
    }

    /**
     * Helper to create standard invoice array data for POST request.
     */
    private function getInvoiceData(array $overrides = []): array
    {
        return array_merge([
            'client_id' => $this->client->id,
            'title' => 'Test Project Invoice',
            'description' => 'Test invoice description',
            'currency_id' => $this->currency->id,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
            'items' => [
                [
                    'description' => 'Software Design & Specs',
                    'quantity' => 2,
                    'unit' => 'hours',
                    'unit_price' => 5000.00,
                    'discount_percent' => 10.00, // 10% off
                    'tax_rate' => 18.00, // 18% tax
                    'sort_order' => 1,
                ]
            ]
        ], $overrides);
    }

    /**
     * Test Invoice Index (Authorized).
     */
    public function test_invoices_index_authorized(): void
    {
        $this->actingAs($this->finance, 'sanctum');
        $response = $this->getJson('/api/v1/invoices');
        $response->assertStatus(200)
            ->assertJsonStructure(['data', 'links', 'meta']);
    }

    /**
     * Test Invoice Index (Unauthorized).
     */
    public function test_invoices_index_unauthorized(): void
    {
        $this->actingAs($this->employee, 'sanctum');
        $response = $this->getJson('/api/v1/invoices');
        $response->assertStatus(403);
    }

    /**
     * Test Invoice Show (Authorized).
     */
    public function test_invoices_show_authorized(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $response = $this->getJson("/api/v1/invoices/{$invoice->id}");
        $response->assertStatus(200)
            ->assertJsonFragment(['title' => 'Demo']);
    }

    /**
     * Test Invoice Show (Unauthorized).
     */
    public function test_invoices_show_unauthorized(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->getJson("/api/v1/invoices/{$invoice->id}");
        $response->assertStatus(403);
    }

    /**
     * Test Invoice Create (Authorized).
     */
    public function test_invoices_create_authorized(): void
    {
        $this->actingAs($this->finance, 'sanctum');
        $data = $this->getInvoiceData();
        $response = $this->postJson('/api/v1/invoices', $data);
        $response->assertStatus(201)
            ->assertJsonFragment(['title' => 'Test Project Invoice']);
    }

    /**
     * Test Invoice Create (Unauthorized).
     */
    public function test_invoices_create_unauthorized(): void
    {
        $this->actingAs($this->employee, 'sanctum');
        $data = $this->getInvoiceData();
        $response = $this->postJson('/api/v1/invoices', $data);
        $response->assertStatus(403);
    }

    /**
     * Test Invoice Create validation rules.
     */
    public function test_invoices_create_validation(): void
    {
        $this->actingAs($this->finance, 'sanctum');
        $data = $this->getInvoiceData(['title' => '']); // empty title
        $response = $this->postJson('/api/v1/invoices', $data);
        $response->assertStatus(422)
            ->assertJsonValidationErrors(['title']);
    }

    /**
     * Test Invoice Update (Authorized).
     */
    public function test_invoices_update_authorized(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Old Title',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);
        $invoice->items()->create([
            'description' => 'item',
            'quantity' => 1,
            'unit_price' => 1000.00,
            'total_amount' => 1000.00,
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $data = $this->getInvoiceData(['title' => 'New Title']);
        $response = $this->putJson("/api/v1/invoices/{$invoice->id}", $data);
        $response->assertStatus(200)
            ->assertJsonFragment(['title' => 'New Title']);
    }

    /**
     * Test Invoice Update (Unauthorized).
     */
    public function test_invoices_update_unauthorized(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Old Title',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->employee, 'sanctum');
        $data = $this->getInvoiceData(['title' => 'New Title']);
        $response = $this->putJson("/api/v1/invoices/{$invoice->id}", $data);
        $response->assertStatus(403);
    }

    /**
     * Test Invoice Delete (Authorized).
     */
    public function test_invoices_delete_authorized(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Delete Me',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $response = $this->deleteJson("/api/v1/invoices/{$invoice->id}");
        $response->assertStatus(200);
        $this->assertSoftDeleted('invoices', ['id' => $invoice->id]);
    }

    /**
     * Test Invoice Delete (Unauthorized).
     */
    public function test_invoices_delete_unauthorized(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Delete Me',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->deleteJson("/api/v1/invoices/{$invoice->id}");
        $response->assertStatus(403);
    }

    /**
     * Test mathematical calculations (tax, discount, total) on invoice creation.
     * Item: Qty 2, Unit Price 5,000, Discount 10%, Tax 18%
     * Subtotal = 2 * 5,000 = 10,000
     * Discount = 10,000 * 10% = 1,000
     * Taxable = 9,000
     * Tax = 9,000 * 18% = 1,620
     * Total = 9,000 + 1,620 = 10,620
     */
    public function test_invoice_mathematical_calculations_with_discounts_and_tax(): void
    {
        $this->actingAs($this->finance, 'sanctum');
        $data = $this->getInvoiceData();
        
        $response = $this->postJson('/api/v1/invoices', $data);
        $response->assertStatus(201)
            ->assertJsonFragment([
                'subtotal' => '10000.00',
                'discount_amount' => '1000.00',
                'tax_amount' => '1620.00',
                'total_amount' => '10620.00',
                'paid_amount' => '0.00',
                'due_amount' => '10620.00',
            ]);
    }

    /**
     * Test invoice calculations with coupon applied.
     * Subtotal = 10,000
     * Item Discount = 1,000
     * Taxable for Coupon = 9,000
     * Coupon Applied: FLAT5000 (valid for amounts >= 20,000 but let's assume we validate a coupon that is valid).
     * Let's use Coupon FLAT5000 in DB which has min 20,000.
     * Let's change the price so subtotal - items_discount is >= 20,000.
     * Qty = 2, Price = 15,000, Disc = 10% (3,000)
     * Taxable for Coupon = 27,000. Coupon FLAT5000 value = 5,000.
     * Subtotal = 30,000. Total Discount = 3,000 + 5,000 = 8,000.
     * Tax = 27,000 * 18% = 4,860.
     * Total = 30,000 - 8,000 + 4,860 = 26,860.
     */
    public function test_invoice_calculations_with_coupon_applied(): void
    {
        $this->actingAs($this->finance, 'sanctum');
        $data = $this->getInvoiceData([
            'coupon_code' => 'FLAT5000',
            'items' => [
                [
                    'description' => 'Development services',
                    'quantity' => 2,
                    'unit_price' => 15000.00,
                    'discount_percent' => 10.00,
                    'tax_rate' => 18.00,
                ]
            ]
        ]);

        $response = $this->postJson('/api/v1/invoices', $data);
        $response->assertStatus(201)
            ->assertJsonFragment([
                'subtotal' => '30000.00',
                'discount_amount' => '8000.00',
                'coupon_discount' => '5000.00',
                'tax_amount' => '4860.00',
                'total_amount' => '26860.00',
            ]);
    }

    /**
     * Test converting a Quote to an Invoice.
     */
    public function test_convert_quote_to_invoice(): void
    {
        $quote = Quote::create([
            'quote_number' => 'QUO-CONV-1',
            'title' => 'Convert Proposal',
            'created_by' => $this->founder->id,
            'currency_id' => $this->currency->id,
            'subtotal' => 5000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 5000.00,
            'status' => 'approved',
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $data = $this->getInvoiceData([
            'quote_id' => $quote->id,
        ]);

        $response = $this->postJson('/api/v1/invoices', $data);
        $response->assertStatus(201);
        
        $this->assertEquals('converted', $quote->fresh()->status);
    }

    /**
     * Test recording a payment (Authorized).
     */
    public function test_record_payment_authorized(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'due_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $response = $this->postJson("/api/v1/invoices/{$invoice->id}/payments", [
            'amount' => 300.00,
            'payment_date' => now()->toDateString(),
            'payment_method' => 'cash',
        ]);
        $response->assertStatus(201)
            ->assertJsonFragment(['amount' => '300.00']);
    }

    /**
     * Test recording a payment (Unauthorized).
     */
    public function test_record_payment_unauthorized(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'due_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->employee, 'sanctum');
        $response = $this->postJson("/api/v1/invoices/{$invoice->id}/payments", [
            'amount' => 300.00,
            'payment_date' => now()->toDateString(),
            'payment_method' => 'cash',
        ]);
        $response->assertStatus(403);
    }

    /**
     * Test payment calculations on Invoice.
     */
    public function test_payment_calculations_paid_and_due_amounts(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'due_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $this->postJson("/api/v1/invoices/{$invoice->id}/payments", [
            'amount' => 400.00,
            'payment_date' => now()->toDateString(),
            'payment_method' => 'bank_transfer',
        ])->assertStatus(201);

        $invoice->refresh();
        $this->assertEquals(400.00, (float) $invoice->paid_amount);
        $this->assertEquals(600.00, (float) $invoice->due_amount);
    }

    /**
     * Test payment validation.
     */
    public function test_payment_validation(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'due_amount' => 1000.00,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $response = $this->postJson("/api/v1/invoices/{$invoice->id}/payments", [
            'amount' => -10, // invalid negative amount
            'payment_date' => 'not-a-date',
            'payment_method' => '',
        ]);
        $response->assertStatus(422)
            ->assertJsonValidationErrors(['amount', 'payment_date', 'payment_method']);
    }

    /**
     * Test automatic status transition to paid.
     */
    public function test_automatic_status_transition_to_paid(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'due_amount' => 1000.00,
            'status' => 'sent',
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $this->postJson("/api/v1/invoices/{$invoice->id}/payments", [
            'amount' => 1000.00, // full payment
            'payment_date' => now()->toDateString(),
            'payment_method' => 'bank_transfer',
        ])->assertStatus(201);

        $this->assertEquals('paid', $invoice->fresh()->status);
    }

    /**
     * Test automatic status transition to partially paid.
     */
    public function test_automatic_status_transition_to_partially_paid(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'due_amount' => 1000.00,
            'status' => 'sent',
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $this->postJson("/api/v1/invoices/{$invoice->id}/payments", [
            'amount' => 500.00, // partial payment
            'payment_date' => now()->toDateString(),
            'payment_method' => 'bank_transfer',
        ])->assertStatus(201);

        $this->assertEquals('partially_paid', $invoice->fresh()->status);
    }

    /**
     * Test deleting a payment recalculates invoice totals.
     */
    public function test_delete_payment_recalculates_invoice(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'due_amount' => 1000.00,
            'status' => 'sent',
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $payment = Payment::create([
            'invoice_id' => $invoice->id,
            'amount' => 600.00,
            'payment_date' => now()->toDateString(),
            'payment_method' => 'bank_transfer',
            'recorded_by' => $this->founder->id,
        ]);

        $invoice->refresh();
        $this->assertEquals(600.00, (float) $invoice->paid_amount);

        $this->actingAs($this->finance, 'sanctum');
        $this->deleteJson("/api/v1/payments/{$payment->id}")->assertStatus(200);

        $invoice->refresh();
        $this->assertEquals(0.00, (float) $invoice->fresh()->paid_amount);
        $this->assertEquals(1000.00, (float) $invoice->fresh()->due_amount);
    }

    /**
     * Test Recurring Billing Rule CRUD operations.
     */
    public function test_recurring_billing_rule_crud(): void
    {
        $this->actingAs($this->finance, 'sanctum');

        // Create rule
        $response = $this->postJson('/api/v1/recurring-billing-rules', [
            'name' => 'Monthly Hosting Support',
            'client_id' => $this->client->id,
            'status' => 'active',
            'frequency' => 'monthly',
            'start_date' => now()->toDateString(),
            'currency_id' => $this->currency->id,
            'items' => [
                [
                    'description' => 'Hosting services',
                    'quantity' => 1,
                    'unit_price' => 5000.00,
                ]
            ]
        ]);
        $response->assertStatus(201)
            ->assertJsonFragment(['name' => 'Monthly Hosting Support']);

        $ruleId = $response->json('data.id');

        // Show rule
        $this->getJson("/api/v1/recurring-billing-rules/{$ruleId}")
            ->assertStatus(200);

        // Update rule
        $this->putJson("/api/v1/recurring-billing-rules/{$ruleId}", [
            'name' => 'Monthly Hosting Support v2',
            'frequency' => 'monthly',
            'start_date' => now()->toDateString(),
            'currency_id' => $this->currency->id,
            'items' => [
                [
                    'description' => 'Hosting services upgrade',
                    'quantity' => 1,
                    'unit_price' => 6000.00,
                ]
            ]
        ])->assertStatus(200)
            ->assertJsonFragment(['name' => 'Monthly Hosting Support v2']);

        // Delete rule
        $this->deleteJson("/api/v1/recurring-billing-rules/{$ruleId}")
            ->assertStatus(200);
    }

    /**
     * Test scheduler command generates invoice correctly.
     */
    public function test_scheduler_command_generates_invoice(): void
    {
        $rule = RecurringBillingRule::create([
            'name' => 'Monthly Support',
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'status' => 'active',
            'frequency' => 'monthly',
            'start_date' => now()->subMonth()->toDateString(),
            'next_generation_date' => now()->toDateString(),
            'currency_id' => $this->currency->id,
            'subtotal' => 2000.00,
            'total_amount' => 2360.00,
        ]);
        $rule->items()->create([
            'description' => 'Regular support services',
            'quantity' => 1,
            'unit_price' => 2000.00,
            'tax_rate' => 18.00,
            'tax_amount' => 360.00,
            'total_amount' => 2360.00,
        ]);

        $this->assertDatabaseMissing('invoices', [
            'recurring_rule_id' => $rule->id,
        ]);

        // Run scheduler command
        Artisan::call('creativals:generate-recurring-invoices');

        $this->assertDatabaseHas('invoices', [
            'recurring_rule_id' => $rule->id,
            'total_amount' => 2360.00,
        ]);

        // Check if rule state updated
        $rule->refresh();
        $this->assertNotNull($rule->last_generated_at);
        $this->assertEquals(now()->addMonth()->toDateString(), $rule->next_generation_date->toDateString());
    }

    /**
     * Test scheduler command next_generation_date advancement for monthly frequency.
     */
    public function test_scheduler_command_frequency_advancements_monthly(): void
    {
        $rule = RecurringBillingRule::create([
            'name' => 'Monthly Support test',
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'status' => 'active',
            'frequency' => 'monthly',
            'start_date' => now()->subMonth()->toDateString(),
            'next_generation_date' => now()->toDateString(),
            'currency_id' => $this->currency->id,
            'subtotal' => 100.00,
            'total_amount' => 100.00,
        ]);
        $rule->items()->create([
            'description' => 'item',
            'quantity' => 1,
            'unit_price' => 100.00,
            'total_amount' => 100.00,
        ]);

        Artisan::call('creativals:generate-recurring-invoices');

        $rule->refresh();
        $this->assertEquals(now()->addMonth()->toDateString(), $rule->next_generation_date->toDateString());
    }

    /**
     * Test scheduler command next_generation_date advancement for weekly frequency.
     */
    public function test_scheduler_command_frequency_advancements_weekly(): void
    {
        $rule = RecurringBillingRule::create([
            'name' => 'Weekly Support test',
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'status' => 'active',
            'frequency' => 'weekly',
            'start_date' => now()->subWeek()->toDateString(),
            'next_generation_date' => now()->toDateString(),
            'currency_id' => $this->currency->id,
            'subtotal' => 100.00,
            'total_amount' => 100.00,
        ]);
        $rule->items()->create([
            'description' => 'item',
            'quantity' => 1,
            'unit_price' => 100.00,
            'total_amount' => 100.00,
        ]);

        Artisan::call('creativals:generate-recurring-invoices');

        $rule->refresh();
        $this->assertEquals(now()->addWeek()->toDateString(), $rule->next_generation_date->toDateString());
    }

    /**
     * Test scheduler command respects end_date.
     */
    public function test_scheduler_command_handles_end_date(): void
    {
        $rule = RecurringBillingRule::create([
            'name' => 'Support ending today',
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'status' => 'active',
            'frequency' => 'monthly',
            'start_date' => now()->subMonth()->toDateString(),
            'next_generation_date' => now()->toDateString(),
            'end_date' => now()->toDateString(), // Ends today!
            'currency_id' => $this->currency->id,
            'subtotal' => 100.00,
            'total_amount' => 100.00,
        ]);
        $rule->items()->create([
            'description' => 'item',
            'quantity' => 1,
            'unit_price' => 100.00,
            'total_amount' => 100.00,
        ]);

        Artisan::call('creativals:generate-recurring-invoices');

        $rule->refresh();
        $this->assertNull($rule->next_generation_date);
        $this->assertEquals('inactive', $rule->status);
    }

    /**
     * Test submit-approval endpoint.
     */
    public function test_submit_approval_success(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Submit Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'status' => 'draft',
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $this->actingAs($this->finance, 'sanctum');
        $response = $this->postJson("/api/v1/invoices/{$invoice->id}/submit-approval", [
            'notes' => 'Please review this invoice.'
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'pending_review');

        $this->assertDatabaseHas('invoice_approvals', [
            'invoice_id' => $invoice->id,
            'action' => 'submitted',
            'actor_id' => $this->finance->id,
            'notes' => 'Please review this invoice.',
        ]);
    }

    /**
     * Test review endpoint (authorized head role).
     */
    public function test_review_success(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Review Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'status' => 'pending_review',
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $head = User::factory()->create(['status' => 'active']);
        $head->assignRole('sales_head');

        $this->actingAs($head, 'sanctum');
        $response = $this->postJson("/api/v1/invoices/{$invoice->id}/review", [
            'notes' => 'Looks good to me.'
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'pending_approval');

        $this->assertDatabaseHas('invoice_approvals', [
            'invoice_id' => $invoice->id,
            'action' => 'reviewed',
            'actor_id' => $head->id,
            'notes' => 'Looks good to me.',
        ]);
    }

    /**
     * Test approve endpoint (Founder/Director role).
     * This checks project creation, lead conversion, and client role assignment.
     */
    public function test_approve_success_triggers_automation(): void
    {
        // Create Lead
        $lead = \App\Models\Lead::create([
            'company_name' => 'Acme Corp Lead',
            'notes' => 'Hot lead',
            'priority' => 'medium',
            'temperature' => 'hot',
            'is_converted' => false,
        ]);

        // Create Quote
        $quote = Quote::create([
            'quote_number' => 'QUO-APP-1',
            'title' => 'Approve Quote',
            'lead_id' => $lead->id,
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'currency_id' => $this->currency->id,
            'subtotal' => 5000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 5000.00,
            'status' => 'approved',
        ]);

        // Create Invoice
        $invoice = Invoice::create([
            'quote_id' => $quote->id,
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Approve Project Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 5000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 5000.00,
            'status' => 'pending_approval',
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        // Strip client role from client user to test auto-assignment
        $this->client->removeRole('client');
        $this->assertFalse($this->client->fresh()->hasRole('client'));

        $this->actingAs($this->founder, 'sanctum');
        $response = $this->postJson("/api/v1/invoices/{$invoice->id}/approve", [
            'notes' => 'Final approval granted.'
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'approved');

        // Check InvoiceApproval was logged
        $this->assertDatabaseHas('invoice_approvals', [
            'invoice_id' => $invoice->id,
            'action' => 'approved',
            'actor_id' => $this->founder->id,
            'notes' => 'Final approval granted.',
        ]);

        // Check Project stub creation
        $this->assertDatabaseHas('projects', [
            'name' => 'Approve Project Demo',
            'client_id' => $this->client->id,
            'invoice_id' => $invoice->id,
            'status' => 'planning',
        ]);

        // Check Lead conversion
        $lead->refresh();
        $this->assertTrue($lead->is_converted);
        $this->assertEquals($this->client->id, $lead->converted_client_id);
        $this->assertNotNull($lead->converted_at);

        // Check client role assignment
        $this->assertTrue($this->client->fresh()->hasRole('client'));

        // Check Audit log entry
        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => Invoice::class,
            'auditable_id' => $invoice->id,
            'event' => 'approved',
        ]);
    }

    /**
     * Test reject endpoint.
     */
    public function test_reject_success(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Reject Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'status' => 'pending_review',
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        $head = User::factory()->create(['status' => 'active']);
        $head->assignRole('sales_head');

        $this->actingAs($head, 'sanctum');
        $response = $this->postJson("/api/v1/invoices/{$invoice->id}/reject", [
            'notes' => 'Information missing.'
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'draft');

        $this->assertDatabaseHas('invoice_approvals', [
            'invoice_id' => $invoice->id,
            'action' => 'rejected',
            'actor_id' => $head->id,
            'notes' => 'Information missing.',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'auditable_type' => Invoice::class,
            'auditable_id' => $invoice->id,
            'event' => 'rejected',
        ]);
    }

    /**
     * Test authorization failures on approval endpoints.
     */
    public function test_approval_endpoints_authorization(): void
    {
        $invoice = Invoice::create([
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Auth Demo',
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 1000.00,
            'status' => 'pending_review',
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
        ]);

        // Regular employee tries to review -> 403
        $this->actingAs($this->employee, 'sanctum');
        $response = $this->postJson("/api/v1/invoices/{$invoice->id}/review");
        $response->assertStatus(403);

        // Sales head tries to approve (needs Founder/Director) -> 403
        $head = User::factory()->create(['status' => 'active']);
        $head->assignRole('sales_head');

        $invoice->update(['status' => 'pending_approval']);
        
        $this->actingAs($head, 'sanctum');
        $response = $this->postJson("/api/v1/invoices/{$invoice->id}/approve");
        $response->assertStatus(403);
    }
}
