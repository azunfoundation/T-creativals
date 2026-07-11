<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Currency;
use App\Models\Package;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Services & Packages module (Sprint 15) — regression coverage for real
 * package discount persistence (previously only the final price was stored
 * and the UI fabricated discount_type: 'fixed' on every reload) and the
 * services.manage authorization boundary.
 */
class Sprint15ServicesPackagesTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $employee;
    private Currency $inr;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        $this->inr = Currency::where('code', 'INR')->first();

        $this->employee = User::factory()->create(['email' => 'pkg-employee@creativals.com', 'status' => 'active']);
        $this->employee->assignRole('employee');
    }

    public function test_percentage_discount_survives_a_reload(): void
    {
        $serviceIds = Service::query()->limit(2)->pluck('id')->all();
        $this->assertNotEmpty($serviceIds, 'seeded services expected');

        $create = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/packages', [
                'name' => 'Growth Bundle (15% off)',
                'price' => 85000,
                'discount_type' => 'percentage',
                'discount_value' => 15,
                'currency_id' => $this->inr->id,
                'billing_cycle' => 'one_time',
                'services' => array_map(fn ($id) => ['service_id' => $id], $serviceIds),
            ])
            ->assertStatus(201)
            ->json();

        $packageId = $create['data']['id'] ?? $create['id'];

        // The reload — this is exactly what used to come back as
        // discount_type 'fixed' regardless of what was saved.
        $show = $this->actingAs($this->founder, 'sanctum')
            ->getJson("/api/v1/packages/{$packageId}")
            ->assertStatus(200)
            ->json();
        $pkg = $show['data'] ?? $show;

        $this->assertSame('percentage', $pkg['discount_type']);
        $this->assertSame(15.0, (float) $pkg['discount_value']);
        $this->assertSame(85000.0, (float) $pkg['price']);

        // Switching to a fixed discount persists too
        $this->actingAs($this->founder, 'sanctum')
            ->putJson("/api/v1/packages/{$packageId}", [
                'price' => 90000,
                'discount_type' => 'fixed',
                'discount_value' => 10000,
            ])
            ->assertStatus(200);
        $updated = Package::find($packageId);
        $this->assertSame('fixed', $updated->discount_type);
        $this->assertSame(10000.0, (float) $updated->discount_value);
    }

    public function test_legacy_packages_without_discount_fields_still_serve(): void
    {
        // A pre-migration row: only price, no discount metadata.
        $legacy = Package::create([
            'name' => 'Legacy Bundle',
            'slug' => 'legacy-bundle',
            'price' => 42000,
            'currency_id' => $this->inr->id,
            'billing_cycle' => 'one_time',
            'is_active' => true,
        ]);

        $show = $this->actingAs($this->founder, 'sanctum')
            ->getJson("/api/v1/packages/{$legacy->id}")
            ->assertStatus(200)
            ->json();
        $pkg = $show['data'] ?? $show;

        $this->assertNull($pkg['discount_type']);
        $this->assertSame(42000.0, (float) $pkg['price']);
    }

    public function test_invalid_discount_type_is_rejected(): void
    {
        $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/packages', [
                'name' => 'Bad Discount Bundle',
                'price' => 1000,
                'discount_type' => 'bogus',
                'discount_value' => 5,
                'currency_id' => $this->inr->id,
                'billing_cycle' => 'one_time',
            ])
            ->assertStatus(422);
    }

    public function test_package_management_requires_services_manage(): void
    {
        // employee holds no services.* permission at all → can't even view
        $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/packages')
            ->assertStatus(403);

        // sales_exec holds services.view → can browse the catalog but not manage it
        $salesExec = User::factory()->create(['email' => 'pkg-salesexec@creativals.com', 'status' => 'active']);
        $salesExec->assignRole('sales_exec');
        $this->actingAs($salesExec, 'sanctum')
            ->getJson('/api/v1/packages')
            ->assertStatus(200);
        $this->actingAs($salesExec, 'sanctum')
            ->postJson('/api/v1/packages', [
                'name' => 'Nope Bundle',
                'price' => 1,
                'currency_id' => $this->inr->id,
                'billing_cycle' => 'one_time',
            ])
            ->assertStatus(403);
    }
}
