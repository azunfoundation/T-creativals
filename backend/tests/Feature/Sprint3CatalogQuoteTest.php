<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Alert;
use App\Models\Currency;
use App\Models\DiscountCoupon;
use App\Models\Lead;
use App\Models\Package;
use App\Models\Quote;
use App\Models\QuoteApproval;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Sprint3CatalogQuoteTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $salesHead;
    private User $salesExec;
    private Currency $currency;

    protected function setUp(): void
    {
        parent::setUp();

        // Run migrations and seed roles/permissions, departments, number sequences, etc.
        $this->seed();

        // Retrieve seeded users
        $this->founder = User::where('email', 'founder@creativals.com')->first();
        $this->salesHead = User::where('email', 'sales@creativals.com')->first();

        // Create a Sales Exec
        $this->salesExec = User::factory()->create([
            'email' => 'exec@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => false,
        ]);
        $this->salesExec->assignRole('sales_exec');

        $this->currency = Currency::where('code', 'INR')->first() ?? Currency::first();
    }

    /**
     * Test Service Category CRUD.
     */
    public function test_service_categories_crud(): void
    {
        // 1. Index (Authorized for Founder/Sales Exec)
        $this->actingAs($this->salesExec, 'sanctum');
        $response = $this->getJson('/api/v1/service-categories');
        $response->assertStatus(200)
            ->assertJsonStructure(['data' => [['id', 'name', 'slug', 'color', 'sort_order', 'is_active']]]);

        // 2. Store (Unauthorized for sales exec)
        $response = $this->postJson('/api/v1/service-categories', [
            'name' => 'New Tech Category',
            'color' => '#123456',
        ]);
        $response->assertStatus(403);

        // Store (Authorized for founder)
        $this->actingAs($this->founder, 'sanctum');
        $response = $this->postJson('/api/v1/service-categories', [
            'name' => 'New Tech Category',
            'color' => '#123456',
        ]);
        $response->assertStatus(201)
            ->assertJsonFragment(['name' => 'New Tech Category', 'slug' => 'new-tech-category']);

        $catId = $response->json('data.id');

        // 3. Update (Authorized for founder)
        $response = $this->putJson("/api/v1/service-categories/{$catId}", [
            'name' => 'Updated Tech Category',
        ]);
        $response->assertStatus(200)
            ->assertJsonFragment(['name' => 'Updated Tech Category', 'slug' => 'updated-tech-category']);

        // 4. Destroy (Authorized for founder)
        $response = $this->deleteJson("/api/v1/service-categories/{$catId}");
        $response->assertStatus(200);

        $this->assertSoftDeleted('service_categories', ['id' => $catId]);
    }

    /**
     * Test Service CRUD.
     */
    public function test_services_crud(): void
    {
        $category = ServiceCategory::first();

        // 1. Index
        $this->actingAs($this->salesExec, 'sanctum');
        $response = $this->getJson('/api/v1/services');
        $response->assertStatus(200)
            ->assertJsonStructure(['data' => [['id', 'name', 'slug', 'default_price', 'billing_type', 'currency']]]);

        // 2. Store (Unauthorized for sales exec)
        $response = $this->postJson('/api/v1/services', [
            'name' => 'Super Development',
            'default_price' => 5000,
            'currency_id' => $this->currency->id,
            'billing_type' => 'fixed',
        ]);
        $response->assertStatus(403);

        // Store (Authorized for founder)
        $this->actingAs($this->founder, 'sanctum');
        $response = $this->postJson('/api/v1/services', [
            'category_id' => $category->id,
            'name' => 'Super Development',
            'default_price' => 5000.00,
            'currency_id' => $this->currency->id,
            'billing_type' => 'fixed',
            'unit' => 'project',
            'is_active' => true,
        ]);
        $response->assertStatus(201)
            ->assertJsonFragment(['name' => 'Super Development', 'default_price' => '5000.00']);

        $srvId = $response->json('data.id');

        // 3. Update
        $response = $this->putJson("/api/v1/services/{$srvId}", [
            'name' => 'Super Duper Development',
            'default_price' => 6000.00,
        ]);
        $response->assertStatus(200)
            ->assertJsonFragment(['name' => 'Super Duper Development', 'default_price' => '6000.00']);

        // 4. Destroy
        $response = $this->deleteJson("/api/v1/services/{$srvId}");
        $response->assertStatus(200);

        $this->assertSoftDeleted('services', ['id' => $srvId]);
    }

    /**
     * Test Package CRUD.
     */
    public function test_packages_crud(): void
    {
        $services = Service::limit(2)->get();

        // 1. Index
        $this->actingAs($this->salesExec, 'sanctum');
        $response = $this->getJson('/api/v1/packages');
        $response->assertStatus(200);

        // 2. Store (Authorized for founder)
        $this->actingAs($this->founder, 'sanctum');
        $response = $this->postJson('/api/v1/packages', [
            'name' => 'Growth Plan',
            'price' => 45000.00,
            'currency_id' => $this->currency->id,
            'billing_cycle' => 'monthly',
            'services' => [
                [
                    'service_id' => $services[0]->id,
                    'custom_price' => 20000.00,
                    'quantity' => 1,
                    'description' => 'Growth service 1',
                ],
                [
                    'service_id' => $services[1]->id,
                    'custom_price' => 25000.00,
                    'quantity' => 2,
                    'description' => 'Growth service 2',
                ]
            ]
        ]);

        $response->assertStatus(201)
            ->assertJsonFragment(['name' => 'Growth Plan', 'price' => '45000.00']);

        $pkgId = $response->json('data.id');

        // Verify pivots
        $this->assertDatabaseHas('package_services', [
            'package_id' => $pkgId,
            'service_id' => $services[0]->id,
            'custom_price' => 20000.00,
        ]);

        // 3. Update
        $response = $this->putJson("/api/v1/packages/{$pkgId}", [
            'name' => 'Updated Growth Plan',
            'price' => 50000.00,
        ]);
        $response->assertStatus(200)
            ->assertJsonFragment(['name' => 'Updated Growth Plan', 'price' => '50000.00']);

        // 4. Destroy
        $response = $this->deleteJson("/api/v1/packages/{$pkgId}");
        $response->assertStatus(200);

        $this->assertSoftDeleted('packages', ['id' => $pkgId]);
    }

    /**
     * Test Discount Coupon validations.
     */
    public function test_coupon_validation(): void
    {
        $this->actingAs($this->salesExec, 'sanctum');

        // Validate FLAT5000 coupon
        // FLAT5000 has value 5000, minimum_amount 20000.
        // Validating with amount 25,000 should pass.
        $response = $this->getJson('/api/v1/discount-coupons/FLAT5000/validate?amount=25000');
        $response->assertStatus(200)
            ->assertJsonFragment(['valid' => true, 'discount_amount' => 5000.00]);

        // Validating with amount 15,000 should fail (does not meet minimum amount requirement).
        $response = $this->getJson('/api/v1/discount-coupons/FLAT5000/validate?amount=15000');
        $response->assertStatus(200)
            ->assertJsonFragment(['valid' => false]);
    }

    /**
     * Test Quote Creation and automatic totals computation (including item calculations and coupon application).
     */
    public function test_quote_creation_and_recalculations(): void
    {
        $this->actingAs($this->salesExec, 'sanctum');

        $lead = Lead::first();
        $service1 = Service::first();

        // 1. Create quote
        // Item: Qty 2, Unit Price 15,000, Discount 10%, Tax 18%
        // Subtotal = 2 * 15,000 = 30,000
        // Item level discount = 30,000 * 10% = 3,000
        // Item level taxable = 27,000
        // Item level tax = 27,000 * 18% = 4,860
        // Coupon discount: Applying FLAT5000 (valid for subtotal - items_discount = 27,000 >= 20,000 minimum). Coupon discount = 5,000.
        // Total discount = 3,000 + 5,000 = 8,000
        // Total tax = 4,860
        // Total amount = 30,000 - 8,000 + 4,860 = 26,860
        $response = $this->postJson('/api/v1/quotes', [
            'lead_id' => $lead->id,
            'title' => 'E-Commerce Proposal',
            'currency_id' => $this->currency->id,
            'coupon_code' => 'FLAT5000',
            'valid_until' => now()->addDays(30)->toDateString(),
            'items' => [
                [
                    'service_id' => $service1->id,
                    'description' => 'E-Commerce development phase 1',
                    'quantity' => 2,
                    'unit' => 'project',
                    'unit_price' => 15000.00,
                    'discount_percent' => 10.00,
                    'tax_rate' => 18.00,
                ]
            ]
        ]);

        $response->assertStatus(201)
            ->assertJsonFragment([
                'title' => 'E-Commerce Proposal',
                'subtotal' => '30000.00',
                'discount_amount' => '8000.00',
                'tax_amount' => '4860.00',
                'total_amount' => '26860.00',
                'coupon_discount' => '5000.00',
            ]);

        $quoteId = $response->json('data.id');

        // Check DB
        $this->assertDatabaseHas('quotes', [
            'id' => $quoteId,
            'status' => 'draft',
            'total_amount' => 26860.00,
        ]);
    }

    /**
     * Test Quote Approval Flow: Submit -> Approve -> Reject.
     */
    public function test_quote_approval_flow(): void
    {
        // 1. Create Quote as Sales Exec
        $this->actingAs($this->salesExec, 'sanctum');
        $quote = Quote::create([
            'quote_number' => 'QUO-TEST-9999',
            'title' => 'Test Proposal',
            'created_by' => $this->salesExec->id,
            'currency_id' => $this->currency->id,
            'subtotal' => 10000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 10000.00,
            'status' => 'draft',
        ]);

        // 2. Submit for Approval
        $response = $this->postJson("/api/v1/quotes/{$quote->id}/submit-approval");
        $response->assertStatus(200);

        $this->assertEquals('pending_approval', $quote->fresh()->status);
        $this->assertDatabaseHas('quote_approvals', [
            'quote_id' => $quote->id,
            'requested_by' => $this->salesExec->id,
            'status' => 'pending',
        ]);

        // Observer check: an alert should be created for Founder/Sales Head
        $this->assertDatabaseHas('alerts', [
            'type' => 'approval_requested',
            'title' => 'Quote Approval Requested',
        ]);

        // 3. Approve (as Sales Head)
        $this->actingAs($this->salesHead, 'sanctum');
        $response = $this->postJson("/api/v1/quotes/{$quote->id}/approve", [
            'comments' => 'Looks excellent. Approved!',
        ]);
        $response->assertStatus(200);

        $this->assertEquals('approved', $quote->fresh()->status);
        $this->assertDatabaseHas('quote_approvals', [
            'quote_id' => $quote->id,
            'status' => 'approved',
            'approver_id' => $this->salesHead->id,
        ]);

        // Observer check: alert triggered for creator
        $this->assertDatabaseHas('alerts', [
            'user_id' => $this->salesExec->id,
            'type' => 'approval_actioned',
            'title' => 'Quote Approved',
        ]);

        // 4. Reject Flow
        // Reset status to draft then submit again
        $quote->refresh();
        $quote->update(['status' => 'draft']);
        
        $this->actingAs($this->salesExec, 'sanctum');
        $this->postJson("/api/v1/quotes/{$quote->id}/submit-approval")->assertStatus(200);

        // Reject as Sales Head
        $this->actingAs($this->salesHead, 'sanctum');
        $response = $this->postJson("/api/v1/quotes/{$quote->id}/reject", [
            'comments' => 'Price is too low. Adjust margins.',
        ]);
        $response->assertStatus(200);

        $this->assertEquals('rejected', $quote->fresh()->status);
        $this->assertDatabaseHas('quote_approvals', [
            'quote_id' => $quote->id,
            'status' => 'rejected',
            'comments' => 'Price is too low. Adjust margins.',
        ]);

        // Observer check: alert triggered for creator mentioning the approver's name
        $this->assertDatabaseHas('alerts', [
            'user_id' => $this->salesExec->id,
            'type' => 'approval_actioned',
            'title' => 'Quote Rejected',
            'body' => "Quote {$quote->quote_number} was rejected by {$this->salesHead->name}.",
        ]);
    }

    /**
     * Test PDF download endpoint returns a PDF.
     */
    public function test_generate_pdf_endpoint(): void
    {
        $this->actingAs($this->salesExec, 'sanctum');

        $quote = Quote::create([
            'quote_number' => 'QUO-PDF-1111',
            'title' => 'PDF Demo Proposal',
            'created_by' => $this->salesExec->id,
            'currency_id' => $this->currency->id,
            'subtotal' => 10000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'total_amount' => 10000.00,
            'status' => 'draft',
        ]);

        $response = $this->get("/api/v1/quotes/{$quote->id}/download-pdf");
        $response->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
    }
}
