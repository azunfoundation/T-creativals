<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Currency;
use App\Models\PayrollRun;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Dashboard module (Sprint 13) — regression coverage for the permission-gated
 * dashboard payload, the period-overlap profitability fix, the honest
 * executive-briefing endpoint, and the corrected payroll counting.
 */
class Sprint13DashboardTest extends TestCase
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
        $this->inr = Currency::where('code', 'INR')->first()
            ?? Currency::factory()->create(['code' => 'INR', 'exchange_rate_to_inr' => 1.0000]);

        // A brand-new employee with no tasks/projects, so scoping assertions
        // aren't polluted by demo-seeded records.
        $this->employee = User::factory()->create(['email' => 'dash-employee@creativals.com', 'status' => 'active']);
        $this->employee->assignRole('employee');
    }

    /**
     * Financial trends, sales funnel, team performance, and the overdue
     * invoice/stale lead attention lists must never reach a plain employee —
     * previously the whole payload was returned to every authenticated user.
     */
    public function test_dashboard_sections_are_gated_by_role(): void
    {
        $founderData = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->json();

        foreach (['this_month_revenue', 'financial_trends', 'sales_pipeline', 'team_performance', 'projects_summary', 'my_summary', 'attention_required', 'alerts_list'] as $key) {
            $this->assertArrayHasKey($key, $founderData, "Founder payload missing [{$key}]");
        }
        $this->assertArrayHasKey('invoices', $founderData['attention_required']['counts']);
        $this->assertArrayHasKey('leads', $founderData['attention_required']['counts']);

        $employeeData = $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->json();

        foreach (['this_month_revenue', 'last_month_revenue', 'this_month_expenses', 'this_month_profitability', 'financial_trends', 'active_clients_count', 'sales_pipeline', 'this_month_pipeline', 'this_month_quotes', 'team_performance', 'this_month_utilisation'] as $key) {
            $this->assertArrayNotHasKey($key, $employeeData, "Employee payload leaked [{$key}]");
        }
        // Employees still get their own sections.
        $this->assertArrayHasKey('my_summary', $employeeData);
        $this->assertArrayHasKey('alerts_list', $employeeData);
        $this->assertArrayHasKey('attention_required', $employeeData);
        $this->assertArrayNotHasKey('overdue_invoices', $employeeData['attention_required']);
        $this->assertArrayNotHasKey('stale_leads', $employeeData['attention_required']);
        $this->assertArrayNotHasKey('invoices', $employeeData['attention_required']['counts']);
    }

    /**
     * A project manager gets the project/team sections (scoped server-side)
     * but never the financial or sales sections; a director (all permissions
     * except three unrelated ones) gets everything a founder gets.
     */
    public function test_dashboard_sections_for_pm_and_director(): void
    {
        $pm = User::factory()->create(['email' => 'dash-pm@creativals.com', 'status' => 'active']);
        $pm->assignRole('project_manager');

        $pmData = $this->actingAs($pm, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->json();
        foreach (['projects_summary', 'this_month_utilisation', 'team_performance', 'my_summary'] as $key) {
            $this->assertArrayHasKey($key, $pmData, "PM payload missing [{$key}]");
        }
        foreach (['this_month_revenue', 'financial_trends', 'sales_pipeline', 'this_month_pipeline'] as $key) {
            $this->assertArrayNotHasKey($key, $pmData, "PM payload leaked [{$key}]");
        }
        // PM team performance is scoped to people who log time on their
        // projects — this brand-new PM manages nothing, so it must be empty.
        $this->assertSame([], $pmData['team_performance']);

        $director = User::where('email', 'director@creativals.com')->first();
        $directorData = $this->actingAs($director, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->json();
        foreach (['this_month_revenue', 'financial_trends', 'sales_pipeline', 'team_performance', 'projects_summary'] as $key) {
            $this->assertArrayHasKey($key, $directorData, "Director payload missing [{$key}]");
        }
    }

    /**
     * A plain employee's overdue-tasks list covers only their own tasks;
     * a founder sees company-wide overdue tasks.
     */
    public function test_dashboard_overdue_tasks_are_scoped_to_own_for_employee(): void
    {
        $project = Project::create([
            'project_number' => 'PRJ-DASH-1',
            'name' => 'Dashboard Scoping Fixture',
            'client_id' => $this->founder->id,
            'manager_id' => $this->founder->id,
            'status' => 'active',
            'start_date' => now()->subMonth()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
        ]);

        Task::create([
            'task_number' => 'TSK-DASH-1',
            'project_id' => $project->id,
            'title' => 'Employee overdue task',
            'assigned_to' => $this->employee->id,
            'created_by' => $this->founder->id,
            'status' => 'todo',
            'due_date' => now()->subDays(3)->toDateString(),
        ]);
        Task::create([
            'task_number' => 'TSK-DASH-2',
            'project_id' => $project->id,
            'title' => 'Someone else overdue task',
            'assigned_to' => $this->founder->id,
            'created_by' => $this->founder->id,
            'status' => 'todo',
            'due_date' => now()->subDays(3)->toDateString(),
        ]);

        $employeeData = $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->json();
        $this->assertSame(1, $employeeData['attention_required']['counts']['tasks']);
        $this->assertSame('TSK-DASH-1', $employeeData['attention_required']['overdue_tasks'][0]['task_number']);
        $this->assertSame(1, $employeeData['my_summary']['overdue_tasks_count']);

        $founderData = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->json();
        $this->assertGreaterThanOrEqual(2, $founderData['attention_required']['counts']['tasks']);
    }

    /**
     * Regression for the whereBetween(start_date) bug: an ongoing project that
     * STARTED before this month must still count in this-month profitability.
     */
    public function test_dashboard_profitability_includes_ongoing_projects(): void
    {
        Project::create([
            'project_number' => 'PRJ-DASH-ONGOING',
            'name' => 'Ongoing Retainer Fixture',
            'client_id' => $this->founder->id,
            'manager_id' => $this->founder->id,
            'status' => 'active',
            'start_date' => now()->subMonths(4)->toDateString(),
            'end_date' => now()->addMonths(4)->toDateString(),
            'budget_amount' => 987654,
        ]);

        $data = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->json();

        // With no linked invoice, profitability revenue falls back to
        // budget_amount — so this project's presence is provable via the total.
        $this->assertGreaterThanOrEqual(
            987654.0,
            (float) $data['this_month_profitability']['summary']['total_revenue'],
            'Ongoing project that started before this month was dropped from this-month profitability'
        );
    }

    /**
     * The briefing summarizes company-wide money — financial viewers only,
     * and its source flag must be honest: with no AI key configured (the
     * testing default) it must say "system", never pretend to be a model.
     */
    public function test_dashboard_briefing_authorization_and_honest_source(): void
    {
        $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/reports/dashboard/briefing')
            ->assertStatus(403);

        $res = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/dashboard/briefing')
            ->assertStatus(200)
            ->json();

        $this->assertNotEmpty($res['briefing']);
        $this->assertIsArray($res['recommendations']);
        $this->assertSame('system', $res['source'], 'Keyless environment must label the briefing as system-generated, not AI');
    }

    /**
     * "Pending payroll" must count only runs awaiting sign-off — approved is
     * the terminal state and was previously counted as pending forever.
     */
    public function test_dashboard_pending_payroll_excludes_approved_runs(): void
    {
        PayrollRun::create([
            'run_number' => 'PAY-DASH-DRAFT',
            'year' => (int) now()->format('Y'),
            'month' => (int) now()->format('m'),
            'status' => 'draft',
            'total_gross' => 100000,
            'total_deductions' => 0,
            'total_net' => 100000,
            'currency_id' => $this->inr->id,
            'submitted_by' => $this->founder->id,
        ]);
        PayrollRun::create([
            'run_number' => 'PAY-DASH-APPROVED',
            'year' => (int) now()->format('Y'),
            'month' => (int) now()->format('m'),
            'status' => 'approved',
            'total_gross' => 200000,
            'total_deductions' => 0,
            'total_net' => 200000,
            'currency_id' => $this->inr->id,
            'submitted_by' => $this->founder->id,
        ]);

        $expectedPending = DB::table('payroll_runs')
            ->whereNull('deleted_at')
            ->whereIn('status', ['draft', 'submitted'])
            ->count();
        $approvedCount = DB::table('payroll_runs')->whereNull('deleted_at')->where('status', 'approved')->count();
        $this->assertGreaterThanOrEqual(1, $approvedCount);

        $data = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->json();

        $this->assertSame($expectedPending, $data['attention_required']['counts']['payroll']);
    }

    /**
     * Regression for the cash-flow trend's payroll line: approved runs (the
     * real terminal state) must contribute payroll cost — the old filter
     * required status 'paid', which nothing ever sets, so payroll was ₹0.
     */
    public function test_dashboard_financial_trends_include_approved_payroll(): void
    {
        PayrollRun::create([
            'run_number' => 'PAY-DASH-TREND',
            'year' => (int) now()->format('Y'),
            'month' => (int) now()->format('m'),
            'status' => 'approved',
            'total_gross' => 123456,
            'total_deductions' => 0,
            'total_net' => 123456,
            'currency_id' => $this->inr->id,
            'submitted_by' => $this->founder->id,
        ]);

        $data = $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->json();

        $trends = $data['financial_trends'];
        $this->assertCount(6, $trends);
        $currentMonth = end($trends);
        $this->assertGreaterThanOrEqual(
            123456.0,
            (float) $currentMonth['payroll'],
            'Approved payroll run did not appear in the current month\'s payroll cost'
        );
    }

    /**
     * Assert that ProjectResource and ClientController filter out financial metrics
     * for plain employees (employee role) who lack projects.profitability or reports.view_financial.
     */
    public function test_financial_information_is_hidden_from_employees(): void
    {
        $this->employee->givePermissionTo('clients.view');

        // 1. Create a client and a project with a budget
        $clientUser = User::factory()->create(['status' => 'active']);
        $clientUser->assignRole('client');

        $project = Project::create([
            'project_number' => 'PRJ-FIN-SEC-1',
            'name' => 'Financial Security Fixture',
            'client_id' => $clientUser->id,
            'manager_id' => $this->founder->id,
            'status' => 'active',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'budget_amount' => 500000,
        ]);

        $project->members()->create([
            'user_id' => $this->employee->id,
            'role' => 'member',
            'joined_at' => now(),
        ]);

        // 2. Fetch projects list as employee
        $response = $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/projects')
            ->assertStatus(200);
        
        $projectData = collect($response->json()['data'])->firstWhere('id', $project->id);
        $this->assertNotNull($projectData);
        $this->assertArrayHasKey('budget_amount', $projectData);
        $this->assertNull($projectData['budget_amount'], 'Employee should not see budget_amount');
        $this->assertNull($projectData['invoice_id'], 'Employee should not see invoice_id');
        $this->assertNull($projectData['invoice'], 'Employee should not see invoice details');

        // 3. Fetch project details as employee
        $responseDetails = $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/projects/{$project->id}")
            ->assertStatus(200)
            ->json();
        
        $this->assertNull($responseDetails['data']['budget_amount'], 'Employee should not see budget_amount in project details');

        // 4. Fetch clients list as employee
        $clientResponse = $this->actingAs($this->employee, 'sanctum')
            ->getJson('/api/v1/clients')
            ->assertStatus(200)
            ->json();
        
        $this->assertEquals(0.0, $clientResponse['summary']['total_billed'], 'Summary total_billed should be zero for employee');
        $this->assertEquals(0.0, $clientResponse['summary']['total_collected'], 'Summary total_collected should be zero for employee');
        $this->assertEquals(0.0, $clientResponse['summary']['total_outstanding'], 'Summary total_outstanding should be zero for employee');

        foreach ($clientResponse['breakdown'] as $c) {
            $this->assertEquals(0.0, $c['total_billed'], 'Client breakdown total_billed should be zero for employee');
            $this->assertEquals(0.0, $c['total_paid'], 'Client breakdown total_paid should be zero for employee');
            $this->assertEquals(0.0, $c['total_outstanding'], 'Client breakdown total_outstanding should be zero for employee');
        }

        // 5. Fetch client details as employee
        $clientDetails = $this->actingAs($this->employee, 'sanctum')
            ->getJson("/api/v1/clients/{$clientUser->id}")
            ->assertStatus(200)
            ->json();
        
        $this->assertEquals(0.0, $clientDetails['totals']['total_billed'], 'Client details total_billed should be zero for employee');
        $this->assertEquals(0.0, $clientDetails['totals']['total_paid'], 'Client details total_paid should be zero for employee');
        $this->assertEquals(0.0, $clientDetails['totals']['total_outstanding'], 'Client details total_outstanding should be zero for employee');
        $this->assertSame([], $clientDetails['revenue_history'], 'Client details revenue_history should be empty for employee');
        $this->assertSame([], $clientDetails['invoices']['items'], 'Client details invoices should be empty for employee');
        $this->assertSame(0, $clientDetails['invoices']['total_count'], 'Client details invoices count should be zero');
    }

    /**
     * Test project workspace filtering flow for dashboard Overview and Briefing endpoints.
     */
    public function test_dashboard_project_workspace_filtering_scenarios(): void
    {
        $clientUser = User::factory()->create(['status' => 'active']);
        $clientUser->assignRole('client');

        $project = Project::create([
            'project_number' => 'PRJ-TEST-WS-1',
            'name' => 'Workspace Filter Test Project',
            'client_id' => $clientUser->id,
            'manager_id' => $this->founder->id,
            'status' => 'in_progress',
            'start_date' => now()->startOfMonth()->toDateString(),
            'end_date' => now()->endOfMonth()->toDateString(),
            'budget_amount' => 100000,
        ]);

        $emptyProject = Project::create([
            'project_number' => 'PRJ-TEST-WS-2',
            'name' => 'Empty Workspace Test Project',
            'client_id' => $clientUser->id,
            'manager_id' => $this->founder->id,
            'status' => 'in_progress',
            'start_date' => now()->startOfMonth()->toDateString(),
            'end_date' => now()->endOfMonth()->toDateString(),
            'budget_amount' => 0,
        ]);

        // 1. All Projects (no project_id filter)
        $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/dashboard')
            ->assertStatus(200)
            ->assertJsonStructure(['this_month_revenue', 'my_summary']);

        // 2. Valid Project
        $this->actingAs($this->founder, 'sanctum')
            ->getJson("/api/v1/reports/dashboard?project_id={$project->id}")
            ->assertStatus(200)
            ->assertJsonStructure(['this_month_revenue', 'my_summary']);

        $this->actingAs($this->founder, 'sanctum')
            ->getJson("/api/v1/reports/dashboard/briefing?project_id={$project->id}")
            ->assertStatus(200);

        // 3. Project with no financial data / no team members
        $this->actingAs($this->founder, 'sanctum')
            ->getJson("/api/v1/reports/dashboard?project_id={$emptyProject->id}")
            ->assertStatus(200)
            ->assertJsonStructure(['this_month_revenue', 'my_summary']);

        // 4. Unauthorized Project (employee has no permission or assignment)
        $unauthorizedEmployee = User::factory()->create(['status' => 'active']);
        $unauthorizedEmployee->assignRole('employee');

        $this->actingAs($unauthorizedEmployee, 'sanctum')
            ->getJson("/api/v1/reports/dashboard?project_id={$project->id}")
            ->assertStatus(403);

        $this->actingAs($unauthorizedEmployee, 'sanctum')
            ->getJson("/api/v1/reports/dashboard/briefing?project_id={$project->id}")
            ->assertStatus(403);

        // 5. Invalid / Non-existent Project ID
        $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/dashboard?project_id=999999')
            ->assertStatus(404);

        $this->actingAs($this->founder, 'sanctum')
            ->getJson('/api/v1/reports/dashboard/briefing?project_id=999999')
            ->assertStatus(404);
    }
}
