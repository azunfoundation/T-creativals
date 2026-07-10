<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;
use Tests\TestCase;
use App\Models\User;
use App\Models\Invoice;
use App\Models\Currency;
use App\Models\CreditNote;
use App\Models\InvoiceItem;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use App\Mail\InvoiceMail;
use Illuminate\Support\Carbon;

class Sprint9InvoiceFeaturesTest extends TestCase
{
    use RefreshDatabase;

    protected $founder;

    protected function setUp(): void
    {
        parent::setUp();
        
        \Spatie\Permission\Models\Role::create(['name' => 'founder']);
        \Spatie\Permission\Models\Role::create(['name' => 'client']);
        
        $this->founder = User::factory()->create();
        $this->founder->assignRole('founder');
    }

    public function test_can_create_credit_note()
    {
        $currency = Currency::create(['code' => 'USD', 'name' => 'US Dollar', 'symbol' => '$', 'exchange_rate' => 1]);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-001',
            'client_id' => $this->founder->id,
            'created_by' => $this->founder->id,
            'title' => 'Test',
            'currency_id' => $currency->id,
            'subtotal' => 100,
            'total_amount' => 100,
            'issue_date' => now(),
            'due_date' => now()->addDays(7),
            'status' => 'paid',
            'paid_amount' => 100,
            'due_amount' => 0,
        ]);

        $response = $this->actingAs($this->founder)->postJson('/api/v1/credit-notes', [
            'invoice_id' => $invoice->id,
            'amount' => 50,
            'reason' => 'Refund',
            'issue_date' => now()->format('Y-m-d'),
        ]);

        $response->assertStatus(201)
                 ->assertJsonPath('amount', '50.00')
                 ->assertJsonPath('reason', 'Refund');

        $this->assertDatabaseHas('credit_notes', [
            'invoice_id' => $invoice->id,
            'amount' => 50.00,
        ]);
    }

    public function test_credit_note_amount_cannot_exceed_invoice_total()
    {
        $currency = Currency::create(['code' => 'USD', 'name' => 'US Dollar', 'symbol' => '$', 'exchange_rate' => 1]);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-002',
            'client_id' => $this->founder->id,
            'created_by' => $this->founder->id,
            'title' => 'Test 2',
            'currency_id' => $currency->id,
            'subtotal' => 100,
            'total_amount' => 100,
            'issue_date' => now(),
            'due_date' => now()->addDays(7),
            'status' => 'paid',
            'paid_amount' => 100,
            'due_amount' => 0,
        ]);

        $response = $this->actingAs($this->founder)->postJson('/api/v1/credit-notes', [
            'invoice_id' => $invoice->id,
            'amount' => 150,
            'reason' => 'Refund',
            'issue_date' => now()->format('Y-m-d'),
        ]);

        $response->assertStatus(422)
                 ->assertJsonPath('message', 'Credit note amount cannot exceed invoice total amount.');
    }

    public function test_process_recurring_invoices_command()
    {
        $currency = Currency::create(['code' => 'USD', 'name' => 'US Dollar', 'symbol' => '$', 'exchange_rate' => 1]);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-REC-01',
            'client_id' => $this->founder->id,
            'created_by' => $this->founder->id,
            'title' => 'Hosting',
            'currency_id' => $currency->id,
            'subtotal' => 100,
            'total_amount' => 100,
            'issue_date' => Carbon::today()->subMonth(),
            'due_date' => Carbon::today()->subMonth()->addDays(7),
            'status' => 'paid',
            'paid_amount' => 100,
            'due_amount' => 0,
            'is_recurring' => true,
            'recurring_interval' => 'monthly',
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'description' => 'Hosting Plan',
            'quantity' => 1,
            'unit_price' => 100,
            'total_amount' => 100,
        ]);

        Artisan::call('invoices:process-recurring');

        $this->assertDatabaseHas('invoices', [
            'parent_invoice_id' => $invoice->id,
            'title' => 'Hosting',
            'is_recurring' => false,
            'status' => 'draft',
        ]);

        $child = Invoice::where('parent_invoice_id', $invoice->id)->first();
        $this->assertEquals(Carbon::today()->format('Y-m-d'), $child->issue_date->format('Y-m-d'));
        $this->assertCount(1, $child->items);
    }

    public function test_download_invoice_pdf()
    {
        $currency = Currency::create(['code' => 'USD', 'name' => 'US Dollar', 'symbol' => '$', 'exchange_rate' => 1]);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-PDF-01',
            'client_id' => $this->founder->id,
            'created_by' => $this->founder->id,
            'title' => 'Test PDF',
            'currency_id' => $currency->id,
            'subtotal' => 100,
            'total_amount' => 100,
            'issue_date' => now(),
            'due_date' => now()->addDays(7),
            'status' => 'draft',
            'paid_amount' => 0,
            'due_amount' => 100,
        ]);

        $response = $this->actingAs($this->founder)->getJson("/api/v1/invoices/{$invoice->id}/download-pdf");

        $response->assertStatus(200);
        $this->assertEquals('application/pdf', $response->headers->get('Content-Type'));
    }

    public function test_send_invoice_email_with_pdf()
    {
        Mail::fake();

        $client = User::factory()->create(['email' => 'client@example.com']);
        $client->assignRole('client');

        $currency = Currency::create(['code' => 'USD', 'name' => 'US Dollar', 'symbol' => '$', 'exchange_rate' => 1]);
        $invoice = Invoice::create([
            'invoice_number' => 'INV-MAIL-01',
            'client_id' => $client->id,
            'created_by' => $this->founder->id,
            'title' => 'Test Mail',
            'currency_id' => $currency->id,
            'subtotal' => 100,
            'total_amount' => 100,
            'issue_date' => now(),
            'due_date' => now()->addDays(7),
            'status' => 'draft',
            'paid_amount' => 0,
            'due_amount' => 100,
        ]);

        $response = $this->actingAs($this->founder)->postJson("/api/v1/invoices/{$invoice->id}/send");

        $response->assertStatus(200);

        Mail::assertSent(InvoiceMail::class, function ($mail) use ($client) {
            return $mail->hasTo('client@example.com');
        });
    }
}
