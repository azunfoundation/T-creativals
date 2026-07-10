<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use App\Models\Currency;
use App\Models\CompensationType;
use App\Models\EmployeeCompensation;
use App\Models\Bonus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Sprint11PayrollSetupTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $director;
    private User $hr;
    private User $financeUser;
    private User $employee;
    private Currency $inr;
    private CompensationType $fixedType;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $this->founder = User::where('email', 'founder@creativals.com')->first();
        $this->director = User::where('email', 'director@creativals.com')->first();
        $this->employee = User::where('email', 'dev@creativals.com')->first();
        $this->inr = Currency::where('code', 'INR')->first() ?? Currency::first();
        $this->fixedType = CompensationType::where('type', 'fixed')->first();

        $this->hr = User::factory()->create(['status' => 'active', 'is_client_portal_user' => false]);
        $this->hr->assignRole('hr');

        $this->financeUser = User::factory()->create(['status' => 'active', 'is_client_portal_user' => false]);
        $this->financeUser->assignRole('finance');
    }

    /**
     * hr previously had full payroll access via a hasRole('hr') check that
     * RolesPermissionsSeeder never backed with a payroll.* permission grant.
     * PayrollPolicy is now permission-based, so hr is correctly excluded.
     */
    public function test_hr_can_no_longer_view_payroll_runs(): void
    {
        $this->actingAs($this->hr, 'sanctum');
        $this->getJson('/api/v1/payroll/runs')->assertStatus(403);
    }

    public function test_finance_can_set_up_and_correct_employee_compensation(): void
    {
        $this->actingAs($this->financeUser, 'sanctum');

        $response = $this->postJson('/api/v1/employee-compensations', [
            'user_id' => $this->employee->id,
            'compensation_type_id' => $this->fixedType->id,
            'base_amount' => 100000,
            'currency_id' => $this->inr->id,
            'expected_monthly_hours' => 160,
            'tds_percent' => 10,
            'effective_from' => '2026-01-01',
        ]);
        $response->assertStatus(201);
        $firstId = $response->json('id');

        $this->assertDatabaseHas('employee_compensations', [
            'id' => $firstId,
            'user_id' => $this->employee->id,
            'is_current' => true,
        ]);

        // A raise: creating a new record closes out the old one instead of duplicating "current" rows.
        $second = $this->postJson('/api/v1/employee-compensations', [
            'user_id' => $this->employee->id,
            'compensation_type_id' => $this->fixedType->id,
            'base_amount' => 120000,
            'currency_id' => $this->inr->id,
            'expected_monthly_hours' => 160,
            'tds_percent' => 10,
            'effective_from' => '2026-07-01',
        ]);
        $second->assertStatus(201);

        $this->assertDatabaseHas('employee_compensations', [
            'id' => $firstId,
            'is_current' => false,
            'effective_until' => '2026-07-01',
        ]);
        $this->assertDatabaseHas('employee_compensations', [
            'id' => $second->json('id'),
            'base_amount' => 120000,
            'is_current' => true,
        ]);

        // In-place correction of a typo does not affect is_current.
        $this->putJson("/api/v1/employee-compensations/{$firstId}", ['base_amount' => 99000])
            ->assertStatus(200);
        $this->assertDatabaseHas('employee_compensations', [
            'id' => $firstId,
            'base_amount' => 99000,
            'is_current' => false,
        ]);
    }

    public function test_employee_cannot_manage_compensation(): void
    {
        $this->actingAs($this->employee, 'sanctum');
        $this->postJson('/api/v1/employee-compensations', [
            'user_id' => $this->employee->id,
            'compensation_type_id' => $this->fixedType->id,
            'base_amount' => 999999,
            'currency_id' => $this->inr->id,
            'effective_from' => '2026-01-01',
        ])->assertStatus(403);
    }

    public function test_bonus_create_approve_reject_workflow(): void
    {
        $this->actingAs($this->financeUser, 'sanctum');

        $create = $this->postJson('/api/v1/bonuses', [
            'user_id' => $this->employee->id,
            'amount' => 5000,
            'type' => 'performance',
            'reason' => 'Great quarter',
            'effective_date' => '2026-06-15',
        ]);
        $create->assertStatus(201);
        $bonusId = $create->json('id');
        $this->assertDatabaseHas('bonuses', ['id' => $bonusId, 'status' => 'pending']);

        // Employee cannot approve their own bonus.
        $this->actingAs($this->employee, 'sanctum');
        $this->postJson("/api/v1/bonuses/{$bonusId}/approve")->assertStatus(403);

        $this->actingAs($this->financeUser, 'sanctum');
        $this->postJson("/api/v1/bonuses/{$bonusId}/approve")->assertStatus(200);
        $this->assertDatabaseHas('bonuses', [
            'id' => $bonusId,
            'status' => 'approved',
            'approved_by' => $this->financeUser->id,
        ]);

        // Already-approved bonus cannot be re-approved or rejected.
        $this->postJson("/api/v1/bonuses/{$bonusId}/approve")->assertStatus(422);
        $this->postJson("/api/v1/bonuses/{$bonusId}/reject")->assertStatus(422);
    }

    public function test_approved_bonus_carries_a_reason_into_the_next_payroll_run_breakdown(): void
    {
        EmployeeCompensation::create([
            'user_id' => $this->employee->id,
            'compensation_type_id' => $this->fixedType->id,
            'base_amount' => 100000,
            'currency_id' => $this->inr->id,
            'expected_monthly_hours' => 160,
            'hourly_rate' => 0,
            'effective_from' => '2026-01-01',
            'is_current' => true,
        ]);

        Bonus::create([
            'user_id' => $this->employee->id,
            'amount' => 5000,
            'currency_id' => $this->inr->id,
            'type' => 'performance',
            'reason' => 'Great quarter',
            'effective_date' => '2026-09-10',
            'status' => 'approved',
        ]);

        $this->actingAs($this->founder, 'sanctum');
        $response = $this->postJson('/api/v1/payroll/runs', ['year' => 2026, 'month' => 9]);
        $response->assertStatus(201);

        $item = $response->json('items');
        $devItem = collect($item)->firstWhere('user_id', $this->employee->id);

        $this->assertNotNull($devItem);
        $this->assertSame(5000.0, (float) $devItem['bonus_amount']);
        $this->assertNotEmpty($devItem['breakdown']['bonuses']);
        $this->assertSame('Great quarter', $devItem['breakdown']['bonuses'][0]['reason']);
    }
}
