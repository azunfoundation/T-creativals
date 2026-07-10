<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use App\Models\Project;
use App\Models\Timesheet;
use App\Models\Currency;
use App\Models\CompensationType;
use App\Models\EmployeeCompensation;
use App\Models\PayrollRun;
use App\Models\PayrollRunItem;
use App\Models\NotificationPreference;
use App\Mail\PayslipMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class Sprint10PayrollFeaturesTest extends TestCase
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
        $this->employee = User::where('email', 'dev@creativals.com')->first();
        $this->inr = Currency::where('code', 'INR')->first() ?? Currency::first();
    }

    public function test_deductions_calculation_on_payroll_run(): void
    {
        $year = 2026;
        $month = 6;

        $fixedType = CompensationType::where('type', 'fixed')->first();

        // Setup compensation with deductions
        EmployeeCompensation::updateOrCreate(
            ['user_id' => $this->employee->id],
            [
                'compensation_type_id' => $fixedType->id,
                'base_amount' => 100000.00,
                'currency_id' => $this->inr->id,
                'expected_monthly_hours' => 160.00,
                'effective_from' => now()->subMonth()->toDateString(),
                'is_current' => true,
                'tds_percent' => 10.00, // 10,000
                'pf_percent' => 5.00,   // 5,000
                'esi_percent' => 1.50,  // 1,500
            ]
        );

        $this->actingAs($this->founder, 'sanctum');
        
        $response = $this->postJson('/api/v1/payroll/runs', [
            'year' => $year,
            'month' => $month,
            'notes' => 'Deductions Test Run',
        ]);

        $response->assertStatus(201);
        $runId = $response->json('id');

        $this->assertDatabaseHas('payroll_run_items', [
            'payroll_run_id' => $runId,
            'user_id' => $this->employee->id,
            'base_salary' => 100000.00,
            'deductions' => 16500.00, // 10k + 5k + 1.5k
            'net_salary' => 83500.00, // 100k - 16.5k
        ]);

        $item = PayrollRunItem::where('payroll_run_id', $runId)->where('user_id', $this->employee->id)->first();
        $this->assertEquals(10000.00, $item->breakdown['tds']);
        $this->assertEquals(5000.00, $item->breakdown['pf']);
        $this->assertEquals(1500.00, $item->breakdown['esi']);
    }

    public function test_my_history_endpoint(): void
    {
        $run = PayrollRun::create([
            'year' => 2026,
            'month' => 6,
            'status' => 'approved',
            'submitted_by' => $this->founder->id,
            'currency_id' => $this->inr->id,
            'total_gross' => 100000,
            'total_deductions' => 16500,
            'total_net' => 83500,
        ]);

        PayrollRunItem::create([
            'payroll_run_id' => $run->id,
            'user_id' => $this->employee->id,
            'base_salary' => 100000,
            'bonus_amount' => 0,
            'deductions' => 16500,
            'net_salary' => 83500,
            'hours_logged' => 160,
            'expected_hours' => 160,
            'utilization_rate' => 100,
            'breakdown' => [],
        ]);

        $this->actingAs($this->employee, 'sanctum');

        $response = $this->getJson('/api/v1/payroll/my-history');
        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $this->assertEquals($run->id, $response->json('data.0.payroll_run_id'));
    }

    public function test_download_payslip_endpoint(): void
    {
        $run = PayrollRun::create([
            'year' => 2026,
            'month' => 6,
            'status' => 'approved',
            'submitted_by' => $this->founder->id,
            'currency_id' => $this->inr->id,
            'total_gross' => 100000,
            'total_deductions' => 0,
            'total_net' => 100000,
        ]);

        $item = PayrollRunItem::create([
            'payroll_run_id' => $run->id,
            'user_id' => $this->employee->id,
            'base_salary' => 100000,
            'bonus_amount' => 0,
            'deductions' => 0,
            'net_salary' => 100000,
            'hours_logged' => 160,
            'expected_hours' => 160,
            'utilization_rate' => 100,
            'breakdown' => [],
        ]);

        $this->actingAs($this->employee, 'sanctum');

        $response = $this->get("/api/v1/payroll/items/{$item->id}/download-payslip");
        $response->assertStatus(200);
        $response->assertHeader('content-type', 'application/pdf');
    }

    public function test_export_csv_and_pdf_endpoints(): void
    {
        $run = PayrollRun::create([
            'year' => 2026,
            'month' => 6,
            'status' => 'approved',
            'submitted_by' => $this->founder->id,
            'currency_id' => $this->inr->id,
            'total_gross' => 100000,
            'total_deductions' => 0,
            'total_net' => 100000,
        ]);

        $this->actingAs($this->founder, 'sanctum');

        // CSV export
        $responseCsv = $this->get("/api/v1/payroll/runs/{$run->id}/export?format=csv");
        $responseCsv->assertStatus(200);
        $responseCsv->assertHeader('content-type', 'text/csv; charset=UTF-8');

        // PDF export
        $responsePdf = $this->get("/api/v1/payroll/runs/{$run->id}/export?format=pdf");
        $responsePdf->assertStatus(200);
        $responsePdf->assertHeader('content-type', 'application/pdf');
    }

    public function test_payroll_approval_sends_payslip_email_with_pdf(): void
    {
        Mail::fake();

        $run = PayrollRun::create([
            'year' => 2026,
            'month' => 6,
            'status' => 'draft',
            'submitted_by' => $this->founder->id,
            'currency_id' => $this->inr->id,
            'total_gross' => 100000,
            'total_deductions' => 0,
            'total_net' => 100000,
        ]);

        $item = PayrollRunItem::create([
            'payroll_run_id' => $run->id,
            'user_id' => $this->employee->id,
            'base_salary' => 100000,
            'bonus_amount' => 0,
            'deductions' => 0,
            'net_salary' => 100000,
            'hours_logged' => 160,
            'expected_hours' => 160,
            'utilization_rate' => 100,
            'breakdown' => [],
        ]);

        NotificationPreference::create([
            'user_id' => $this->employee->id,
            'event_type' => 'payroll_processed',
            'email' => true,
        ]);

        $this->actingAs($this->founder, 'sanctum');

        $response = $this->postJson("/api/v1/payroll/runs/{$run->id}/approve");
        $response->assertStatus(200);

        Mail::assertSent(PayslipMail::class, function ($mail) use ($run) {
            return $mail->hasTo($this->employee->email) &&
                   count($mail->attachments()) === 1;
        });
    }
}
