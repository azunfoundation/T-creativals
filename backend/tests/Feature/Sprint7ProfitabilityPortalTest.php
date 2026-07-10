<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CompensationType;
use App\Models\Currency;
use App\Models\EmployeeCompensation;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\Timesheet;
use App\Models\User;
use App\Models\Milestone;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class Sprint7ProfitabilityPortalTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private User $pm;
    private User $employee;
    private User $clientUser;
    private User $clientUser2;
    private Currency $inr;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed();

        $this->founder  = User::where('email', 'founder@creativals.com')->first();
        $this->pm       = User::where('email', 'pm@creativals.com')->first();
        $this->employee = User::where('email', 'dev@creativals.com')->first();
        $this->inr      = Currency::where('code', 'INR')->first() ?? Currency::first();

        // Create two client portal users for isolation tests
        $this->clientUser = User::factory()->create([
            'name'                  => 'Client Alpha',
            'email'                 => 'client.alpha@test.com',
            'password'              => Hash::make('portal_pass_123'),
            'status'                => 'active',
            'is_client_portal_user' => true,
        ]);
        $this->clientUser->assignRole('client');

        $this->clientUser2 = User::factory()->create([
            'name'                  => 'Client Beta',
            'email'                 => 'client.beta@test.com',
            'password'              => Hash::make('portal_pass_456'),
            'status'                => 'active',
            'is_client_portal_user' => true,
        ]);
        $this->clientUser2->assignRole('client');
    }

    // =========================================================================
    // ── SECTION 1: PROFITABILITY CALCULATIONS
    // =========================================================================

    /** @test */
    public function test_profitability_uses_budget_amount_when_no_invoice_attached(): void
    {
        $project = Project::create([
            'name'          => 'Budget Fallback Project',
            'client_id'     => $this->clientUser->id,
            'manager_id'    => $this->pm->id,
            'budget_amount' => 100000.00,
            'status'        => 'in_progress',
        ]);

        $this->actingAs($this->founder, 'sanctum');

        $response = $this->getJson("/api/v1/projects/{$project->id}/profitability");
        $response->assertStatus(200)
            ->assertJsonFragment([
                'project_id'    => $project->id,
                'revenue'       => 100000.00,
                'labor_cost'    => 0.00,
                'expense_cost'  => 0.00,
                'total_cost'    => 0.00,
                'net_profit'    => 100000.00,
            ]);

        $this->assertEquals(100.00, $response->json('margin_percentage'));
    }

    /** @test */
    public function test_profitability_calculates_labor_cost_from_timesheets_and_hourly_rates(): void
    {
        $hourlyType = CompensationType::where('type', 'hourly')->first();

        // Give the employee a known hourly rate
        EmployeeCompensation::updateOrCreate(
            ['user_id' => $this->employee->id, 'is_current' => true],
            [
                'compensation_type_id'   => $hourlyType->id,
                'base_amount'            => 0.00,
                'currency_id'            => $this->inr->id,
                'expected_monthly_hours' => 160.00,
                'hourly_rate'            => 800.00,
                'effective_from'         => now()->toDateString(),
                'is_current'             => true,
            ]
        );

        $project = Project::create([
            'name'          => 'Labor Test Project',
            'client_id'     => $this->clientUser->id,
            'manager_id'    => $this->pm->id,
            'budget_amount' => 50000.00,
            'status'        => 'in_progress',
        ]);

        // Create approved timesheets: 10 hours submitted + 5 approved = 15 logged
        Timesheet::create([
            'user_id'    => $this->employee->id,
            'project_id' => $project->id,
            'date'       => now()->toDateString(),
            'hours_logged' => 10.00,
            'status'     => 'submitted',
        ]);
        Timesheet::create([
            'user_id'     => $this->employee->id,
            'project_id'  => $project->id,
            'task_id'     => null,
            'date'        => now()->subDay()->toDateString(),
            'hours_logged' => 5.00,
            'status'      => 'approved',
            'approved_by' => $this->founder->id,
            'approved_at' => now(),
        ]);

        // Draft timesheet — must be excluded from labor cost
        Timesheet::create([
            'user_id'     => $this->employee->id,
            'project_id'  => $project->id,
            'task_id'     => null,
            'date'        => now()->subDays(2)->toDateString(),
            'hours_logged' => 20.00,
            'status'      => 'draft',
        ]);

        $this->actingAs($this->founder, 'sanctum');
        $response = $this->getJson("/api/v1/projects/{$project->id}/profitability");
        $response->assertStatus(200);

        // Expected labor cost = 15 hours × ₹800 = ₹12,000
        $this->assertEquals(12000.00, $response->json('labor_cost'));
        $this->assertEquals(0.00,     $response->json('expense_cost'));
        $this->assertEquals(50000.00, $response->json('revenue'));      // fallback to budget
        $this->assertEquals(38000.00, $response->json('net_profit'));
    }

    /** @test */
    public function test_profitability_calculates_expense_cost_from_approved_expenses(): void
    {
        $category = ExpenseCategory::first();

        $project = Project::create([
            'name'          => 'Expense Profit Project',
            'client_id'     => $this->clientUser->id,
            'manager_id'    => $this->pm->id,
            'budget_amount' => 80000.00,
            'status'        => 'in_progress',
        ]);

        // Approved expense
        Expense::create([
            'expense_number' => 'EXP-PROFIT-01',
            'category_id'    => $category->id,
            'project_id'     => $project->id,
            'submitted_by'   => $this->employee->id,
            'title'          => 'Stock Photography',
            'amount'         => 3500.00,
            'currency_id'    => $this->inr->id,
            'expense_date'   => now()->toDateString(),
            'status'         => 'approved',
        ]);

        // Reimbursed expense
        Expense::create([
            'expense_number' => 'EXP-PROFIT-02',
            'category_id'    => $category->id,
            'project_id'     => $project->id,
            'submitted_by'   => $this->employee->id,
            'title'          => 'External Plugin License',
            'amount'         => 1500.00,
            'currency_id'    => $this->inr->id,
            'expense_date'   => now()->toDateString(),
            'status'         => 'reimbursed',
        ]);

        // Draft expense — must be excluded
        Expense::create([
            'expense_number' => 'EXP-PROFIT-03',
            'category_id'    => $category->id,
            'project_id'     => $project->id,
            'submitted_by'   => $this->employee->id,
            'title'          => 'Pending Subscription',
            'amount'         => 10000.00,
            'currency_id'    => $this->inr->id,
            'expense_date'   => now()->toDateString(),
            'status'         => 'draft',
        ]);

        $this->actingAs($this->founder, 'sanctum');
        $response = $this->getJson("/api/v1/projects/{$project->id}/profitability");
        $response->assertStatus(200);

        // Expected expense cost = 3500 + 1500 = 5000 (draft excluded)
        $this->assertEquals(5000.00,  $response->json('expense_cost'));
        $this->assertEquals(80000.00, $response->json('revenue'));
        $this->assertEquals(75000.00, $response->json('net_profit'));
    }

    /** @test */
    public function test_profitability_prefers_approved_invoice_total_over_budget_amount(): void
    {
        // Create an approved invoice
        $invoice = Invoice::create([
            'invoice_number' => 'INV-PROFIT-001',
            'client_id'      => $this->clientUser->id,
            'created_by'     => $this->founder->id,
            'title'          => 'Project Alpha Invoice',
            'currency_id'    => $this->inr->id,
            'base_currency'  => 'INR',
            'exchange_rate'  => 1.0000,
            'subtotal'       => 60000.00,
            'total_amount'   => 60000.00,
            'due_amount'     => 60000.00,
            'status'         => 'approved',
            'issue_date'     => now()->toDateString(),
            'due_date'       => now()->addDays(30)->toDateString(),
        ]);

        $project = Project::create([
            'name'          => 'Invoice Revenue Project',
            'client_id'     => $this->clientUser->id,
            'manager_id'    => $this->pm->id,
            'invoice_id'    => $invoice->id,
            'budget_amount' => 45000.00,  // lower than invoice — should be ignored
            'status'        => 'in_progress',
        ]);

        $this->actingAs($this->founder, 'sanctum');
        $response = $this->getJson("/api/v1/projects/{$project->id}/profitability");
        $response->assertStatus(200);

        // Revenue should be 60000 (invoice), NOT 45000 (budget)
        $this->assertEquals(60000.00, $response->json('revenue'));
        $this->assertEquals(60000.00, $response->json('net_profit'));
    }

    /** @test */
    public function test_profitability_falls_back_to_budget_when_invoice_is_draft(): void
    {
        $invoice = Invoice::create([
            'invoice_number' => 'INV-PROFIT-DRAFT',
            'client_id'      => $this->clientUser->id,
            'created_by'     => $this->founder->id,
            'title'          => 'Draft Invoice',
            'currency_id'    => $this->inr->id,
            'base_currency'  => 'INR',
            'exchange_rate'  => 1.0000,
            'subtotal'       => 90000.00,
            'total_amount'   => 90000.00,
            'due_amount'     => 90000.00,
            'status'         => 'draft',
            'issue_date'     => now()->toDateString(),
            'due_date'       => now()->addDays(30)->toDateString(),
        ]);

        $project = Project::create([
            'name'          => 'Draft Invoice Fallback Project',
            'client_id'     => $this->clientUser->id,
            'manager_id'    => $this->pm->id,
            'invoice_id'    => $invoice->id,
            'budget_amount' => 30000.00,
            'status'        => 'in_progress',
        ]);

        $this->actingAs($this->founder, 'sanctum');
        $response = $this->getJson("/api/v1/projects/{$project->id}/profitability");
        $response->assertStatus(200);

        // Revenue must fall back to budget because invoice is still draft
        $this->assertEquals(30000.00, $response->json('revenue'));
    }

    /** @test */
    public function test_profitability_margin_percentage_is_zero_when_revenue_is_zero(): void
    {
        $project = Project::create([
            'name'          => 'Zero Revenue Project',
            'client_id'     => $this->clientUser->id,
            'manager_id'    => $this->pm->id,
            'budget_amount' => 0.00,
            'status'        => 'planning',
        ]);

        $this->actingAs($this->founder, 'sanctum');
        $response = $this->getJson("/api/v1/projects/{$project->id}/profitability");
        $response->assertStatus(200);

        $this->assertEquals(0.00, $response->json('margin_percentage'));
    }

    /** @test */
    public function test_profitability_response_has_correct_structure(): void
    {
        $project = Project::create([
            'name'          => 'Structure Check Project',
            'client_id'     => $this->clientUser->id,
            'manager_id'    => $this->pm->id,
            'budget_amount' => 25000.00,
            'status'        => 'in_progress',
        ]);

        $this->actingAs($this->founder, 'sanctum');
        $response = $this->getJson("/api/v1/projects/{$project->id}/profitability");

        $response->assertStatus(200)
            ->assertJsonStructure([
                'project_id',
                'project_name',
                'budget_amount',
                'revenue',
                'labor_cost',
                'expense_cost',
                'total_cost',
                'net_profit',
                'margin_percentage',
            ]);
    }

    // =========================================================================
    // ── SECTION 2: CLIENT PORTAL LOGIN
    // =========================================================================

    /** @test */
    public function test_client_can_login_to_portal_and_receive_token(): void
    {
        $response = $this->postJson('/api/v1/portal/login', [
            'email'    => 'client.alpha@test.com',
            'password' => 'portal_pass_123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'token',
                'user' => ['id', 'name', 'email'],
            ]);

        $this->assertEquals('client.alpha@test.com', $response->json('user.email'));
        $this->assertNotEmpty($response->json('token'));
    }

    /** @test */
    public function test_portal_login_rejects_wrong_password(): void
    {
        $response = $this->postJson('/api/v1/portal/login', [
            'email'    => 'client.alpha@test.com',
            'password' => 'wrong_password',
        ]);

        $response->assertStatus(401);
    }

    /** @test */
    public function test_portal_login_rejects_non_client_staff_users(): void
    {
        // The founder is a staff member, not a 'client' role user.
        $response = $this->postJson('/api/v1/portal/login', [
            'email'    => 'founder@creativals.com',
            'password' => 'password',
        ]);

        $response->assertStatus(403);
    }

    /** @test */
    public function test_portal_login_rejects_non_existent_user(): void
    {
        $response = $this->postJson('/api/v1/portal/login', [
            'email'    => 'ghost@nowhere.com',
            'password' => 'anything',
        ]);

        $response->assertStatus(401);
    }

    /** @test */
    public function test_portal_login_validates_required_fields(): void
    {
        $response = $this->postJson('/api/v1/portal/login', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'password']);
    }

    // =========================================================================
    // ── SECTION 3: CLIENT PORTAL ENDPOINTS
    // =========================================================================

    /** @test */
    public function test_portal_projects_returns_only_authenticated_clients_projects(): void
    {
        // Create two projects: one for clientUser (Alpha), one for clientUser2 (Beta)
        $projectAlpha = Project::create([
            'name'       => 'Alpha Project',
            'client_id'  => $this->clientUser->id,
            'manager_id' => $this->pm->id,
            'status'     => 'in_progress',
        ]);

        Project::create([
            'name'       => 'Beta Secret Project',
            'client_id'  => $this->clientUser2->id,
            'manager_id' => $this->pm->id,
            'status'     => 'in_progress',
        ]);

        $this->actingAs($this->clientUser, 'sanctum');

        $response = $this->getJson('/api/v1/portal/projects');
        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id')->toArray();
        $this->assertContains($projectAlpha->id, $ids);

        // The Beta project must NOT appear in Alpha's portal
        foreach ($response->json('data') as $item) {
            $this->assertEquals($this->clientUser->id, $item['client_id']);
        }
    }

    /** @test */
    public function test_portal_project_show_returns_project_with_milestones(): void
    {
        $project = Project::create([
            'name'       => 'Alpha Visible Project',
            'client_id'  => $this->clientUser->id,
            'manager_id' => $this->pm->id,
            'status'     => 'in_progress',
        ]);

        Milestone::create([
            'project_id' => $project->id,
            'name'       => 'Milestone 1',
            'status'     => 'pending',
        ]);

        $this->actingAs($this->clientUser, 'sanctum');

        $response = $this->getJson("/api/v1/portal/projects/{$project->id}");
        $response->assertStatus(200)
            ->assertJsonPath('data.id', $project->id)
            ->assertJsonStructure(['data', 'milestones']);
    }

    /** @test */
    public function test_portal_project_show_blocks_access_to_another_clients_project(): void
    {
        $betaProject = Project::create([
            'name'       => 'Beta Private Project',
            'client_id'  => $this->clientUser2->id,
            'manager_id' => $this->pm->id,
            'status'     => 'in_progress',
        ]);

        // clientUser (Alpha) tries to view Beta's project → must get 403
        $this->actingAs($this->clientUser, 'sanctum');

        $response = $this->getJson("/api/v1/portal/projects/{$betaProject->id}");
        $response->assertStatus(403);
    }

    /** @test */
    public function test_portal_project_tasks_returns_tasks_for_authenticated_client(): void
    {
        $project = Project::create([
            'name'       => 'Alpha Task Project',
            'client_id'  => $this->clientUser->id,
            'manager_id' => $this->pm->id,
            'status'     => 'in_progress',
        ]);

        Task::create([
            'task_number' => 'TSK-PORTAL-01',
            'project_id'  => $project->id,
            'title'       => 'Design Mockups',
            'status'      => 'in_progress',
            'priority'    => 'high',
            'created_by'  => $this->pm->id,
        ]);

        Task::create([
            'task_number' => 'TSK-PORTAL-02',
            'project_id'  => $project->id,
            'title'       => 'Development Phase',
            'status'      => 'todo',
            'priority'    => 'medium',
            'created_by'  => $this->pm->id,
        ]);

        $this->actingAs($this->clientUser, 'sanctum');

        $response = $this->getJson("/api/v1/portal/projects/{$project->id}/tasks");
        $response->assertStatus(200);

        $this->assertCount(2, $response->json('data'));
    }

    /** @test */
    public function test_portal_tasks_blocks_access_to_another_clients_project(): void
    {
        $betaProject = Project::create([
            'name'       => 'Beta Project With Tasks',
            'client_id'  => $this->clientUser2->id,
            'manager_id' => $this->pm->id,
            'status'     => 'in_progress',
        ]);

        // clientUser (Alpha) tries to access Beta's tasks → must get 403
        $this->actingAs($this->clientUser, 'sanctum');

        $response = $this->getJson("/api/v1/portal/projects/{$betaProject->id}/tasks");
        $response->assertStatus(403);
    }

    /** @test */
    public function test_portal_invoices_returns_only_authenticated_clients_invoices(): void
    {
        // Alpha invoice
        Invoice::create([
            'invoice_number' => 'INV-PORTAL-ALPHA',
            'client_id'      => $this->clientUser->id,
            'created_by'     => $this->founder->id,
            'title'          => 'Alpha Service Invoice',
            'currency_id'    => $this->inr->id,
            'base_currency'  => 'INR',
            'exchange_rate'  => 1.0000,
            'subtotal'       => 20000.00,
            'total_amount'   => 20000.00,
            'due_amount'     => 20000.00,
            'status'         => 'sent',
            'issue_date'     => now()->toDateString(),
            'due_date'       => now()->addDays(30)->toDateString(),
        ]);

        // Beta invoice
        Invoice::create([
            'invoice_number' => 'INV-PORTAL-BETA',
            'client_id'      => $this->clientUser2->id,
            'created_by'     => $this->founder->id,
            'title'          => 'Beta Service Invoice',
            'currency_id'    => $this->inr->id,
            'base_currency'  => 'INR',
            'exchange_rate'  => 1.0000,
            'subtotal'       => 35000.00,
            'total_amount'   => 35000.00,
            'due_amount'     => 35000.00,
            'status'         => 'sent',
            'issue_date'     => now()->toDateString(),
            'due_date'       => now()->addDays(30)->toDateString(),
        ]);

        $this->actingAs($this->clientUser, 'sanctum');

        $response = $this->getJson('/api/v1/portal/invoices');
        $response->assertStatus(200);

        // All returned invoices must belong to Alpha's client_id
        foreach ($response->json('data') as $invoice) {
            $this->assertEquals($this->clientUser->id, $invoice['client_id']);
        }

        $numbers = collect($response->json('data'))->pluck('invoice_number');
        $this->assertTrue($numbers->contains('INV-PORTAL-ALPHA'));
        $this->assertFalse($numbers->contains('INV-PORTAL-BETA'));
    }

    /** @test */
    public function test_portal_endpoints_require_authentication(): void
    {
        // Without any token, all portal endpoints should return 401
        $this->getJson('/api/v1/portal/projects')->assertStatus(401);
        $this->getJson('/api/v1/portal/invoices')->assertStatus(401);
    }

    /** @test */
    public function test_staff_user_cannot_access_portal_endpoints(): void
    {
        // Production Readiness Audit fix: portal data endpoints now explicitly
        // require the 'client' role + is_client_portal_user (matching what
        // portal/login already checked), closing a gap where any staff
        // Sanctum token could legally hit "portal" routes and rely solely on
        // ownership scoping (client_id match) to get an empty result.
        $this->actingAs($this->founder, 'sanctum');

        $this->getJson('/api/v1/portal/projects')->assertStatus(403);
        $this->getJson('/api/v1/portal/invoices')->assertStatus(403);
    }
}
