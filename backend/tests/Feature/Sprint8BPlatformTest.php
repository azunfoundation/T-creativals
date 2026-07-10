<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Currency;
use App\Models\NumberSequence;
use App\Models\Project;
use App\Models\Package;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class Sprint8BPlatformTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $director;
    private User $hr;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        // Seed database
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        $this->director = User::where('email', 'director@creativals.com')->first();

        $this->hr = User::where('email', 'hr@creativals.com')->first();
        if (!$this->hr) {
            $this->hr = User::factory()->create(['email' => 'hr@creativals.com', 'status' => 'active']);
            $this->hr->assignRole('hr');
        }

        $this->employee = User::where('email', 'dev@creativals.com')->first();
        if (!$this->employee) {
            $this->employee = User::factory()->create(['email' => 'dev@creativals.com', 'status' => 'active']);
            $this->employee->assignRole('employee');
        }
    }

    /**
     * Test general settings retrieval.
     */
    public function test_get_settings(): void
    {
        $response = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/settings')
            ->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'company' => [
                        'company_name',
                        'company_email',
                        'company_phone',
                        'company_address',
                        'timezone'
                    ],
                    'tax' => [
                        'default_tax_rate'
                    ],
                    'currencies',
                    'number_sequences'
                ],
                'message'
            ]);
    }

    /**
     * Test updating company profile.
     */
    public function test_update_company_settings(): void
    {
        $data = [
            'company_name' => 'Creativals Global LLC',
            'company_email' => 'operations@creativals.com',
            'company_phone' => '+91 11223 34455',
            'company_address' => 'Silicon Valley, Bangalore, India',
            'timezone' => 'UTC',
        ];

        $this->actingAs($this->founder, 'sanctum')
            ->putJson('/api/v1/settings/company', $data)
            ->assertStatus(200);

        $this->assertDatabaseHas('company_settings', [
            'key' => 'company_name',
            'value' => 'Creativals Global LLC'
        ]);
        $this->assertDatabaseHas('company_settings', [
            'key' => 'company_address',
            'value' => 'Silicon Valley, Bangalore, India'
        ]);
    }

    /**
     * Test updating tax settings.
     */
    public function test_update_tax_settings(): void
    {
        $this->actingAs($this->founder, 'sanctum')
            ->putJson('/api/v1/settings/tax', ['default_tax_rate' => 12.5])
            ->assertStatus(200);

        $this->assertDatabaseHas('company_settings', [
            'key' => 'default_tax_rate',
            'value' => '12.5'
        ]);
    }

    /**
     * Test updating number sequence formats.
     */
    public function test_update_number_sequences(): void
    {
        $sequences = NumberSequence::all()->toArray();
        if (empty($sequences)) {
            $sequences = [
                [
                    'entity_type' => 'invoice',
                    'prefix' => 'TXN',
                    'current_number' => 10,
                    'padding_length' => 5,
                    'format' => '{PREFIX}-{YEAR}-{NUMBER}'
                ]
            ];
        } else {
            $sequences[0]['prefix'] = 'TXN';
            $sequences[0]['current_number'] = 500;
        }

        $this->actingAs($this->founder, 'sanctum')
            ->putJson('/api/v1/settings/number-sequences', ['sequences' => $sequences])
            ->assertStatus(200);

        $this->assertDatabaseHas('number_sequences', [
            'prefix' => 'TXN',
            'current_number' => $sequences[0]['current_number']
        ]);
    }

    /**
     * Test updating currencies settings.
     */
    public function test_update_currencies(): void
    {
        // Ensure USD and INR exist
        Currency::updateOrCreate(['code' => 'INR'], ['name' => 'Rupee', 'symbol' => '₹', 'exchange_rate_to_inr' => 1.0000]);
        Currency::updateOrCreate(['code' => 'USD'], ['name' => 'US Dollar', 'symbol' => '$', 'exchange_rate_to_inr' => 83.5000]);

        $data = [
            'default_currency_code' => 'INR',
            'active_currency_codes' => ['INR', 'USD']
        ];

        $this->actingAs($this->founder, 'sanctum')
            ->putJson('/api/v1/settings/currencies', $data)
            ->assertStatus(200);

        $this->assertDatabaseHas('currencies', [
            'code' => 'INR',
            'is_default' => true,
            'is_active' => true
        ]);
        $this->assertDatabaseHas('currencies', [
            'code' => 'USD',
            'is_default' => false,
            'is_active' => true
        ]);
    }

    /**
     * Test retrieving and exporting audit logs.
     */
    public function test_audit_logs_endpoints(): void
    {
        // Generate an audit event by creating a project
        $client = User::factory()->create(['email' => 'client_audit@test.com', 'status' => 'active']);
        $client->assignRole('client');

        $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/projects', [
                'client_id' => $client->id,
                'name' => 'Audited Project Demo',
                'description' => 'Test project description',
                'start_date' => now()->toDateString(),
                'end_date' => now()->addDays(30)->toDateString(),
                'budget_hours' => 100,
                'budget' => 50000,
                'status' => 'planning',
                'completion_percentage' => 0,
            ])
            ->assertStatus(201);

        // Fetch logs with filter
        $response = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/audit-logs?event=created')
            ->assertStatus(200)
            ->assertJsonStructure([
                'data',
                'meta' => ['current_page', 'last_page', 'per_page', 'total']
            ]);

        // Verify CSV export streaming response
        $csvResponse = $this->actingAs($this->founder, 'sanctum')
            ->get('/api/v1/audit-logs?export=csv');

        $csvResponse->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
        $csvResponse->assertHeader('Content-Disposition', 'attachment; filename="audit_logs_report.csv"');
        $this->assertStringContainsString('Log ID', $csvResponse->streamedContent());
        $this->assertStringContainsString('App\\Models\\Project', $csvResponse->streamedContent());
        $this->assertStringContainsString('created', $csvResponse->streamedContent());
    }

    /**
     * Test database backup creation, listing, integrity check and restore.
     */
    public function test_backups_lifecycle(): void
    {
        // 1. Create a manual backup
        $response = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/backups');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => ['filename', 'size', 'created_at', 'status'],
                'message'
            ]);

        $filename = $response->json('data.filename');
        $this->assertNotNull($filename);
        $this->assertTrue(File::exists(storage_path('app/backups/' . $filename)));

        // 2. List backups
        $listResponse = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/backups')
            ->assertStatus(200);

        $this->assertNotEmpty($listResponse->json('data'));
        $this->assertEquals('valid', $listResponse->json('data.0.status'));

        // 3. Restore backup
        $restoreResponse = $this->actingAs($this->founder, 'sanctum')
            ->postJson("/api/v1/backups/{$filename}/restore")
            ->assertStatus(200);

        // 4. Delete backup
        $this->actingAs($this->founder, 'sanctum')
            ->deleteJson("/api/v1/backups/{$filename}")
            ->assertStatus(200);

        $this->assertFalse(File::exists(storage_path('app/backups/' . $filename)));
    }

    /**
     * Backups are viewable/creatable by founder and director (both hold
     * 'settings.manage'), but only founder (who alone holds 'recovery.restore')
     * may delete or restore one. A plain employee gets none of it.
     */
    public function test_backups_authorization_by_role(): void
    {
        $this->actingAs($this->director, 'sanctum')
            ->getJson('/api/v1/backups')
            ->assertStatus(200);

        $createResponse = $this->actingAs($this->director, 'sanctum')
            ->postJson('/api/v1/backups')
            ->assertStatus(200);
        $filename = $createResponse->json('data.filename');

        $this->actingAs($this->director, 'sanctum')
            ->postJson("/api/v1/backups/{$filename}/restore")
            ->assertStatus(403);

        $this->actingAs($this->director, 'sanctum')
            ->deleteJson("/api/v1/backups/{$filename}")
            ->assertStatus(403);

        $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/backups')
            ->assertStatus(403);

        $this->actingAs($this->employee, 'sanctum')
            ->postJson('/api/v1/backups')
            ->assertStatus(403);

        // Founder can still do everything, including cleaning up the file created above.
        $this->actingAs($this->founder, 'sanctum')
            ->deleteJson("/api/v1/backups/{$filename}")
            ->assertStatus(200);
    }

    /**
     * Audit logs are gated on the 'audit.view' permission (founder + director),
     * not a role name — this used to check a phantom 'hr_manager' role that was
     * never seeded, which incidentally also locked out founder/director's real
     * intended access whenever the hasAnyRole() call itself was misconfigured.
     */
    public function test_audit_logs_authorization_by_role(): void
    {
        $this->actingAs($this->director, 'sanctum')
            ->getJson('/api/v1/audit-logs')
            ->assertStatus(200);

        $this->actingAs($this->hr, 'sanctum')
            ->getJson('/api/v1/audit-logs')
            ->assertStatus(403);

        $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/audit-logs')
            ->assertStatus(403);
    }

    /**
     * Verify unique composite constraint on project_members.
     */
    public function test_project_members_composite_unique_constraint(): void
    {
        $client = User::factory()->create(['email' => 'client_unique@test.com', 'status' => 'active']);
        $client->assignRole('client');

        $project = Project::create([
            'client_id' => $client->id,
            'project_number' => 'PRJ-TEST-101',
            'name' => 'Test Project unique',
            'status' => 'active',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDays(30)->toDateString(),
            'budget_hours' => 100,
            'budget' => 50000,
            'completion_percentage' => 0,
        ]);
        $user = User::factory()->create();

        // First insertion should pass
        DB::table('project_members')->insert([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'role' => 'member',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Second duplicate insertion should fail throwing query exception
        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::table('project_members')->insert([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'role' => 'manager',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Verify unique composite constraint on package_services.
     */
    public function test_package_services_composite_unique_constraint(): void
    {
        $package = Package::create([
            'name' => 'Test Package unique',
            'slug' => 'test-package-unique',
            'discount_type' => 'percentage',
            'discount_value' => 10,
            'price' => 1000.00,
            'currency_id' => Currency::first()->id ?? 1,
            'billing_cycle' => 'monthly',
        ]);

        $category = \App\Models\ServiceCategory::create(['name' => 'Tech unique', 'slug' => 'tech-unique']);

        $service = Service::create([
            'category_id' => $category->id,
            'name' => 'Test Service unique',
            'slug' => 'test-service-unique',
            'default_price' => 1000.00,
            'currency_id' => Currency::first()->id ?? 1,
            'billing_type' => 'hourly',
            'unit' => 'hr',
            'tax_rate' => 18.00,
        ]);

        // First insertion should pass
        DB::table('package_services')->insert([
            'package_id' => $package->id,
            'service_id' => $service->id,
            'quantity' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Second duplicate insertion should fail throwing query exception
        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::table('package_services')->insert([
            'package_id' => $package->id,
            'service_id' => $service->id,
            'quantity' => 2,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
