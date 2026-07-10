<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Quote;
use App\Models\User;
use App\Models\Currency;
use App\Mail\WelcomeUserMail;
use App\Mail\InvoiceMail;
use App\Mail\QuoteMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class Sprint9NotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        
        $this->employee = User::factory()->create([
            'email' => 'dev_test@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => false
        ]);
        $this->employee->assignRole('employee');
    }

    public function test_get_notification_preferences(): void
    {
        $response = $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/settings/notifications')
            ->assertStatus(200)
            ->assertJsonStructure(['data']);
    }

    public function test_update_notification_preferences(): void
    {
        $data = [
            'preferences' => [
                [
                    'event_type' => 'task_assigned',
                    'in_app' => true,
                    'email' => true,
                    'push' => false,
                ],
                [
                    'event_type' => 'lead_assigned',
                    'in_app' => false,
                    'email' => true,
                    'push' => true,
                ]
            ]
        ];

        $response = $this->actingAs($this->employee, 'sanctum')
            ->putJson('/api/v1/settings/notifications', $data)
            ->assertStatus(200);

        $this->assertDatabaseHas('notification_preferences', [
            'user_id' => $this->employee->id,
            'event_type' => 'task_assigned',
            'email' => true,
        ]);
    }

    public function test_welcome_email_sent_on_user_creation(): void
    {
        Mail::fake();

        $userData = [
            'name' => 'John Doe Welcome',
            'email' => 'johndoe_welcome@example.com',
            'password' => 'password123',
            'status' => 'active',
        ];

        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/users', $userData)
            ->assertStatus(201);

        // WelcomeUserMail is dispatched via ->queue(), not ->send() (see UserController::store),
        // so it lands in Mail::fake()'s queued mailables, not its sent ones.
        Mail::assertQueued(WelcomeUserMail::class, function ($mail) use ($userData) {
            return $mail->hasTo($userData['email']) && $mail->rawPassword === $userData['password'];
        });
    }

    public function test_send_invoice_email(): void
    {
        Mail::fake();

        $client = User::factory()->create(['email' => 'client_invoice_mail@test.com', 'status' => 'active']);
        $client->assignRole('client');

        $currency = Currency::where('is_default', true)->first() ?? Currency::first();

        $invoice = Invoice::create([
            'client_id' => $client->id,
            'created_by' => $this->founder->id,
            'title' => 'Invoice Proposal Test',
            'currency_id' => $currency->id,
            'subtotal' => 100.00,
            'discount_amount' => 0.00,
            'tax_amount' => 18.00,
            'total_amount' => 118.00,
            'status' => 'draft',
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(30)->toDateString(),
        ]);

        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson("/api/v1/invoices/{$invoice->id}/send")
            ->assertStatus(200);

        Mail::assertSent(InvoiceMail::class, function ($mail) use ($client) {
            return $mail->hasTo($client->email);
        });
    }

    public function test_send_quote_email(): void
    {
        Mail::fake();

        $client = User::factory()->create(['email' => 'client_quote_mail@test.com', 'status' => 'active']);
        $client->assignRole('client');

        $currency = Currency::where('is_default', true)->first() ?? Currency::first();

        $quote = Quote::create([
            'client_id' => $client->id,
            'created_by' => $this->founder->id,
            'title' => 'Quote Proposal Test',
            'currency_id' => $currency->id,
            'subtotal' => 100.00,
            'discount_amount' => 0.00,
            'tax_amount' => 18.00,
            'total_amount' => 118.00,
            'status' => 'draft',
        ]);

        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson("/api/v1/quotes/{$quote->id}/send")
            ->assertStatus(200);

        Mail::assertSent(QuoteMail::class, function ($mail) use ($client) {
            return $mail->hasTo($client->email);
        });
    }
}
