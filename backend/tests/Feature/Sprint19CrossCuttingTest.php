<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Currency;
use App\Models\Invoice;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\NotificationPreference;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Cross-cutting completion (Sprint 19): the overdue-invoice sweep, the
 * notification trio (lead_assigned / invoice_overdue / payment_received) with
 * preference gating, leave→attendance linkage, and the task-template layer
 * (apply + monthly recurring generation).
 */
class Sprint19CrossCuttingTest extends TestCase
{
    use RefreshDatabase;

    private User $founder;
    private Currency $inr;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->founder = User::where('email', 'founder@creativals.com')->first();
        $this->inr = Currency::where('code', 'INR')->first();
    }

    private function makeInvoice(array $overrides = []): Invoice
    {
        static $n = 0;
        $n++;
        return Invoice::create(array_merge([
            'invoice_number' => 'INV-G-' . $n . '-' . uniqid(),
            'title' => 'Cross-cutting fixture',
            'client_id' => $this->founder->id,
            'created_by' => $this->founder->id,
            'currency_id' => $this->inr->id,
            'exchange_rate' => 1,
            'status' => 'sent',
            'issue_date' => now()->subDays(40)->toDateString(),
            'due_date' => now()->subDays(10)->toDateString(),
            'subtotal' => 1000,
            'tax_amount' => 0,
            'total_amount' => 1000,
            'paid_amount' => 0,
            'due_amount' => 1000,
        ], $overrides));
    }

    public function test_overdue_sweep_flips_and_notifies(): void
    {
        $pastDue = $this->makeInvoice();
        $notDue = $this->makeInvoice(['due_date' => now()->addDays(10)->toDateString()]);
        $draft = $this->makeInvoice(['status' => 'draft', 'due_date' => now()->subDays(10)->toDateString()]);

        Artisan::call('invoices:mark-overdue');

        $this->assertSame('overdue', $pastDue->fresh()->status);
        $this->assertSame('sent', $notDue->fresh()->status);
        $this->assertSame('draft', $draft->fresh()->status, 'drafts are not billed and must never flip');

        // In-app alert reached the invoice owner (in_app defaults on)
        $this->assertDatabaseHas('alerts', [
            'user_id' => $this->founder->id,
            'type' => 'invoice_overdue',
        ]);
    }

    public function test_overdue_alert_respects_in_app_opt_out(): void
    {
        NotificationPreference::create([
            'user_id' => $this->founder->id,
            'event_type' => 'invoice_overdue',
            'in_app' => false,
            'email' => false,
            'push' => false,
        ]);
        $this->makeInvoice();

        Artisan::call('invoices:mark-overdue');

        $this->assertDatabaseMissing('alerts', [
            'user_id' => $this->founder->id,
            'type' => 'invoice_overdue',
        ]);
    }

    public function test_payment_received_notifies_owner_with_email_opt_in(): void
    {
        Mail::fake();

        $finance = User::factory()->create(['email' => 'g-finance@creativals.com', 'status' => 'active']);
        $finance->assignRole('finance');

        NotificationPreference::create([
            'user_id' => $this->founder->id,
            'event_type' => 'payment_received',
            'in_app' => true,
            'email' => true,
            'push' => false,
        ]);

        $invoice = $this->makeInvoice();

        // A different user (finance) records the payment → owner is notified
        $this->actingAs($finance, 'sanctum')
            ->postJson("/api/v1/invoices/{$invoice->id}/payments", [
                'amount' => 400,
                'payment_date' => now()->toDateString(),
                'payment_method' => 'bank_transfer',
            ])
            ->assertStatus(201);

        $this->assertDatabaseHas('alerts', [
            'user_id' => $this->founder->id,
            'type' => 'payment_received',
        ]);
        Mail::assertQueued(\App\Mail\PaymentReceivedMail::class);
    }

    public function test_lead_assignment_email_is_opt_in(): void
    {
        Mail::fake();

        $exec = User::factory()->create(['email' => 'g-exec@creativals.com', 'status' => 'active']);
        $exec->assignRole('sales_exec');

        // Without a saved preference: alert yes (default on), email no (opt-in)
        \App\Models\Lead::create([
            'company_name' => 'NoMail Co',
            'created_by' => $this->founder->id,
            'sales_exec_id' => $exec->id,
            'priority' => 'medium',
            'temperature' => 'warm',
        ]);
        $this->assertDatabaseHas('alerts', ['user_id' => $exec->id, 'type' => 'lead_assigned']);
        Mail::assertNotQueued(\App\Mail\LeadAssignedMail::class);

        // With email enabled: mail queued
        NotificationPreference::create([
            'user_id' => $exec->id,
            'event_type' => 'lead_assigned',
            'in_app' => true,
            'email' => true,
            'push' => false,
        ]);
        \App\Models\Lead::create([
            'company_name' => 'YesMail Co',
            'created_by' => $this->founder->id,
            'sales_exec_id' => $exec->id,
            'priority' => 'medium',
            'temperature' => 'warm',
        ]);
        Mail::assertQueued(\App\Mail\LeadAssignedMail::class);
    }

    public function test_approved_leave_creates_attendance_without_overwriting(): void
    {
        $employee = User::factory()->create(['email' => 'g-leave@creativals.com', 'status' => 'active']);
        $employee->assignRole('employee');

        // HR already set day 1 as 'present' — that must survive
        $day1 = now()->addDays(3)->toDateString();
        $day2 = now()->addDays(4)->toDateString();
        AttendanceRecord::create(['user_id' => $employee->id, 'date' => $day1, 'status' => 'present']);

        $type = LeaveType::first() ?? LeaveType::create(['name' => 'Casual Leave', 'code' => 'CL', 'days_allowed' => 12]);
        $leave = LeaveRequest::create([
            'user_id' => $employee->id,
            'leave_type_id' => $type->id,
            'start_date' => $day1,
            'end_date' => $day2,
            'days_count' => 2,
            'reason' => 'Family event',
            'status' => 'pending',
        ]);

        $this->actingAs($this->founder, 'sanctum')
            ->postJson("/api/v1/leave/requests/{$leave->id}/approve")
            ->assertStatus(200);

        $this->assertDatabaseHas('attendance_records', ['user_id' => $employee->id, 'date' => $day1 . ' 00:00:00', 'status' => 'present']);
        $this->assertDatabaseHas('attendance_records', ['user_id' => $employee->id, 'date' => $day2 . ' 00:00:00', 'status' => 'leave']);
    }

    public function test_task_template_apply_and_monthly_recurring_generation(): void
    {
        // Template CRUD is gated on projects.create — a plain employee 403s
        $employee = User::factory()->create(['email' => 'g-emp@creativals.com', 'status' => 'active']);
        $employee->assignRole('employee');
        $this->actingAs($employee, 'sanctum')
            ->postJson('/api/v1/task-templates', ['name' => 'Nope', 'items' => [['title' => 'X']]])
            ->assertStatus(403);

        $res = $this->actingAs($this->founder, 'sanctum')
            ->postJson('/api/v1/task-templates', [
                'name' => 'Monthly SEO',
                'items' => [
                    ['title' => 'Audit'],
                    ['title' => 'Keyword Research'],
                    ['title' => 'On-page Optimization'],
                    ['title' => 'Reporting'],
                ],
            ])
            ->assertStatus(201)
            ->json();
        $templateId = $res['data']['id'];

        $project = Project::create([
            'project_number' => 'PRJ-G-SEO',
            'name' => 'SEO Retainer',
            'client_id' => $this->founder->id,
            'manager_id' => $this->founder->id,
            'status' => 'active',
            'is_recurring' => true,
        ]);

        // Apply creates the 4 tasks and links the recurring template
        $this->actingAs($this->founder, 'sanctum')
            ->postJson("/api/v1/projects/{$project->id}/apply-template", [
                'template_id' => $templateId,
                'set_as_recurring_template' => true,
            ])
            ->assertStatus(201);
        $this->assertSame(4, Task::where('project_id', $project->id)->count());
        $this->assertSame($templateId, $project->fresh()->task_template_id);

        // The monthly command is idempotent per calendar month: tasks were
        // already created from this template this month, so nothing doubles.
        Artisan::call('projects:generate-recurring-tasks');
        $this->assertSame(4, Task::where('project_id', $project->id)->count());

        // Simulate the tasks having been created last month → the run generates
        Task::where('project_id', $project->id)->update(['created_at' => now()->subMonthNoOverflow()->startOfMonth()]);
        Artisan::call('projects:generate-recurring-tasks');
        $this->assertSame(8, Task::where('project_id', $project->id)->count());
    }

    public function test_invoice_detail_exposes_approvals_timeline(): void
    {
        $invoice = $this->makeInvoice(['status' => 'draft']);
        \App\Models\InvoiceApproval::create([
            'invoice_id' => $invoice->id,
            'action' => 'submitted',
            'actor_id' => $this->founder->id,
            'notes' => 'Ready for review',
        ]);

        $data = $this->actingAs($this->founder, 'sanctum')
            ->getJson("/api/v1/invoices/{$invoice->id}")
            ->assertStatus(200)
            ->json();
        $inv = $data['data'] ?? $data;

        $this->assertNotEmpty($inv['approvals']);
        $this->assertSame('submitted', $inv['approvals'][0]['action']);
        $this->assertSame($this->founder->name, $inv['approvals'][0]['actor']['name']);
    }
}
