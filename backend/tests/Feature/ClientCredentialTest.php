<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use App\Models\ClientCredential;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClientCredentialTest extends TestCase
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
            'email' => 'staff-employee@creativals.com',
            'status' => 'active'
        ]);
        $this->employee->assignRole('employee');
    }

    /**
     * Test that non-founder role is blocked.
     */
    public function test_non_founder_cannot_access_vault(): void
    {
        $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/credentials')
            ->assertStatus(403);

        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/credentials', [
                'client_name' => 'Apex Solutions',
                'platform' => 'WordPress Admin',
                'credential_type' => 'Website',
                'username' => 'admin',
                'password' => 'secret123'
            ])
            ->assertStatus(403);
    }

    /**
     * Test that founder can create, read, and search credentials.
     */
    public function test_founder_can_manage_credentials(): void
    {
        // 1. Create
        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/credentials', [
                'client_name' => 'Apex Solutions',
                'platform' => 'WordPress Admin',
                'credential_type' => 'Website',
                'username' => 'admin_apex',
                'password' => 'supersecretpass123',
                'login_url' => 'https://apex.com/wp-admin',
                'tags' => 'Production,WordPress',
                'is_favorite' => true
            ])
            ->assertStatus(201);

        $createdId = $response->json('data.id');
        $this->assertNotNull($createdId);

        // Verify database encryption (the raw DB column should not be plain text)
        $rawDbPassword = \Illuminate\Support\Facades\DB::table('client_credentials')
            ->where('id', $createdId)
            ->value('password');
        $this->assertNotEquals('supersecretpass123', $rawDbPassword);

        // 2. Index listing
        $listResponse = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/credentials')
            ->assertStatus(200);

        $listResponse->assertJsonStructure([
            'data', 'meta', 'stats', 'filters'
        ]);
        $this->assertCount(1, $listResponse->json('data'));
        $this->assertEquals('supersecretpass123', $listResponse->json('data.0.password'), 'Transparent decryption must occur in JSON response');

        // 3. Search
        $searchResponse = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/credentials?search=WordPress')
            ->assertStatus(200);
        $this->assertCount(1, $searchResponse->json('data'));

        $searchResponseNoMatch = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/credentials?search=Globotech')
            ->assertStatus(200);
        $this->assertCount(0, $searchResponseNoMatch->json('data'));

        // 4. Show individual
        $this->actingAs($this->founder, 'sanctum')
            ->getJson("/api/v1/credentials/{$createdId}")
            ->assertStatus(200)
            ->assertJsonPath('data.username', 'admin_apex');

        // 5. Update
        $this->actingAs($this->founder, 'sanctum')
            ->putJson("/api/v1/credentials/{$createdId}", [
                'username' => 'admin_apex_updated',
                'is_favorite' => false
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.username', 'admin_apex_updated')
            ->assertJsonPath('data.is_favorite', false);

        // 6. Duplicate
        $dupResponse = $this->actingAs($this->founder, 'sanctum')
            ->postJson("/api/v1/credentials/{$createdId}/duplicate")
            ->assertStatus(201);
        $this->assertEquals('Apex Solutions (Copy)', $dupResponse->json('data.client_name'));

        // 7. Log usage
        $this->actingAs($this->founder, 'sanctum')
            ->postJson("/api/v1/credentials/{$createdId}/log-usage")
            ->assertStatus(200);
        
        $this->assertNotNull(ClientCredential::find($createdId)->last_used_at);

        // 8. Delete
        $this->actingAs($this->founder, 'sanctum')
            ->deleteJson("/api/v1/credentials/{$createdId}")
            ->assertStatus(200);

        $this->assertSoftDeleted('client_credentials', ['id' => $createdId]);
    }

    /**
     * Test bulk actions.
     */
    public function test_bulk_actions(): void
    {
        $cred1 = ClientCredential::create([
            'client_name' => 'Client A',
            'platform' => 'WordPress',
            'credential_type' => 'Website',
            'username' => 'admin1',
            'password' => 'pass1'
        ]);

        $cred2 = ClientCredential::create([
            'client_name' => 'Client B',
            'platform' => 'Shopify',
            'credential_type' => 'E-commerce',
            'username' => 'admin2',
            'password' => 'pass2'
        ]);

        // Bulk Archive
        $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/credentials/bulk-archive', [
                'ids' => [$cred1->id, $cred2->id]
            ])
            ->assertStatus(200);

        $this->assertTrue(ClientCredential::find($cred1->id)->is_archived);
        $this->assertTrue(ClientCredential::find($cred2->id)->is_archived);

        // Bulk Delete
        $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/credentials/bulk-delete', [
                'ids' => [$cred1->id, $cred2->id]
            ])
            ->assertStatus(200);

        $this->assertSoftDeleted('client_credentials', ['id' => $cred1->id]);
        $this->assertSoftDeleted('client_credentials', ['id' => $cred2->id]);
    }

    /**
     * Test bulk import.
     */
    public function test_bulk_import(): void
    {
        $payload = [
            'credentials' => [
                [
                    'client_name' => 'Import Client A',
                    'platform' => 'Meta Ads',
                    'credential_type' => 'Advertising',
                    'username' => 'meta_user',
                    'password' => 'secret123',
                    'login_url' => 'https://business.facebook.com',
                    'tags' => 'Imported,Live'
                ],
                [
                    'client_name' => 'Import Client B',
                    'platform' => 'Stripe Merchant',
                    'credential_type' => 'Payment',
                    'username' => 'stripe_user',
                    'password' => 'pass456',
                    'tags' => 'Imported,Billing'
                ]
            ]
        ];

        $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/credentials/import', $payload)
            ->assertStatus(200);

        $this->assertDatabaseHas('client_credentials', [
            'client_name' => 'Import Client A',
            'platform' => 'Meta Ads'
        ]);
        
        $this->assertDatabaseHas('client_credentials', [
            'client_name' => 'Import Client B',
            'platform' => 'Stripe Merchant'
        ]);
    }

    /**
     * Test tab quick filters.
     */
    public function test_tab_filters(): void
    {
        ClientCredential::create([
            'client_name' => 'Test Client',
            'platform' => 'WordPress Site',
            'credential_type' => 'Website',
            'username' => 'wpuser',
            'password' => 'wppass'
        ]);

        $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/credentials?tab=wordpress')
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');
            
        $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/credentials?tab=shopify')
            ->assertStatus(200)
            ->assertJsonCount(0, 'data');
    }
}
