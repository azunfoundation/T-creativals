<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Currency;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\RecurringBillingRule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * Regression tests for the safety behaviour added to the two recurring
 * billing commands: --dry-run must never write, inactive/deleted clients
 * must never be invoiced, and expired rules must be deactivated.
 */
class RecurringInvoiceCommandsTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $client;
    private Currency $currency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->founder = User::create([
            'name' => 'Founder',
            'email' => 'founder_cmd_test@creativals.com',
            'password' => bcrypt('password'),
            'status' => 'active',
        ]);

        $this->client = User::create([
            'name' => 'Command Test Client',
            'email' => 'client_cmd_test@creativals.com',
            'password' => bcrypt('password'),
            'status' => 'active',
            'is_client_portal_user' => true,
        ]);

        $this->currency = Currency::create([
            'code' => 'INR',
            'name' => 'Indian Rupee',
            'symbol' => "\u{20B9}",
            'exchange_rate' => 1,
        ]);
    }

    private function makeDueRule(array $overrides = []): RecurringBillingRule
    {
        $rule = RecurringBillingRule::create(array_merge([
            'name' => 'Monthly Retainer',
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'status' => 'active',
            'frequency' => 'monthly',
            'start_date' => now()->subMonth()->toDateString(),
            'next_generation_date' => now()->toDateString(),
            'currency_id' => $this->currency->id,
            'subtotal' => 1000.00,
            'total_amount' => 1180.00,
        ], $overrides));

        $rule->items()->create([
            'description' => 'Retainer services',
            'quantity' => 1,
            'unit_price' => 1000.00,
            'tax_rate' => 18.00,
            'tax_amount' => 180.00,
            'total_amount' => 1180.00,
        ]);

        return $rule;
    }

    private function makeDueRecurringInvoice(array $overrides = []): Invoice
    {
        $invoice = Invoice::create(array_merge([
            'invoice_number' => 'INV-CMD-' . uniqid(),
            'client_id' => $this->client->id,
            'created_by' => $this->founder->id,
            'title' => 'Hosting',
            'currency_id' => $this->currency->id,
            'subtotal' => 100,
            'total_amount' => 100,
            'issue_date' => Carbon::today()->subMonth(),
            'due_date' => Carbon::today()->subMonth()->addDays(7),
            'status' => 'paid',
            'paid_amount' => 100,
            'due_amount' => 0,
            'is_recurring' => true,
            'recurring_interval' => 'monthly',
        ], $overrides));

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'description' => 'Hosting Plan',
            'quantity' => 1,
            'unit_price' => 100,
            'total_amount' => 100,
        ]);

        return $invoice;
    }

    // ---- creativals:generate-recurring-invoices ----

    public function test_generate_dry_run_writes_nothing(): void
    {
        $rule = $this->makeDueRule();
        $originalNextDate = $rule->next_generation_date->toDateString();

        Artisan::call('creativals:generate-recurring-invoices', ['--dry-run' => true]);
        $output = Artisan::output();

        $this->assertStringContainsString('[DRY RUN]', $output);
        $this->assertStringContainsString('Would generate invoice from rule', $output);
        $this->assertDatabaseMissing('invoices', ['recurring_rule_id' => $rule->id]);

        $rule->refresh();
        $this->assertNull($rule->last_generated_at);
        $this->assertEquals($originalNextDate, $rule->next_generation_date->toDateString());
        $this->assertEquals('active', $rule->status);
    }

    public function test_generate_skips_rule_when_client_is_inactive(): void
    {
        $this->client->update(['status' => 'inactive']);
        $rule = $this->makeDueRule();
        $originalNextDate = $rule->next_generation_date->toDateString();

        Artisan::call('creativals:generate-recurring-invoices');
        $output = Artisan::output();

        $this->assertStringContainsString('Skipped rule', $output);
        $this->assertStringContainsString("client account status is 'inactive'", $output);
        $this->assertDatabaseMissing('invoices', ['recurring_rule_id' => $rule->id]);

        $rule->refresh();
        $this->assertNull($rule->last_generated_at);
        $this->assertEquals($originalNextDate, $rule->next_generation_date->toDateString());
    }

    public function test_generate_skips_rule_when_client_is_soft_deleted(): void
    {
        $rule = $this->makeDueRule();
        $this->client->delete();

        Artisan::call('creativals:generate-recurring-invoices');
        $output = Artisan::output();

        $this->assertStringContainsString('Skipped rule', $output);
        $this->assertStringContainsString('client account is missing/deleted', $output);
        $this->assertDatabaseMissing('invoices', ['recurring_rule_id' => $rule->id]);
    }

    public function test_generate_deactivates_expired_rule_without_generating(): void
    {
        $rule = $this->makeDueRule([
            'start_date' => now()->subMonths(3)->toDateString(),
            'next_generation_date' => now()->subDays(5)->toDateString(),
            'end_date' => now()->subDay()->toDateString(),
        ]);

        Artisan::call('creativals:generate-recurring-invoices');
        $output = Artisan::output();

        $this->assertStringContainsString('Deactivated expired rule', $output);
        $this->assertDatabaseMissing('invoices', ['recurring_rule_id' => $rule->id]);

        $rule->refresh();
        $this->assertEquals('inactive', $rule->status);
        $this->assertNull($rule->next_generation_date);
    }

    public function test_generate_dry_run_does_not_deactivate_expired_rule(): void
    {
        $rule = $this->makeDueRule([
            'start_date' => now()->subMonths(3)->toDateString(),
            'next_generation_date' => now()->subDays(5)->toDateString(),
            'end_date' => now()->subDay()->toDateString(),
        ]);

        Artisan::call('creativals:generate-recurring-invoices', ['--dry-run' => true]);
        $output = Artisan::output();

        $this->assertStringContainsString('Would deactivate expired rule', $output);

        $rule->refresh();
        $this->assertEquals('active', $rule->status);
        $this->assertNotNull($rule->next_generation_date);
    }

    // ---- invoices:process-recurring ----

    public function test_process_dry_run_writes_nothing(): void
    {
        $invoice = $this->makeDueRecurringInvoice();

        Artisan::call('invoices:process-recurring', ['--dry-run' => true]);
        $output = Artisan::output();

        $this->assertStringContainsString('[DRY RUN]', $output);
        $this->assertStringContainsString('Would generate child of invoice', $output);
        $this->assertDatabaseMissing('invoices', ['parent_invoice_id' => $invoice->id]);

        $invoice->refresh();
        $this->assertNull($invoice->last_recurring_date);
    }

    public function test_process_skips_invoice_when_client_is_inactive(): void
    {
        $this->client->update(['status' => 'inactive']);
        $invoice = $this->makeDueRecurringInvoice();

        Artisan::call('invoices:process-recurring');
        $output = Artisan::output();

        $this->assertStringContainsString('Skipped recurring invoice', $output);
        $this->assertStringContainsString("client account status is 'inactive'", $output);
        $this->assertDatabaseMissing('invoices', ['parent_invoice_id' => $invoice->id]);

        $invoice->refresh();
        $this->assertNull($invoice->last_recurring_date);
    }
}
