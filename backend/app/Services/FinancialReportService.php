<?php

declare(strict_types=1);

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class FinancialReportService
{
    /**
     * Database-agnostic "YYYY-MM" month-key expression.
     * The app runs on SQLite locally and PostgreSQL/MySQL in production —
     * to_char() is PostgreSQL-only and crashes the other drivers.
     */
    private function monthKeyExpression(string $column): string
    {
        return match (DB::connection()->getDriverName()) {
            'sqlite'          => "strftime('%Y-%m', {$column})",
            'mysql', 'mariadb' => "date_format({$column}, '%Y-%m')",
            default           => "to_char({$column}, 'YYYY-MM')",
        };
    }

    /**
     * Get revenue summary normalized to INR.
     *
     * @param Carbon $from
     * @param Carbon $to
     * @return array
     */
    public function getRevenueSummary(Carbon $from, Carbon $to): array
    {
        $revenueStatuses = ['approved', 'sent', 'paid', 'partially_paid', 'overdue'];

        // ── 1. Top-Level KPIs ────────────────────────────────────────────────
        $invoiceStats = DB::table('invoices')
            ->select(
                DB::raw('count(id) as invoice_count'),
                DB::raw("sum(case when status in ('" . implode("','", $revenueStatuses) . "') then total_amount * exchange_rate else 0 end) as total_invoiced"),
                DB::raw('sum(paid_amount * exchange_rate) as total_collected'),
                DB::raw('sum(due_amount * exchange_rate) as total_outstanding'),
                DB::raw('avg(total_amount * exchange_rate) as avg_invoice_value')
            )
            ->whereNull('deleted_at')
            ->whereBetween('issue_date', [$from->toDateString(), $to->toDateString()])
            ->first();

        $totalInvoiced = (float) ($invoiceStats->total_invoiced ?? 0.0);
        $totalCollected = (float) ($invoiceStats->total_collected ?? 0.0);
        $totalOutstanding = (float) ($invoiceStats->total_outstanding ?? 0.0);
        $invoiceCount = (int) ($invoiceStats->invoice_count ?? 0);
        $avgInvoiceValue = (float) ($invoiceStats->avg_invoice_value ?? 0.0);

        $collectionRatePct = $totalInvoiced > 0
            ? round(($totalCollected / $totalInvoiced) * 100, 2)
            : 0.00;

        // ── 2. Monthly Trend (last 12 months or range months) ──────────────────
        $trendResults = DB::table('invoices')
            ->select(
                DB::raw($this->monthKeyExpression('issue_date') . ' as month_key'),
                DB::raw("sum(case when status in ('" . implode("','", $revenueStatuses) . "') then total_amount * exchange_rate else 0 end) as invoiced_amount"),
                DB::raw('sum(paid_amount * exchange_rate) as collected_amount')
            )
            ->whereNull('deleted_at')
            ->whereBetween('issue_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('month_key')
            ->orderBy('month_key')
            ->get();

        // ── 3. Top Clients by Revenue (Top 5) ──────────────────────────────────
        $topClients = DB::table('invoices')
            ->join('users', 'invoices.client_id', '=', 'users.id')
            ->select(
                'users.id as client_id',
                'users.name as client_name',
                DB::raw("sum(case when invoices.status in ('" . implode("','", $revenueStatuses) . "') then invoices.total_amount * invoices.exchange_rate else 0 end) as total_billed"),
                DB::raw('sum(invoices.paid_amount * invoices.exchange_rate) as total_paid'),
                DB::raw('sum(invoices.due_amount * invoices.exchange_rate) as outstanding')
            )
            ->whereNull('invoices.deleted_at')
            ->whereBetween('invoices.issue_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('users.id', 'users.name')
            ->orderBy('total_billed', 'desc')
            ->limit(5)
            ->get();

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ],
            'summary' => [
                'total_invoiced' => round($totalInvoiced, 2),
                'total_collected' => round($totalCollected, 2),
                'total_outstanding' => round($totalOutstanding, 2),
                'collection_rate_pct' => $collectionRatePct,
                'invoice_count' => $invoiceCount,
                'avg_invoice_value' => round($avgInvoiceValue, 2),
            ],
            'trend' => $trendResults,
            'top_clients' => $topClients,
        ];
    }

    /**
     * Get expense breakdown normalized to INR.
     *
     * @param Carbon $from
     * @param Carbon $to
     * @return array
     */
    public function getExpenseBreakdown(Carbon $from, Carbon $to): array
    {
        // Join with currencies to get exchange_rate_to_inr
        $expenseStats = DB::table('expenses')
            ->join('currencies', 'expenses.currency_id', '=', 'currencies.id')
            ->select(
                DB::raw('count(expenses.id) as expense_count'),
                DB::raw('sum(expenses.amount * currencies.exchange_rate_to_inr) as total_submitted'),
                DB::raw("sum(case when expenses.status in ('approved', 'reimbursed') then expenses.amount * currencies.exchange_rate_to_inr else 0 end) as total_approved"),
                DB::raw("sum(case when expenses.status = 'submitted' then expenses.amount * currencies.exchange_rate_to_inr else 0 end) as total_pending"),
                DB::raw("sum(case when expenses.status = 'rejected' then expenses.amount * currencies.exchange_rate_to_inr else 0 end) as total_rejected")
            )
            ->whereNull('expenses.deleted_at')
            ->whereBetween('expenses.expense_date', [$from->toDateString(), $to->toDateString()])
            ->first();

        $totalSubmitted = (float) ($expenseStats->total_submitted ?? 0.0);
        $totalApproved = (float) ($expenseStats->total_approved ?? 0.0);
        $totalPending = (float) ($expenseStats->total_pending ?? 0.0);
        $totalRejected = (float) ($expenseStats->total_rejected ?? 0.0);
        $expenseCount = (int) ($expenseStats->expense_count ?? 0);

        // Breakdown by Category
        $byCategory = DB::table('expenses')
            ->join('expense_categories', 'expenses.category_id', '=', 'expense_categories.id')
            ->join('currencies', 'expenses.currency_id', '=', 'currencies.id')
            ->select(
                'expense_categories.name as category_name',
                'expense_categories.color as category_color',
                DB::raw('count(expenses.id) as count'),
                DB::raw('sum(expenses.amount * currencies.exchange_rate_to_inr) as total_amount')
            )
            ->whereNull('expenses.deleted_at')
            ->whereBetween('expenses.expense_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('expense_categories.name', 'expense_categories.color')
            ->get();

        // Breakdown by Project (Top 10)
        $byProject = DB::table('expenses')
            ->leftJoin('projects', 'expenses.project_id', '=', 'projects.id')
            ->join('currencies', 'expenses.currency_id', '=', 'currencies.id')
            ->select(
                DB::raw("coalesce(projects.name, 'Overhead / General') as project_name"),
                DB::raw('count(expenses.id) as count'),
                DB::raw('sum(expenses.amount * currencies.exchange_rate_to_inr) as total_amount')
            )
            ->whereNull('expenses.deleted_at')
            ->whereBetween('expenses.expense_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('project_name')
            ->orderBy('total_amount', 'desc')
            ->limit(10)
            ->get();

        // Breakdown by Vendor (Top 5)
        $byVendor = DB::table('expenses')
            ->join('vendors', 'expenses.vendor_id', '=', 'vendors.id')
            ->join('currencies', 'expenses.currency_id', '=', 'currencies.id')
            ->select(
                'vendors.name as vendor_name',
                DB::raw('count(expenses.id) as count'),
                DB::raw('sum(expenses.amount * currencies.exchange_rate_to_inr) as total_amount')
            )
            ->whereNull('expenses.deleted_at')
            ->whereBetween('expenses.expense_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('vendors.name')
            ->orderBy('total_amount', 'desc')
            ->limit(5)
            ->get();

        // Monthly Trend
        $trend = DB::table('expenses')
            ->join('currencies', 'expenses.currency_id', '=', 'currencies.id')
            ->select(
                DB::raw($this->monthKeyExpression('expenses.expense_date') . ' as month_key'),
                DB::raw("sum(case when expenses.status in ('approved', 'reimbursed') then expenses.amount * currencies.exchange_rate_to_inr else 0 end) as approved_amount"),
                DB::raw('sum(expenses.amount * currencies.exchange_rate_to_inr) as submitted_amount')
            )
            ->whereNull('expenses.deleted_at')
            ->whereBetween('expenses.expense_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('month_key')
            ->orderBy('month_key')
            ->get();

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ],
            'summary' => [
                'total_submitted' => round($totalSubmitted, 2),
                'total_approved' => round($totalApproved, 2),
                'total_pending' => round($totalPending, 2),
                'total_rejected' => round($totalRejected, 2),
                'expense_count' => $expenseCount,
            ],
            'by_category' => $byCategory,
            'by_project' => $byProject,
            'by_vendor' => $byVendor,
            'trend' => $trend,
        ];
    }

    /**
     * Get payroll summary normalized to INR.
     *
     * @param Carbon $from
     * @param Carbon $to
     * @return array
     */
    public function getPayrollSummary(Carbon $from, Carbon $to): array
    {
        // Query approved/paid runs in the date range
        $payrollStats = DB::table('payroll_runs')
            ->join('currencies', 'payroll_runs.currency_id', '=', 'currencies.id')
            ->select(
                DB::raw('count(payroll_runs.id) as run_count'),
                DB::raw('sum(payroll_runs.total_gross * currencies.exchange_rate_to_inr) as total_gross'),
                DB::raw('sum(payroll_runs.total_deductions * currencies.exchange_rate_to_inr) as total_deductions'),
                DB::raw('sum(payroll_runs.total_net * currencies.exchange_rate_to_inr) as total_net')
            )
            ->whereNull('payroll_runs.deleted_at')
            ->whereIn('payroll_runs.status', ['approved', 'processed', 'paid'])
            ->whereBetween('payroll_runs.created_at', [$from->startOfDay(), $to->endOfDay()])
            ->first();

        // Calculate bonuses paid in range
        $bonusTotal = DB::table('bonuses')
            ->where('status', 'paid')
            ->whereBetween('effective_date', [$from->toDateString(), $to->toDateString()])
            ->sum('amount');

        $totalGross = (float) ($payrollStats->total_gross ?? 0.0);
        $totalDeductions = (float) ($payrollStats->total_deductions ?? 0.0);
        $totalNet = (float) ($payrollStats->total_net ?? 0.0);
        $runCount = (int) ($payrollStats->run_count ?? 0);

        // Runs list
        $byMonth = DB::table('payroll_runs')
            ->join('currencies', 'payroll_runs.currency_id', '=', 'currencies.id')
            ->select(
                'payroll_runs.year',
                'payroll_runs.month',
                'payroll_runs.run_number',
                'payroll_runs.status',
                DB::raw('payroll_runs.total_gross * currencies.exchange_rate_to_inr as total_gross'),
                DB::raw('payroll_runs.total_net * currencies.exchange_rate_to_inr as total_net'),
                DB::raw('(select count(*) from payroll_run_items where payroll_run_items.payroll_run_id = payroll_runs.id) as employee_count')
            )
            ->whereNull('payroll_runs.deleted_at')
            ->whereBetween('payroll_runs.created_at', [$from->startOfDay(), $to->endOfDay()])
            ->orderBy('payroll_runs.year', 'desc')
            ->orderBy('payroll_runs.month', 'desc')
            ->get();

        // Top earners in period
        $topEarners = DB::table('payroll_run_items')
            ->join('payroll_runs', 'payroll_run_items.payroll_run_id', '=', 'payroll_runs.id')
            ->join('users', 'payroll_run_items.user_id', '=', 'users.id')
            ->join('currencies', 'payroll_runs.currency_id', '=', 'currencies.id')
            ->select(
                'users.name as user_name',
                DB::raw('sum(payroll_run_items.net_salary * currencies.exchange_rate_to_inr) as net_salary'),
                DB::raw('sum(payroll_run_items.base_salary * currencies.exchange_rate_to_inr) as base_salary'),
                DB::raw("sum(coalesce((select sum(amount) from bonuses where bonuses.user_id = users.id and bonuses.status = 'paid' and bonuses.effective_date between '" . $from->toDateString() . "' and '" . $to->toDateString() . "'), 0)) as bonus_amount")
            )
            ->whereNull('payroll_runs.deleted_at')
            ->whereIn('payroll_runs.status', ['approved', 'processed', 'paid'])
            ->whereBetween('payroll_runs.created_at', [$from->startOfDay(), $to->endOfDay()])
            ->groupBy('users.id', 'users.name')
            ->orderBy('net_salary', 'desc')
            ->limit(5)
            ->get();

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ],
            'summary' => [
                'total_gross' => round($totalGross, 2),
                'total_net' => round($totalNet, 2),
                'total_deductions' => round($totalDeductions, 2),
                'total_bonuses' => round((float) $bonusTotal, 2),
                'run_count' => $runCount,
            ],
            'by_month' => $byMonth,
            'top_earners' => $topEarners,
        ];
    }

    /**
     * Get client 360 summary.
     *
     * @param Carbon $from
     * @param Carbon $to
     * @return array
     */
    public function getClientSummary(Carbon $from, Carbon $to): array
    {
        $revenueStatuses = ['approved', 'sent', 'paid', 'partially_paid', 'overdue'];

        // Get all clients (users with client role)
        // Spatie roles check: join model_has_roles and roles
        $clientsQuery = DB::table('users')
            ->join('model_has_roles', 'users.id', '=', 'model_has_roles.model_id')
            ->join('roles', 'model_has_roles.role_id', '=', 'roles.id')
            ->where('roles.name', 'client')
            ->where('model_has_roles.model_type', 'App\Models\User')
            ->whereNull('users.deleted_at')
            ->select('users.id', 'users.name', 'users.email', 'users.phone', 'users.status', 'users.is_client_portal_user');

        $clients = $clientsQuery->get();
        $clientIds = $clients->pluck('id')->toArray();

        // ── 1. Batch project stats ───────────────────────────────────────────
        $projectsStatsMap = DB::table('projects')
            ->select(
                'client_id',
                DB::raw('count(id) as total_projects'),
                DB::raw("sum(case when status in ('active', 'in_progress') then 1 else 0 end) as active_projects"),
                DB::raw("sum(case when status = 'on_hold' then 1 else 0 end) as on_hold_projects"),
                DB::raw("sum(case when status = 'cancelled' then 1 else 0 end) as cancelled_projects")
            )
            ->whereIn('client_id', $clientIds)
            ->whereNull('deleted_at')
            ->groupBy('client_id')
            ->get()
            ->keyBy('client_id');

        // ── 2. Batch invoices stats in date range ────────────────────────────
        $invoiceStatsMap = DB::table('invoices')
            ->select(
                'client_id',
                DB::raw("sum(case when status in ('" . implode("','", $revenueStatuses) . "') then total_amount * exchange_rate else 0 end) as total_billed"),
                DB::raw("sum(case when status in ('" . implode("','", $revenueStatuses) . "') then paid_amount * exchange_rate else 0 end) as total_paid"),
                DB::raw("sum(case when status in ('" . implode("','", $revenueStatuses) . "') then due_amount * exchange_rate else 0 end) as total_outstanding"),
                DB::raw('max(issue_date) as last_invoice_date')
            )
            ->whereIn('client_id', $clientIds)
            ->whereNull('deleted_at')
            ->whereBetween('issue_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('client_id')
            ->get()
            ->keyBy('client_id');

        // ── 3. Batch global overdue count ──────────────────────────────────
        $overdueInvoicesMap = DB::table('invoices')
            ->select('client_id', DB::raw('count(id) as overdue_count'))
            ->whereIn('client_id', $clientIds)
            ->whereNull('deleted_at')
            ->where('status', 'overdue')
            ->groupBy('client_id')
            ->get()
            ->keyBy('client_id');

        // ── 4. Batch last payment date ───────────────────────────────────────
        $lastPaymentMap = DB::table('payments')
            ->join('invoices', 'payments.invoice_id', '=', 'invoices.id')
            ->select('invoices.client_id', DB::raw('max(payments.payment_date) as last_payment_date'))
            ->whereIn('invoices.client_id', $clientIds)
            ->whereNull('payments.deleted_at')
            ->whereBetween('payments.payment_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('invoices.client_id')
            ->get()
            ->keyBy('client_id');

        $breakdown = [];
        $totalBilledAll = 0.0;
        $totalPaidAll = 0.0;
        $totalOutstandingAll = 0.0;
        $activeClientsCount = 0;

        foreach ($clients as $client) {
            $cId = $client->id;

            // Resolve project stats
            $projStats = $projectsStatsMap->get($cId);
            $totalProjects = (int) ($projStats->total_projects ?? 0);
            $activeProjects = (int) ($projStats->active_projects ?? 0);
            $onHoldProjects = (int) ($projStats->on_hold_projects ?? 0);
            $cancelledProjects = (int) ($projStats->cancelled_projects ?? 0);

            if ($activeProjects > 0) {
                $activeClientsCount++;
            }

            // Resolve invoice stats
            $invStats = $invoiceStatsMap->get($cId);
            $totalBilled = (float) ($invStats->total_billed ?? 0.0);
            $totalPaid = (float) ($invStats->total_paid ?? 0.0);
            $totalOutstanding = (float) ($invStats->total_outstanding ?? 0.0);
            $lastInvoiceDate = $invStats ? $invStats->last_invoice_date : null;

            // Resolve last payment date
            $payStats = $lastPaymentMap->get($cId);
            $lastPaymentDate = $payStats ? $payStats->last_payment_date : null;

            $totalBilledAll += $totalBilled;
            $totalPaidAll += $totalPaid;
            $totalOutstandingAll += $totalOutstanding;

            // Resolve overdue count
            $overdueStats = $overdueInvoicesMap->get($cId);
            $overdueInvoicesCount = (int) ($overdueStats->overdue_count ?? 0);

            // Health Score calculation
            $healthScore = 100;
            $healthScore -= ($overdueInvoicesCount * 10);
            $healthScore -= ($onHoldProjects * 15);
            $healthScore -= ($cancelledProjects * 30);
            if ($totalBilled > 0) {
                $healthScore -= (int) round(($totalOutstanding / $totalBilled) * 20);
            }
            $healthScore = max(0, min(100, (int) $healthScore));

            $breakdown[] = [
                'client_id' => $cId,
                'client_name' => $client->name,
                'client_email' => $client->email,
                'phone' => $client->phone,
                'status' => $client->status,
                'is_client_portal_user' => (bool) $client->is_client_portal_user,
                'health_score' => $healthScore,
                'active_projects' => $activeProjects,
                'total_projects' => $totalProjects,
                'total_billed' => round($totalBilled, 2),
                'total_paid' => round($totalPaid, 2),
                'total_outstanding' => round($totalOutstanding, 2),
                'last_invoice_date' => $lastInvoiceDate,
                'last_payment_date' => $lastPaymentDate,
            ];
        }

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ],
            'summary' => [
                'total_clients' => $clients->count(),
                'total_active' => $activeClientsCount,
                'total_billed' => round($totalBilledAll, 2),
                'total_collected' => round($totalPaidAll, 2),
                'total_outstanding' => round($totalOutstandingAll, 2),
            ],
            'breakdown' => $breakdown,
        ];
    }
}
