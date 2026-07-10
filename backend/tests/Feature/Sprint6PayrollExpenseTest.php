<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use App\Models\Project;
use App\Models\Timesheet;
use App\Models\Bonus;
use App\Models\Currency;
use App\Models\CompensationType;
use App\Models\EmployeeCompensation;
use App\Models\ExpenseCategory;
use App\Models\Vendor;
use App\Models\Expense;
use App\Models\ExpenseAttachment;
use App\Models\PayrollRun;
use App\Models\PayrollRunItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Sprint6PayrollExpenseTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $director;
    private User $pm;
    private User $employee;
    private User $financeUser;
    private Currency $inr;

    protected function setUp(): void
    {
        parent::setUp();

        // Migrate and seed database
        $this->seed();

        // Retrieve seeded users
        $this->founder = User::where('email', 'founder@creativals.com')->first();
        $this->director = User::where('email', 'director@creativals.com')->first();
        
        $this->pm = User::where('email', 'pm@creativals.com')->first();
        if (!$this->pm) {
            $this->pm = User::factory()->create(['email' => 'pm@creativals.com', 'status' => 'active']);
            $this->pm->assignRole('project_manager');
        }

        $this->employee = User::where('email', 'dev@creativals.com')->first();
        
        // Create a dedicated finance user
        $this->financeUser = User::factory()->create([
            'email' => 'finance_test@creativals.com',
            'status' => 'active',
            'is_client_portal_user' => false
        ]);
        $this->financeUser->assignRole('finance');

        $this->inr = Currency::where('code', 'INR')->first() ?? Currency::first();
    }

    /**
     * Test getHourlyRateAttribute() on different compensation types.
     */
    public function test_hourly_rate_calculation_based_on_compensation_types(): void
    {
        $fixedType = CompensationType::where('type', 'fixed')->first();
        $hourlyType = CompensationType::where('type', 'hourly')->first();

        // 1. Hourly user
        $user1 = User::factory()->create(['status' => 'active']);
        EmployeeCompensation::create([
            'user_id' => $user1->id,
            'compensation_type_id' => $hourlyType->id,
            'base_amount' => 0.00,
            'currency_id' => $this->inr->id,
            'expected_monthly_hours' => 160.00,
            'hourly_rate' => 600.00,
            'effective_from' => now()->toDateString(),
            'is_current' => true,
        ]);
        $this->assertEquals(600.00, $user1->hourly_rate);

        // 2. Fixed user (no hourly rate set, calculates base_amount / expected_monthly_hours)
        $user2 = User::factory()->create(['status' => 'active']);
        EmployeeCompensation::create([
            'user_id' => $user2->id,
            'compensation_type_id' => $fixedType->id,
            'base_amount' => 160000.00,
            'currency_id' => $this->inr->id,
            'expected_monthly_hours' => 160.00,
            'hourly_rate' => 0.00,
            'effective_from' => now()->toDateString(),
            'is_current' => true,
        ]);
        $this->assertEquals(1000.00, $user2->hourly_rate);

        // 3. User with no current compensation
        $user3 = User::factory()->create(['status' => 'active']);
        $this->assertEquals(0.00, $user3->hourly_rate);
    }

    /**
     * Test generating a payroll run.
     */
    public function test_generating_payroll_run_and_validating_calculations(): void
    {
        // 1. Setup timesheets for the year/month
        $year = 2026;
        $month = 6;

        $project = Project::create([
            'name' => 'Payroll System Test Project',
            'manager_id' => $this->pm->id,
            'client_id' => $this->founder->id,
            'status' => 'in_progress',
        ]);

        // Clear existing timesheets
        Timesheet::query()->delete();

        // Seed timesheet for dev (hourly, rate 500)
        Timesheet::create([
            'user_id' => $this->employee->id,
            'project_id' => $project->id,
            'date' => "{$year}-06-10",
            'hours_logged' => 40.00,
            'status' => 'approved',
            'approved_by' => $this->founder->id,
            'approved_at' => now(),
        ]);

        // Seed a bonus for dev
        Bonus::create([
            'user_id' => $this->employee->id,
            'amount' => 5000.00,
            'currency_id' => $this->inr->id,
            'type' => 'performance',
            'reason' => 'Excellent work',
            'effective_date' => "{$year}-06-15",
            'status' => 'approved',
        ]);

        // Make the call as the founder to generate payroll
        $this->actingAs($this->founder, 'sanctum');
        
        $response = $this->postJson('/api/v1/payroll/runs', [
            'year' => $year,
            'month' => $month,
            'notes' => 'June 2026 Test Run',
        ]);

        $response->assertStatus(201);
        $runId = $response->json('id');

        // Check PayrollRun record
        $this->assertDatabaseHas('payroll_runs', [
            'id' => $runId,
            'year' => $year,
            'month' => $month,
            'status' => 'draft',
        ]);

        // Dev base salary should be 40 hours * 500 rate = 20,000. Net should be 20,000 + 5000 bonus = 25,000.
        $this->assertDatabaseHas('payroll_run_items', [
            'payroll_run_id' => $runId,
            'user_id' => $this->employee->id,
            'base_salary' => 20000.00,
            'bonus_amount' => 5000.00,
            'net_salary' => 25000.00,
        ]);

        // Assert bonus status was updated to paid and payroll run linked
        $this->assertDatabaseHas('bonuses', [
            'user_id' => $this->employee->id,
            'payroll_run_id' => $runId,
            'status' => 'paid',
        ]);
    }

    /**
     * Test approving a payroll run. `payroll.approve` is deliberately withheld
     * from finance AND director in RolesPermissionsSeeder (segregation of
     * duty — see PayrollPolicy::approve) — only founder holds it.
     */
    public function test_approving_payroll_run(): void
    {
        $this->actingAs($this->founder, 'sanctum');

        $response = $this->postJson('/api/v1/payroll/runs', [
            'year' => 2026,
            'month' => 7,
        ]);
        $response->assertStatus(201);
        $runId = $response->json('id');

        // Non-privileged employee attempts approval -> 403
        $this->actingAs($this->employee, 'sanctum');
        $this->postJson("/api/v1/payroll/runs/{$runId}/approve")->assertStatus(403);

        // Director does NOT hold payroll.approve -> 403 (seeder's explicit exclusion)
        $this->actingAs($this->director, 'sanctum');
        $this->postJson("/api/v1/payroll/runs/{$runId}/approve")->assertStatus(403);

        // Finance holds payroll.manage but not payroll.approve -> 403
        $this->actingAs($this->financeUser, 'sanctum');
        $this->postJson("/api/v1/payroll/runs/{$runId}/approve")->assertStatus(403);

        // Founder approves -> 200
        $this->actingAs($this->founder, 'sanctum');
        $approveResponse = $this->postJson("/api/v1/payroll/runs/{$runId}/approve");
        $approveResponse->assertStatus(200);

        $this->assertDatabaseHas('payroll_runs', [
            'id' => $runId,
            'status' => 'approved',
            'approved_by' => $this->founder->id,
        ]);
    }

    /**
     * Test project labor cost allocation.
     */
    public function test_project_labor_cost_allocation(): void
    {
        $year = 2026;
        $month = 8;

        $project = Project::create([
            'name' => 'Allocation Project',
            'manager_id' => $this->pm->id,
            'client_id' => $this->founder->id,
            'status' => 'in_progress',
        ]);

        // Clear and seed Timesheet
        Timesheet::query()->delete();

        // 10 hours for dev (hourly, rate 500)
        Timesheet::create([
            'user_id' => $this->employee->id,
            'project_id' => $project->id,
            'date' => "{$year}-08-05",
            'hours_logged' => 10.00,
            'status' => 'approved',
            'approved_by' => $this->founder->id,
            'approved_at' => now(),
        ]);

        $this->actingAs($this->financeUser, 'sanctum');

        $response = $this->getJson("/api/v1/payroll/cost-allocation?year={$year}&month={$month}");
        $response->assertStatus(200)
            ->assertJsonFragment([
                'project_id' => $project->id,
                'project_name' => 'Allocation Project',
                'total_hours' => 10.00,
                'total_labor_cost' => 5000.00, // 10 * 500
            ]);
    }

    /**
     * Test expense CRUD and approvals.
     */
    public function test_expense_crud_and_approvals(): void
    {
        $category = ExpenseCategory::first();
        $vendor = Vendor::first();

        // 1. Store expense as draft (employee)
        $this->actingAs($this->employee, 'sanctum');

        $response = $this->postJson('/api/v1/expenses', [
            'category_id' => $category->id,
            'vendor_id' => $vendor->id,
            'title' => 'Office Keyboard',
            'amount' => 1500.00,
            'currency_id' => $this->inr->id,
            'expense_date' => now()->toDateString(),
        ]);

        $response->assertStatus(201);
        $expenseId = $response->json('id');
        $this->assertNotEmpty($response->json('expense_number'));
        $this->assertEquals('draft', $response->json('status'));

        // 2. Update expense as draft (employee)
        $response = $this->putJson("/api/v1/expenses/{$expenseId}", [
            'category_id' => $category->id,
            'vendor_id' => $vendor->id,
            'title' => 'Ergonomic Keyboard',
            'amount' => 2500.00,
            'currency_id' => $this->inr->id,
            'expense_date' => now()->toDateString(),
        ]);
        $response->assertStatus(200);
        $this->assertEquals('Ergonomic Keyboard', Expense::find($expenseId)->title);

        // 2b. Status is not a client-settable field on update — only the dedicated
        // submit/approve/reject/reimburse endpoints may change it.
        $response = $this->putJson("/api/v1/expenses/{$expenseId}", [
            'category_id' => $category->id,
            'vendor_id' => $vendor->id,
            'title' => 'Ergonomic Keyboard',
            'amount' => 2500.00,
            'currency_id' => $this->inr->id,
            'expense_date' => now()->toDateString(),
            'status' => 'reimbursed',
        ]);
        $response->assertStatus(200);
        $this->assertEquals('draft', Expense::find($expenseId)->status);

        // 3. Submit the expense via the dedicated submit endpoint
        $response = $this->postJson("/api/v1/expenses/{$expenseId}/submit");
        $response->assertStatus(200);
        $this->assertEquals('submitted', Expense::find($expenseId)->status);

        // Employee cannot update/delete submitted expense anymore
        $this->putJson("/api/v1/expenses/{$expenseId}", [
            'title' => 'Hacked title',
        ])->assertStatus(403);

        $this->deleteJson("/api/v1/expenses/{$expenseId}")->assertStatus(403);

        // 4. PM approves project expense (we link it to project first)
        $project = Project::create([
            'name' => 'Expense Project',
            'manager_id' => $this->pm->id,
            'client_id' => $this->founder->id,
            'status' => 'in_progress',
        ]);
        
        $projExpense = Expense::create([
            'expense_number' => 'EXP-PROJ-99',
            'category_id' => $category->id,
            'project_id' => $project->id,
            'submitted_by' => $this->employee->id,
            'title' => 'Project Hard Drive',
            'amount' => 8000.00,
            'currency_id' => $this->inr->id,
            'expense_date' => now()->toDateString(),
            'status' => 'submitted',
        ]);

        // PM approves -> 200
        $this->actingAs($this->pm, 'sanctum');
        $this->postJson("/api/v1/expenses/{$projExpense->id}/approve")->assertStatus(200);
        $this->assertEquals('approved', $projExpense->fresh()->status);

        // PM attempts to approve overhead expense (project_id = null) -> 403
        $overheadExpense = Expense::create([
            'expense_number' => 'EXP-OVER-99',
            'category_id' => $category->id,
            'submitted_by' => $this->employee->id,
            'title' => 'Overhead Rent',
            'amount' => 12000.00,
            'currency_id' => $this->inr->id,
            'expense_date' => now()->toDateString(),
            'status' => 'submitted',
        ]);

        $this->postJson("/api/v1/expenses/{$overheadExpense->id}/approve")->assertStatus(403);

        // Finance user approves overhead expense -> 200
        $this->actingAs($this->financeUser, 'sanctum');
        $this->postJson("/api/v1/expenses/{$overheadExpense->id}/approve")->assertStatus(200);
        $this->assertEquals('approved', $overheadExpense->fresh()->status);

        // Re-approving an already-approved expense is rejected (no re-approve/overwrite)
        $this->postJson("/api/v1/expenses/{$overheadExpense->id}/approve")->assertStatus(422);

        // 5. Director (not finance, not the project's PM) has full oversight:
        // sees every expense in the index, and can approve one directly.
        $directorOverheadExpense = Expense::create([
            'expense_number' => 'EXP-OVER-100',
            'category_id' => $category->id,
            'submitted_by' => $this->employee->id,
            'title' => 'Overhead Internet Bill',
            'amount' => 3000.00,
            'currency_id' => $this->inr->id,
            'expense_date' => now()->toDateString(),
            'status' => 'submitted',
        ]);

        $this->actingAs($this->director, 'sanctum');
        $indexResponse = $this->getJson('/api/v1/expenses?per_page=100');
        $indexResponse->assertStatus(200);
        $this->assertContains(
            $directorOverheadExpense->id,
            collect($indexResponse->json('data'))->pluck('id')->all()
        );

        $this->postJson("/api/v1/expenses/{$directorOverheadExpense->id}/approve")->assertStatus(200);
        $this->assertEquals('approved', $directorOverheadExpense->fresh()->status);
    }
}
