<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Quote;
use App\Models\User;
use App\Services\FinancialReportService;
use App\Services\LeadReportService;
use App\Services\ProfitabilityService;
use App\Services\UtilisationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    protected FinancialReportService $financialService;
    protected LeadReportService $leadService;
    protected ProfitabilityService $profitabilityService;
    protected UtilisationService $utilisationService;

    public function __construct(
        FinancialReportService $financialService,
        LeadReportService $leadService,
        ProfitabilityService $profitabilityService,
        UtilisationService $utilisationService
    ) {
        $this->financialService = $financialService;
        $this->leadService = $leadService;
        $this->profitabilityService = $profitabilityService;
        $this->utilisationService = $utilisationService;
    }

    /**
     * Helper to get standard date range (Indian Financial Year default).
     */
    protected function getDateRange(Request $request): array
    {
        $now = Carbon::now();
        // Indian FY: Apr 1 -> Mar 31
        if ($now->month >= 4) {
            $defaultFrom = Carbon::create($now->year, 4, 1)->startOfDay();
            $defaultTo = Carbon::create($now->year + 1, 3, 31)->endOfDay();
        } else {
            $defaultFrom = Carbon::create($now->year - 1, 4, 1)->startOfDay();
            $defaultTo = Carbon::create($now->year, 3, 31)->endOfDay();
        }

        $from = $request->input('from') ? Carbon::parse($request->input('from'))->startOfDay() : $defaultFrom;
        $to = $request->input('to') ? Carbon::parse($request->input('to'))->endOfDay() : $defaultTo;

        return [$from, $to];
    }

    /**
     * Helper to stream CSV response.
     */
    protected function streamCsv(array $headers, array $rows, string $filename): StreamedResponse
    {
        $callback = function () use ($headers, $rows) {
            $file = fopen('php://output', 'w');
            fputcsv($file, $headers);
            foreach ($rows as $row) {
                fputcsv($file, (array) $row);
            }
            fclose($file);
        };

        return response()->stream($callback, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    /**
     * 1. Revenue Summary Report
     * Route: GET /api/v1/reports/revenue
     */
    public function revenueSummary(Request $request)
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('reports.view_financial')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($request->input('export') === 'csv') {
            list($from, $to) = $this->getDateRange($request);
            $data = $this->financialService->getRevenueSummary($from, $to);
            $headers = ['Month Key', 'Invoiced Amount (INR)', 'Collected Amount (INR)'];
            $rows = [];
            foreach ($data['trend'] as $t) {
                $rows[] = [$t->month_key, $t->invoiced_amount, $t->collected_amount];
            }
            return $this->streamCsv($headers, $rows, 'revenue_summary_report.csv');
        }

        $cacheKey = 'report_revenue_' . $user->id . '_' . md5(json_encode($request->all()));
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60, function () use ($request) {
            list($from, $to) = $this->getDateRange($request);
            return $this->financialService->getRevenueSummary($from, $to);
        });

        return response()->json($data);
    }

    /**
     * 2. Sales Pipeline Report
     * Route: GET /api/v1/reports/pipeline
     */
    public function salesPipeline(Request $request)
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('reports.view_sales')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($request->input('export') === 'csv') {
            list($from, $to) = $this->getDateRange($request);
            $dateType = $request->input('lead_date_type', 'created');
            $data = $this->leadService->getPipelineSummary($from, $to, $dateType);
            $headers = ['Stage Name', 'Lead Count', 'Total Budget (INR)'];
            $rows = [];
            foreach ($data['by_stage'] as $s) {
                $rows[] = [$s->stage_name, $s->lead_count, $s->total_budget];
            }
            return $this->streamCsv($headers, $rows, 'sales_pipeline_report.csv');
        }

        $cacheKey = 'report_pipeline_' . $user->id . '_' . md5(json_encode($request->all()));
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60, function () use ($request) {
            list($from, $to) = $this->getDateRange($request);
            $dateType = $request->input('lead_date_type', 'created');
            return $this->leadService->getPipelineSummary($from, $to, $dateType);
        });

        return response()->json($data);
    }

    /**
     * 3. Quote Conversion Report
     * Route: GET /api/v1/reports/quotes
     */
    public function quoteConversion(Request $request)
    {
        $user = $request->user();
        if (!$user->hasAnyPermission(['reports.view_sales', 'reports.view_financial'])) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($request->input('export') === 'csv') {
            list($from, $to) = $this->getDateRange($request);
            $data = $this->getQuoteConversionData($from, $to);
            $headers = ['Stage', 'Count'];
            return $this->streamCsv($headers, $data['funnel'], 'quote_conversion_funnel.csv');
        }

        $cacheKey = 'report_quotes_' . $user->id . '_' . md5(json_encode($request->all()));
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60, function () use ($request) {
            list($from, $to) = $this->getDateRange($request);
            return $this->getQuoteConversionData($from, $to);
        });

        return response()->json($data);
    }

    protected function getQuoteConversionData(Carbon $from, Carbon $to): array
    {
        // Calculate quote KPIs
        $quoteStats = DB::table('quotes')
            ->select(
                DB::raw('count(id) as total_quotes'),
                DB::raw("sum(case when status = 'draft' then 1 else 0 end) as draft_count"),
                DB::raw("sum(case when status = 'pending' then 1 else 0 end) as pending_count"),
                DB::raw("sum(case when status = 'approved' then 1 else 0 end) as approved_count"),
                DB::raw("sum(case when status = 'sent' then 1 else 0 end) as sent_count"),
                DB::raw("sum(case when status = 'converted' then 1 else 0 end) as won_count"),
                DB::raw("sum(case when status = 'rejected' then 1 else 0 end) as rejected_count"),
                DB::raw('avg(total_amount) as avg_quote_value'),
                DB::raw("sum(case when status in ('approved', 'sent', 'converted') then total_amount else 0 end) as total_quote_value")
            )
            ->whereNull('deleted_at')
            ->whereBetween('created_at', [$from->startOfDay(), $to->endOfDay()])
            ->first();

        $totalQuotes = (int) ($quoteStats->total_quotes ?? 0);
        $wonCount = (int) ($quoteStats->won_count ?? 0);
        $rejectedCount = (int) ($quoteStats->rejected_count ?? 0);

        $winRatePct = ($wonCount + $rejectedCount) > 0
            ? round(($wonCount / ($wonCount + $rejectedCount)) * 100, 2)
            : 0.00;

        $funnel = [
            ['stage' => 'Draft', 'count' => (int) ($quoteStats->draft_count ?? 0)],
            ['stage' => 'Pending Approval', 'count' => (int) ($quoteStats->pending_count ?? 0)],
            ['stage' => 'Approved', 'count' => (int) ($quoteStats->approved_count ?? 0)],
            ['stage' => 'Sent', 'count' => (int) ($quoteStats->sent_count ?? 0)],
            ['stage' => 'Won', 'count' => $wonCount],
            ['stage' => 'Rejected', 'count' => $rejectedCount],
        ];

        // Top Services by Quote count/value
        $topServices = DB::table('quote_items')
            ->join('quotes', 'quote_items.quote_id', '=', 'quotes.id')
            ->select(
                'quote_items.description as service_name',
                DB::raw('count(quotes.id) as quote_count'),
                DB::raw('sum(quote_items.total_amount) as total_value')
            )
            ->whereNull('quotes.deleted_at')
            ->whereBetween('quotes.created_at', [$from->startOfDay(), $to->endOfDay()])
            ->groupBy('quote_items.description')
            ->orderBy('total_value', 'desc')
            ->limit(5)
            ->get();

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ],
            'summary' => [
                'total_quotes' => $totalQuotes,
                'draft_count' => (int) ($quoteStats->draft_count ?? 0),
                'pending_count' => (int) ($quoteStats->pending_count ?? 0),
                'approved_count' => (int) ($quoteStats->approved_count ?? 0),
                'sent_count' => (int) ($quoteStats->sent_count ?? 0),
                'won_count' => $wonCount,
                'rejected_count' => $rejectedCount,
                'win_rate_pct' => $winRatePct,
                'avg_quote_value' => round((float) ($quoteStats->avg_quote_value ?? 0.0), 2),
                'total_quote_value' => round((float) ($quoteStats->total_quote_value ?? 0.0), 2),
            ],
            'funnel' => $funnel,
            'top_services' => $topServices,
        ];
    }

    /**
     * 4. Project Profitability Report
     * Route: GET /api/v1/reports/profitability
     */
    public function projectProfitability(Request $request)
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('reports.view_financial') && !$user->hasRole('project_manager')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $cacheKey = 'report_profitability_' . $user->id . '_' . md5(json_encode($request->all()));
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60, function () use ($request, $user) {
            list($from, $to) = $this->getDateRange($request);

            // PM is scoped to their own managed projects. Only the actual
            // all-access financial permission should bypass this — plain
            // 'reports.view' (which every PM holds, just to see the Reports nav
            // item at all) previously satisfied this check too, so the scoping
            // below never actually applied and every PM saw every project's
            // revenue/cost/profit figures, not just their own.
            $projectsQuery = Project::query();
            if (!$user->hasPermissionTo('reports.view_financial') && $user->hasRole('project_manager')) {
                $projectsQuery->where('manager_id', $user->id);
            }

            // A project is "in scope" for the period if it was active at any
            // point during it, not only if it happened to start inside the
            // window — otherwise an ongoing multi-month project silently drops
            // out of every report except the one covering its start date, even
            // though its timesheets/expenses for this period are real costs.
            $projectsQuery->where(function ($q) use ($to) {
                $q->whereNull('start_date')->orWhere('start_date', '<=', $to->toDateString());
            })->where(function ($q) use ($from) {
                $q->whereNull('end_date')->orWhere('end_date', '>=', $from->toDateString());
            });
            $projects = $projectsQuery->with(['client', 'manager', 'invoice'])->get();
            $projectIds = $projects->pluck('id')->toArray();

            // ── 1. Batch load timesheets grouped by project ──────────────────────
            $timesheetsGrouped = DB::table('timesheets')
                ->whereIn('project_id', $projectIds)
                ->whereIn('status', ['submitted', 'approved'])
                ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
                ->whereNull('deleted_at')
                ->get()
                ->groupBy('project_id');

            // ── 2. Batch load expenses sum grouped by project ────────────────────
            $expensesSumMap = DB::table('expenses')
                ->select('project_id', DB::raw('sum(amount) as total_expenses'))
                ->whereIn('project_id', $projectIds)
                ->whereIn('status', ['approved', 'reimbursed'])
                ->whereBetween('expense_date', [$from->toDateString(), $to->toDateString()])
                ->whereNull('deleted_at')
                ->groupBy('project_id')
                ->get()
                ->keyBy('project_id');

            // ── 3. Batch load user hourly rates ──────────────────────────────────
            $userHourlyRates = User::with('compensation')->get()->mapWithKeys(function ($u) {
                return [$u->id => $u->hourly_rate];
            })->toArray();

            $breakdown = [];
            $totalRevenue = 0.0;
            $totalLabor = 0.0;
            $totalExpenses = 0.0;
            $totalCost = 0.0;
            $totalProfit = 0.0;

            foreach ($projects as $proj) {
                $pId = $proj->id;
                $preTimesheets = $timesheetsGrouped->get($pId, collect([]));
                $preExpensesSum = (float) ($expensesSumMap->get($pId)->total_expenses ?? 0.0);

                $profit = $this->profitabilityService->calculate(
                    $proj,
                    $from,
                    $to,
                    $preTimesheets,
                    $preExpensesSum,
                    $userHourlyRates
                );
                $breakdown[] = $profit;

                $totalRevenue += $profit['revenue'];
                $totalLabor += $profit['labor_cost'];
                $totalExpenses += $profit['expense_cost'];
                $totalCost += $profit['total_cost'];
                $totalProfit += $profit['net_profit'];
            }

            $avgMarginPct = $totalRevenue > 0
                ? round(($totalProfit / $totalRevenue) * 100, 2)
                : 0.00;

            return [
                'period' => [
                    'from' => $from->toDateString(),
                    'to' => $to->toDateString(),
                ],
                'summary' => [
                    'project_count' => $projects->count(),
                    'total_revenue' => round($totalRevenue, 2),
                    'total_labor_cost' => round($totalLabor, 2),
                    'total_expense_cost' => round($totalExpenses, 2),
                    'total_net_profit' => round($totalProfit, 2),
                    'avg_margin_pct' => $avgMarginPct,
                ],
                'breakdown' => $breakdown,
            ];
        });

        if ($request->input('export') === 'csv') {
            $headers = ['Project Name', 'Project Number', 'Status', 'Revenue', 'Labor Cost', 'Expense Cost', 'Net Profit', 'Margin %'];
            $rows = [];
            foreach ($data['breakdown'] as $row) {
                $rows[] = [
                    $row['project_name'],
                    $row['project_number'],
                    $row['status'],
                    $row['revenue'],
                    $row['labor_cost'],
                    $row['expense_cost'],
                    $row['net_profit'],
                    $row['margin_percentage'],
                ];
            }
            return $this->streamCsv($headers, $rows, 'project_profitability_report.csv');
        }

        return response()->json($data);
    }

    /**
     * 5. Team Utilisation Report
     * Route: GET /api/v1/reports/utilisation
     */
    public function teamUtilisation(Request $request)
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('reports.view_hr') && !$user->hasRole('project_manager')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $cacheKey = 'report_utilisation_' . $user->id . '_' . md5(json_encode($request->all()));
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60, function () use ($request, $user) {
            list($from, $to) = $this->getDateRange($request);

            // Query active users with timesheets
            $usersQuery = User::query()->where('status', 'active')->where('is_client_portal_user', false);

            // PM can only view users in their team (users who logged timesheets on projects managed by the PM)
            if (!$user->hasPermissionTo('reports.view_hr') && $user->hasRole('project_manager')) {
                $pmProjectUserIds = DB::table('timesheets')
                    ->join('projects', 'timesheets.project_id', '=', 'projects.id')
                    ->where('projects.manager_id', $user->id)
                    ->pluck('timesheets.user_id')
                    ->unique();
                $usersQuery->whereIn('id', $pmProjectUserIds);
            }

            $users = $usersQuery->with(['departments', 'compensation'])->get();
            $userIds = $users->pluck('id')->toArray();

            // ── 1. Batch load timesheets grouped by user ─────────────────────────
            $timesheetsGrouped = DB::table('timesheets')
                ->whereIn('user_id', $userIds)
                ->whereIn('status', ['submitted', 'approved'])
                ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
                ->whereNull('deleted_at')
                ->get()
                ->groupBy('user_id');

            $breakdown = [];
            $totalExpected = 0.0;
            $totalLogged = 0.0;
            $totalBillable = 0.0;

            foreach ($users as $u) {
                $uId = $u->id;
                $preTimesheets = $timesheetsGrouped->get($uId, collect([]));

                $util = $this->utilisationService->calculateForUser($u, $from, $to, $preTimesheets);
                if ($util['expected_hours'] > 0 || $util['logged_hours'] > 0) {
                    $breakdown[] = $util;
                    $totalExpected += $util['expected_hours'];
                    $totalLogged += $util['logged_hours'];
                    $totalBillable += $util['billable_hours'];
                }
            }

            $avgUtilisationPct = $totalExpected > 0
                ? round(($totalLogged / $totalExpected) * 100, 2)
                : 0.00;

            $billableRatePct = $totalLogged > 0
                ? round(($totalBillable / $totalLogged) * 100, 2)
                : 0.00;

            // Top Projects by hours
            $topProjects = DB::table('timesheets')
                ->join('projects', 'timesheets.project_id', '=', 'projects.id')
                ->select(
                    'projects.name as project_name',
                    DB::raw('sum(timesheets.hours_logged) as total_hours'),
                    DB::raw('sum(case when timesheets.is_billable = 1 then timesheets.hours_logged else 0 end) as billable_hours')
                )
                ->whereNull('timesheets.deleted_at')
                ->whereIn('timesheets.status', ['submitted', 'approved'])
                ->whereBetween('timesheets.date', [$from->toDateString(), $to->toDateString()])
                ->groupBy('projects.name')
                ->orderBy('total_hours', 'desc')
                ->limit(5)
                ->get();

            return [
                'period' => [
                    'from' => $from->toDateString(),
                    'to' => $to->toDateString(),
                ],
                'summary' => [
                    'team_size' => count($breakdown),
                    'total_logged_hours' => round($totalLogged, 2),
                    'total_billable_hours' => round($totalBillable, 2),
                    'billable_rate_pct' => $billableRatePct,
                    'avg_utilisation_pct' => $avgUtilisationPct,
                ],
                'breakdown' => $breakdown,
                'top_projects_by_hours' => $topProjects,
            ];
        });

        if ($request->input('export') === 'csv') {
            $headers = ['Employee Name', 'Department', 'Expected Hours', 'Logged Hours', 'Billable Hours', 'Utilisation %', 'Billable Rate %'];
            $rows = [];
            foreach ($data['breakdown'] as $row) {
                $rows[] = [
                    $row['user_name'],
                    $row['department'],
                    $row['expected_hours'],
                    $row['logged_hours'],
                    $row['billable_hours'],
                    $row['utilisation_pct'],
                    $row['billable_rate_pct'],
                ];
            }
            return $this->streamCsv($headers, $rows, 'team_utilisation_report.csv');
        }

        return response()->json($data);
    }

    /**
     * 6. Expense Breakdown Report
     * Route: GET /api/v1/reports/expenses
     */
    public function expenseBreakdown(Request $request)
    {
        $user = $request->user();
        if (!$user->hasPermissionTo('reports.view_financial')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($request->input('export') === 'csv') {
            list($from, $to) = $this->getDateRange($request);
            $data = $this->financialService->getExpenseBreakdown($from, $to);
            $headers = ['Category', 'Count', 'Total Amount (INR)'];
            $rows = [];
            foreach ($data['by_category'] as $c) {
                $rows[] = [$c->category_name, $c->count, $c->total_amount];
            }
            return $this->streamCsv($headers, $rows, 'expenses_by_category_report.csv');
        }

        $cacheKey = 'report_expenses_' . $user->id . '_' . md5(json_encode($request->all()));
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60, function () use ($request) {
            list($from, $to) = $this->getDateRange($request);
            return $this->financialService->getExpenseBreakdown($from, $to);
        });

        return response()->json($data);
    }

    /**
     * 7. Payroll Summary Report
     * Route: GET /api/v1/reports/payroll
     */
    public function payrollSummary(Request $request)
    {
        $user = $request->user();
        if (!$user->hasAnyPermission(['reports.view_hr', 'reports.view_financial'])) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($request->input('export') === 'csv') {
            list($from, $to) = $this->getDateRange($request);
            $data = $this->financialService->getPayrollSummary($from, $to);
            $headers = ['Payroll Run Number', 'Year', 'Month', 'Status', 'Total Gross (INR)', 'Total Net (INR)', 'Employee Count'];
            $rows = [];
            foreach ($data['by_month'] as $run) {
                $rows[] = [$run->run_number, $run->year, $run->month, $run->status, $run->total_gross, $run->total_net, $run->employee_count];
            }
            return $this->streamCsv($headers, $rows, 'payroll_summary_report.csv');
        }

        $cacheKey = 'report_payroll_' . $user->id . '_' . md5(json_encode($request->all()));
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60, function () use ($request) {
            list($from, $to) = $this->getDateRange($request);
            return $this->financialService->getPayrollSummary($from, $to);
        });

        return response()->json($data);
    }

    /**
     * 8. Client Summary Report
     * Route: GET /api/v1/reports/clients
     */
    public function clientSummary(Request $request)
    {
        $user = $request->user();
        if (!$user->hasAnyPermission(['reports.view_sales', 'reports.view_financial'])) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($request->input('export') === 'csv') {
            list($from, $to) = $this->getDateRange($request);
            $data = $this->financialService->getClientSummary($from, $to);
            $headers = ['Client Name', 'Client Email', 'Active Projects', 'Total Projects', 'Total Billed (INR)', 'Total Paid (INR)', 'Total Outstanding (INR)'];
            $rows = [];
            foreach ($data['breakdown'] as $row) {
                $rows[] = [
                    $row['client_name'],
                    $row['client_email'],
                    $row['active_projects'],
                    $row['total_projects'],
                    $row['total_billed'],
                    $row['total_paid'],
                    $row['total_outstanding'],
                ];
            }
            return $this->streamCsv($headers, $rows, 'client_summary_report.csv');
        }

        $cacheKey = 'report_clients_' . $user->id . '_' . md5(json_encode($request->all()));
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60, function () use ($request) {
            list($from, $to) = $this->getDateRange($request);
            return $this->financialService->getClientSummary($from, $to);
        });

        return response()->json($data);
    }

    /**
     * Consolidated Dashboard Overview
     * Route: GET /api/v1/reports/dashboard
     */
    public function dashboardOverview(Request $request)
    {
        $user = $request->user();
        
        // Use a short cache window (e.g. 60 seconds) to avoid CPU spikes
        // and instantly resolve subsequent page reloads/focus queries.
        $cacheKey = 'dashboard_overview_' . $user->id;
        
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60, function () use ($user) {
            $now = Carbon::now();
            
            // This Month range
            $thisMonthFrom = $now->copy()->startOfMonth();
            $thisMonthTo = $now->copy()->endOfMonth();
            
            // Last Month range
            $lastMonthFrom = $now->copy()->subMonth()->startOfMonth();
            $lastMonthTo = $now->copy()->subMonth()->endOfMonth();

            $dashboardData = [];

            // 1. Financial Overview
            $canViewFinancial = $user->hasRole('founder') || $user->hasRole('director') || $user->hasPermissionTo('reports.view_financial');
            
            $thisMonthRevenueData = null;
            $lastMonthRevenueData = null;
            $expensesData = null;
            $avgUtilisationPct = 0.0;
            $mostProfitableProjectName = 'None';
            $mostProfitableProjectMargin = 0.0;
            $mostProfitableProjectProfit = 0.0;
            
            if ($canViewFinancial) {
                $thisMonthRevenueData = $this->financialService->getRevenueSummary($thisMonthFrom, $thisMonthTo);
                $lastMonthRevenueData = $this->financialService->getRevenueSummary($lastMonthFrom, $lastMonthTo);
                $expensesData = $this->financialService->getExpenseBreakdown($thisMonthFrom, $thisMonthTo);
                
                $dashboardData['this_month_revenue'] = $thisMonthRevenueData;
                $dashboardData['last_month_revenue'] = $lastMonthRevenueData;
                $dashboardData['this_month_expenses'] = $expensesData;
                
                // Profitability summary
                $projectsQuery = Project::query()->whereBetween('start_date', [$thisMonthFrom->toDateString(), $thisMonthTo->toDateString()]);
                $projects = $projectsQuery->get();
                $projectIds = $projects->pluck('id')->toArray();
                
                // Prefetch profitability helper DB values to bypass N+1 inside loop
                $timesheetsGrouped = DB::table('timesheets')
                    ->whereIn('project_id', $projectIds)
                    ->whereIn('status', ['submitted', 'approved'])
                    ->whereBetween('date', [$thisMonthFrom->toDateString(), $thisMonthTo->toDateString()])
                    ->whereNull('deleted_at')
                    ->get()
                    ->groupBy('project_id');

                $expensesSumMap = DB::table('expenses')
                    ->select('project_id', DB::raw('sum(amount) as total_expenses'))
                    ->whereIn('project_id', $projectIds)
                    ->whereIn('status', ['approved', 'reimbursed'])
                    ->whereBetween('expense_date', [$thisMonthFrom->toDateString(), $thisMonthTo->toDateString()])
                    ->whereNull('deleted_at')
                    ->groupBy('project_id')
                    ->get()
                    ->keyBy('project_id');

                $userHourlyRates = User::with('compensation')->get()->mapWithKeys(function ($u) {
                    return [$u->id => $u->hourly_rate];
                })->toArray();

                $totalRevenue = 0.0;
                $totalLabor = 0.0;
                $totalExpenses = 0.0;
                $totalCost = 0.0;
                $totalProfit = 0.0;
                foreach ($projects as $proj) {
                    $pId = $proj->id;
                    $preTimesheets = $timesheetsGrouped->get($pId, collect([]));
                    $preExpensesSum = (float) ($expensesSumMap->get($pId)->total_expenses ?? 0.0);

                    $profit = $this->profitabilityService->calculate(
                        $proj,
                        $thisMonthFrom,
                        $thisMonthTo,
                        $preTimesheets,
                        $preExpensesSum,
                        $userHourlyRates
                    );
                    $totalRevenue += $profit['revenue'];
                    $totalLabor += $profit['labor_cost'];
                    $totalExpenses += $profit['expense_cost'];
                    $totalCost += $profit['total_cost'];
                    $totalProfit += $profit['net_profit'];
                }
                $avgMarginPct = $totalRevenue > 0 ? round(($totalProfit / $totalRevenue) * 100, 2) : 0.00;
                $dashboardData['this_month_profitability'] = [
                    'summary' => [
                        'project_count' => $projects->count(),
                        'total_revenue' => round($totalRevenue, 2),
                        'total_labor_cost' => round($totalLabor, 2),
                        'total_expense_cost' => round($totalExpenses, 2),
                        'total_net_profit' => round($totalProfit, 2),
                        'avg_margin_pct' => $avgMarginPct,
                    ]
                ];
            }

            // 2. Sales & CRM
            $canViewSales = $user->hasRole('founder') || $user->hasRole('director') || $user->hasPermissionTo('reports.view_sales');
            if ($canViewSales) {
                $dashboardData['this_month_pipeline'] = $this->leadService->getPipelineSummary($thisMonthFrom, $thisMonthTo, 'created');
                
                $quoteStats = DB::table('quotes')
                    ->select(
                        DB::raw('count(id) as total_quotes'),
                        DB::raw("sum(case when status = 'pending' then 1 else 0 end) as pending_count")
                    )
                    ->whereNull('deleted_at')
                    ->whereBetween('created_at', [$thisMonthFrom->startOfDay(), $thisMonthTo->endOfDay()])
                    ->first();
                $dashboardData['this_month_quotes'] = [
                    'summary' => [
                        'pending_count' => (int) ($quoteStats->pending_count ?? 0),
                    ]
                ];
            }

            // 3. Projects & Team (Utilisation)
            $canViewProjects = $user->hasRole('founder') || $user->hasRole('director') || $user->hasPermissionTo('reports.view_hr') || $user->hasRole('project_manager');
            if ($canViewProjects) {
                $usersQuery = User::query()->where('status', 'active')->where('is_client_portal_user', false);
                if (!$user->hasRole('founder') && !$user->hasRole('director') && !$user->hasPermissionTo('reports.view_hr') && $user->hasRole('project_manager')) {
                    $pmProjectUserIds = DB::table('timesheets')
                        ->join('projects', 'timesheets.project_id', '=', 'projects.id')
                        ->where('projects.manager_id', $user->id)
                        ->pluck('timesheets.user_id')
                        ->unique();
                    $usersQuery->whereIn('id', $pmProjectUserIds);
                }
                $teamUsers = $usersQuery->with(['departments', 'compensation'])->get();
                $teamUserIds = $teamUsers->pluck('id')->toArray();
                
                $timesheetsGrouped = DB::table('timesheets')
                    ->whereIn('user_id', $teamUserIds)
                    ->whereIn('status', ['submitted', 'approved'])
                    ->whereBetween('date', [$thisMonthFrom->toDateString(), $thisMonthTo->toDateString()])
                    ->whereNull('deleted_at')
                    ->get()
                    ->groupBy('user_id');

                $totalExpected = 0.0;
                $totalLogged = 0.0;
                $totalBillable = 0.0;
                foreach ($teamUsers as $tu) {
                    $uId = $tu->id;
                    $preTimesheets = $timesheetsGrouped->get($uId, collect([]));
                    $util = $this->utilisationService->calculateForUser($tu, $thisMonthFrom, $thisMonthTo, $preTimesheets);
                    if ($util['expected_hours'] > 0 || $util['logged_hours'] > 0) {
                        $totalExpected += $util['expected_hours'];
                        $totalLogged += $util['logged_hours'];
                        $totalBillable += $util['billable_hours'];
                    }
                }
                $avgUtilisationPct = $totalExpected > 0 ? round(($totalLogged / $totalExpected) * 100, 2) : 0.00;
                $dashboardData['this_month_utilisation'] = [
                    'summary' => [
                        'total_logged_hours' => round($totalLogged, 2),
                        'avg_utilisation_pct' => $avgUtilisationPct,
                    ]
                ];
            }

            // 4. Projects List
            $canViewProjectsList = $canViewProjects || $canViewFinancial;
            if ($canViewProjectsList) {
                $projectsListQuery = Project::query();
                if (!$user->hasRole('founder') && !$user->hasRole('director') && !$user->hasPermissionTo('projects.view_all')) {
                    if ($user->hasRole('client')) {
                        $projectsListQuery->where('client_id', $user->id);
                    } elseif ($user->hasPermissionTo('projects.view')) {
                        $projectsListQuery->where(function ($q) use ($user) {
                            $q->where('manager_id', $user->id)
                              ->orWhereHas('members', function ($mq) use ($user) {
                                  $mq->where('user_id', $user->id);
                              });
                        });
                    }
                }
                $dashboardData['projects_list'] = $projectsListQuery->get();
            }

            // 5. Alerts list
            $alertsQuery = DB::table('alerts')
                ->where('user_id', $user->id)
                ->whereNull('deleted_at')
                ->orderBy('created_at', 'desc')
                ->limit(10);
            $dashboardData['alerts_list'] = $alertsQuery->get();

            // ─── Executive Command Center Metrics Redesign ───
            
            // A. Overdue Invoices
            $overdueInvoicesQuery = DB::table('invoices')
                ->whereNull('deleted_at')
                ->whereNotIn('status', ['paid', 'draft', 'rejected'])
                ->where('due_date', '<', $now->toDateString());
            $overdueInvoicesCount = $overdueInvoicesQuery->count();
            $overdueInvoicesAmount = (float) $overdueInvoicesQuery->sum(DB::raw('due_amount * exchange_rate'));

            // B. Overdue Tasks
            $overdueTasksCount = DB::table('tasks')
                ->whereNull('deleted_at')
                ->where('status', '!=', 'completed')
                ->where('due_date', '<', $now->toDateString())
                ->count();

            // C. Delayed Projects
            $delayedProjectsCount = DB::table('projects')
                ->whereNull('deleted_at')
                ->where('status', 'active')
                ->where('end_date', '<', $now->toDateString())
                ->count();

            // D. Leads needing follow-up
            $leadsNeedingFollowupCount = DB::table('leads')
                ->whereNull('deleted_at')
                ->where('is_converted', false)
                ->count();

            // E. Pending payroll runs
            $pendingPayrollCount = DB::table('payroll_runs')
                ->whereNull('deleted_at')
                ->whereIn('status', ['draft', 'submitted', 'approved', 'processed'])
                ->count();

            // F. Pending approvals (sum of pending quotes + submitted expenses + submitted timesheets)
            $pendingQuotesCount = DB::table('quotes')->whereNull('deleted_at')->where('status', 'pending')->count();
            $pendingExpensesCount = DB::table('expenses')->whereNull('deleted_at')->where('status', 'submitted')->count();
            $pendingTimesheetsCount = DB::table('timesheets')->whereNull('deleted_at')->where('status', 'submitted')->count();
            $pendingApprovalsCount = $pendingQuotesCount + $pendingExpensesCount + $pendingTimesheetsCount;

            // G. Stale leads (unconverted leads with no updates in > 14 days)
            $staleLeadsCount = DB::table('leads')
                ->whereNull('deleted_at')
                ->where('is_converted', false)
                ->where('updated_at', '<', $now->copy()->subDays(14)->toDateString())
                ->count();

            // H. Active Clients count (clients with active projects)
            $activeClientsCount = DB::table('projects')
                ->whereNull('projects.deleted_at')
                ->where('projects.status', 'active')
                ->join('users', 'projects.client_id', '=', 'users.id')
                ->distinct('projects.client_id')
                ->count('projects.client_id');

            // I. Attention required lists
            $overdueTasksList = DB::table('tasks')
                ->whereNull('tasks.deleted_at')
                ->where('tasks.status', '!=', 'completed')
                ->where('tasks.due_date', '<', $now->toDateString())
                ->leftJoin('users', 'tasks.assigned_to', '=', 'users.id')
                ->select('tasks.id', 'tasks.task_number', 'tasks.title', 'tasks.due_date', 'users.name as assignee')
                ->orderBy('tasks.due_date', 'asc')
                ->limit(5)
                ->get();

            $overdueInvoicesList = DB::table('invoices')
                ->whereNull('invoices.deleted_at')
                ->whereNotIn('invoices.status', ['paid', 'draft', 'rejected'])
                ->where('invoices.due_date', '<', $now->toDateString())
                ->leftJoin('users', 'invoices.client_id', '=', 'users.id')
                ->select('invoices.id', 'invoices.invoice_number', 'invoices.title', 'invoices.due_date', 'invoices.due_amount', 'users.name as client')
                ->orderBy('invoices.due_date', 'asc')
                ->limit(5)
                ->get();

            $delayedProjectsList = DB::table('projects')
                ->whereNull('projects.deleted_at')
                ->where('projects.status', 'active')
                ->where('projects.end_date', '<', $now->toDateString())
                ->leftJoin('users', 'projects.manager_id', '=', 'users.id')
                ->select('projects.id', 'projects.project_number', 'projects.name', 'projects.end_date', 'projects.completion_percentage', 'users.name as manager')
                ->orderBy('projects.end_date', 'asc')
                ->limit(5)
                ->get();

            $staleLeadsList = DB::table('leads')
                ->whereNull('leads.deleted_at')
                ->where('leads.is_converted', false)
                ->where('leads.updated_at', '<', $now->copy()->subDays(14)->toDateString())
                ->select('leads.id', 'leads.lead_number', 'leads.company_name', 'leads.priority', 'leads.temperature', 'leads.updated_at')
                ->orderBy('leads.updated_at', 'asc')
                ->limit(5)
                ->get();

            $dashboardData['attention_required'] = [
                'overdue_tasks' => $overdueTasksList,
                'overdue_invoices' => $overdueInvoicesList,
                'delayed_projects' => $delayedProjectsList,
                'stale_leads' => $staleLeadsList,
                'counts' => [
                    'tasks' => $overdueTasksCount,
                    'invoices' => $overdueInvoicesCount,
                    'projects' => $delayedProjectsCount,
                    'leads' => $staleLeadsCount,
                    'approvals' => $pendingApprovalsCount,
                    'payroll' => $pendingPayrollCount,
                ]
            ];

            // J. Most Profitable Project Overall Active
            $activeProjectsForProfit = Project::whereNull('deleted_at')->where('status', 'active')->get();
            if ($activeProjectsForProfit->count() > 0) {
                $pIds = $activeProjectsForProfit->pluck('id')->toArray();
                
                $timesheetsGroupedProfit = DB::table('timesheets')
                    ->whereIn('project_id', $pIds)
                    ->whereIn('status', ['submitted', 'approved'])
                    ->whereNull('deleted_at')
                    ->get()
                    ->groupBy('project_id');

                $expensesSumMapProfit = DB::table('expenses')
                    ->select('project_id', DB::raw('sum(amount) as total_expenses'))
                    ->whereIn('project_id', $pIds)
                    ->whereIn('status', ['approved', 'reimbursed'])
                    ->whereNull('deleted_at')
                    ->groupBy('project_id')
                    ->get()
                    ->keyBy('project_id');

                $userHourlyRatesProfit = User::with('compensation')->get()->mapWithKeys(function ($u) {
                    return [$u->id => $u->hourly_rate];
                })->toArray();

                foreach ($activeProjectsForProfit as $proj) {
                    $pId = $proj->id;
                    $preTimesheets = $timesheetsGroupedProfit->get($pId, collect([]));
                    $preExpensesSum = (float) ($expensesSumMapProfit->get($pId)->total_expenses ?? 0.0);

                    $profit = $this->profitabilityService->calculate(
                        $proj,
                        null,
                        null,
                        $preTimesheets,
                        $preExpensesSum,
                        $userHourlyRatesProfit
                    );
                    
                    if ($profit['net_profit'] > $mostProfitableProjectProfit) {
                        $mostProfitableProjectProfit = $profit['net_profit'];
                        $mostProfitableProjectMargin = $profit['margin_percentage'];
                        $mostProfitableProjectName = $proj->name;
                    }
                }
            }

            // K. Sales Funnel Details
            $freshLeadsCount = DB::table('leads')->whereNull('deleted_at')->where('is_converted', false)->where('temperature', 'cold')->count();
            $warmLeadsCount = DB::table('leads')->whereNull('deleted_at')->where('is_converted', false)->where('temperature', 'warm')->count();
            $hotLeadsCount = DB::table('leads')->whereNull('deleted_at')->where('is_converted', false)->where('temperature', 'hot')->count();
            $quotesSentCount = DB::table('quotes')->whereNull('deleted_at')->where('status', 'sent')->count();
            $wonCount = DB::table('leads')->whereNull('deleted_at')->where('is_converted', true)->count();
            $lostCount = DB::table('quotes')->whereNull('deleted_at')->where('status', 'rejected')->count();
            $pipelineValue = (float) DB::table('leads')->whereNull('deleted_at')->where('is_converted', false)->sum('estimated_monthly_budget');

            $dashboardData['sales_pipeline'] = [
                'fresh_leads' => $freshLeadsCount,
                'warm_leads' => $warmLeadsCount,
                'hot_leads' => $hotLeadsCount,
                'quotes_sent' => $quotesSentCount,
                'won' => $wonCount,
                'lost' => $lostCount,
                'pipeline_value' => $pipelineValue,
            ];

            // L. Project Health Center List
            $projectHealthList = [];
            foreach ($dashboardData['projects_list'] ?? [] as $proj) {
                $pId = $proj->id;
                
                // Fetch timesheets and expenses for this project to compute actual costs
                $preTimesheets = DB::table('timesheets')
                    ->where('project_id', $pId)
                    ->whereIn('status', ['submitted', 'approved'])
                    ->whereNull('deleted_at')
                    ->get();
                $preExpensesSum = (float) DB::table('expenses')
                    ->where('project_id', $pId)
                    ->whereIn('status', ['approved', 'reimbursed'])
                    ->whereNull('deleted_at')
                    ->sum('amount');
                
                $userHourlyRatesMap = User::with('compensation')->get()->mapWithKeys(function ($u) {
                    return [$u->id => $u->hourly_rate];
                })->toArray();

                $profit = $this->profitabilityService->calculate(
                    $proj,
                    null,
                    null,
                    $preTimesheets,
                    $preExpensesSum,
                    $userHourlyRatesMap
                );
                
                $budget = (float) $proj->budget_amount;
                $cost = (float) $profit['total_cost'];
                $budgetUtilisation = $budget > 0 ? round(($cost / $budget) * 100, 1) : 0.0;
                
                $budgetHours = (float) $proj->budget_hours;
                $hoursLogged = (float) $profit['hours_logged'];
                $timeUtilisation = $budgetHours > 0 ? round(($hoursLogged / $budgetHours) * 100, 1) : 0.0;
                
                // Calculate risk
                $isOverdue = $proj->end_date && Carbon::parse($proj->end_date)->endOfDay()->isPast();
                $riskLevel = 'low';
                if ($isOverdue || $budgetUtilisation > 100 || $timeUtilisation > 100) {
                    $riskLevel = 'critical';
                } elseif ($budgetUtilisation > 80 || $timeUtilisation > 80 || ($proj->end_date && Carbon::parse($proj->end_date)->diffInDays(Carbon::now()) <= 7)) {
                    $riskLevel = 'medium';
                }
                
                $projectHealthList[] = [
                    'id' => $pId,
                    'project_number' => $proj->project_number,
                    'name' => $proj->name,
                    'completion_percentage' => $proj->completion_percentage,
                    'budget_amount' => $budget,
                    'cost' => $cost,
                    'budget_utilisation_pct' => $budgetUtilisation,
                    'budget_hours' => $budgetHours,
                    'hours_logged' => $hoursLogged,
                    'time_utilisation_pct' => $timeUtilisation,
                    'risk_level' => $riskLevel,
                    'manager' => $proj->manager?->name ?? 'Unassigned',
                    'client' => $proj->client?->name ?? 'Unknown Client',
                    'end_date' => $proj->end_date?->toDateString(),
                ];
            }
            $dashboardData['project_health'] = $projectHealthList;

            // M. Team Performance dashboard
            $teamUsers = User::where('status', 'active')->where('is_client_portal_user', false)->with('compensation')->get();
            $teamUserIds = $teamUsers->pluck('id')->toArray();
            
            $timesheetsGroupedTeam = DB::table('timesheets')
                ->whereIn('user_id', $teamUserIds)
                ->whereIn('status', ['submitted', 'approved'])
                ->whereBetween('date', [$thisMonthFrom->toDateString(), $thisMonthTo->toDateString()])
                ->whereNull('deleted_at')
                ->get()
                ->groupBy('user_id');
                
            $completedTasksGroupedTeam = DB::table('tasks')
                ->whereIn('assigned_to', $teamUserIds)
                ->where('status', 'completed')
                ->whereNull('deleted_at')
                ->select('assigned_to', DB::raw('count(*) as count'))
                ->groupBy('assigned_to')
                ->get()
                ->keyBy('assigned_to');
                
            $teamPerformanceList = [];
            foreach ($teamUsers as $tu) {
                $uId = $tu->id;
                $preTimesheets = $timesheetsGroupedTeam->get($uId, collect([]));
                $util = $this->utilisationService->calculateForUser($tu, $thisMonthFrom, $thisMonthTo, $preTimesheets);
                
                $logged = (float) $util['logged_hours'];
                $expected = (float) $util['expected_hours'];
                $utilisation = $expected > 0 ? round(($logged / $expected) * 100, 1) : 0.0;
                $completedTasks = (int) ($completedTasksGroupedTeam->get($uId)->count ?? 0);
                
                // Productivity score
                $productivityScore = min(100, round(($completedTasks * 8) + ($utilisation * 0.6)));
                
                $teamPerformanceList[] = [
                    'id' => $uId,
                    'name' => $tu->name,
                    'logged_hours' => $logged,
                    'expected_hours' => $expected,
                    'utilisation_pct' => $utilisation,
                    'completed_tasks' => $completedTasks,
                    'productivity_score' => $productivityScore,
                ];
            }
            usort($teamPerformanceList, function($a, $b) {
                return $b['productivity_score'] <=> $a['productivity_score'];
            });
            $dashboardData['team_performance'] = $teamPerformanceList;

            // N. 6-Month historical cash flow trends
            $historicalTrends = [];
            for ($i = 5; $i >= 0; $i--) {
                $monthStart = Carbon::now()->subMonths($i)->startOfMonth();
                $monthEnd = Carbon::now()->subMonths($i)->endOfMonth();
                $monthKey = $monthStart->format('Y-m');
                $monthName = $monthStart->format('M Y');
                
                $invoicedSum = (float) DB::table('invoices')
                    ->whereNull('deleted_at')
                    ->whereIn('status', ['approved', 'sent', 'paid', 'partially_paid', 'overdue'])
                    ->whereBetween('issue_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
                    ->sum(DB::raw('total_amount * exchange_rate'));
                    
                $collectedSum = (float) DB::table('payments')
                    ->join('invoices', 'payments.invoice_id', '=', 'invoices.id')
                    ->whereNull('payments.deleted_at')
                    ->whereNull('invoices.deleted_at')
                    ->whereBetween('payments.payment_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
                    ->sum(DB::raw('payments.amount * invoices.exchange_rate'));
                    
                $expensesSum = (float) DB::table('expenses')
                    ->join('currencies', 'expenses.currency_id', '=', 'currencies.id')
                    ->whereNull('expenses.deleted_at')
                    ->whereIn('expenses.status', ['approved', 'reimbursed'])
                    ->whereBetween('expenses.expense_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
                    ->sum(DB::raw('expenses.amount * currencies.exchange_rate_to_inr'));
                    
                $payrollSum = (float) DB::table('payroll_runs')
                    ->join('currencies', 'payroll_runs.currency_id', '=', 'currencies.id')
                    ->whereNull('payroll_runs.deleted_at')
                    ->where('payroll_runs.status', 'paid')
                    ->whereBetween(DB::raw('coalesce(payroll_runs.processed_at, payroll_runs.created_at)'), [$monthStart->toDateTimeString(), $monthEnd->toDateTimeString()])
                    ->sum(DB::raw('payroll_runs.total_net * currencies.exchange_rate_to_inr'));
                    
                $historicalTrends[] = [
                    'month_key' => $monthKey,
                    'month_name' => $monthName,
                    'revenue' => round($invoicedSum, 2),
                    'collections' => round($collectedSum, 2),
                    'expenses' => round($expensesSum, 2),
                    'payroll' => round($payrollSum, 2),
                    'profit' => round($invoicedSum - $expensesSum - $payrollSum, 2)
                ];
            }
            $dashboardData['financial_trends'] = $historicalTrends;
            $dashboardData['active_clients_count'] = $activeClientsCount;

            // O. AI Executive Briefing Text & Actions Generation
            $thisMonthRevVal = $thisMonthRevenueData ? $thisMonthRevenueData['summary']['total_invoiced'] : 0.0;
            $lastMonthRevVal = $lastMonthRevenueData ? $lastMonthRevenueData['summary']['total_invoiced'] : 0.0;
            $revDiffVal = $lastMonthRevVal > 0 ? (($thisMonthRevVal - $lastMonthRevVal) / $lastMonthRevVal) * 100 : 0.0;
            $revChangeTextVal = ($revDiffVal >= 0 ? 'increased ' : 'decreased ') . abs(round($revDiffVal, 1)) . '%';

            $aiPrompt = "You are the Executive Business Assistant of Creativals OS. Summarize these live business metrics for the Founder/CEO. Keep it to 2 short paragraphs under 250 words total.
            Metrics:
            - Revenue this month: ₹" . number_format($thisMonthRevVal) . " (which {$revChangeTextVal} vs last month: ₹" . number_format($lastMonthRevVal) . ").
            - Outstanding invoices: {$overdueInvoicesCount} invoices worth ₹" . number_format($overdueInvoicesAmount) . " are overdue.
            - Delayed projects: {$delayedProjectsCount} projects are active but past their deadline.
            - Overdue tasks: {$overdueTasksCount} tasks are overdue.
            - CRM: {$leadsNeedingFollowupCount} active leads require follow-up. Stale leads count is {$staleLeadsCount}.
            - Team utilization: average team utilization is " . round($avgUtilisationPct ?? 0.0, 1) . "%.
            - Most profitable project: '{$mostProfitableProjectName}' (Margin: {$mostProfitableProjectMargin}%).
            - Pending actions: {$pendingApprovalsCount} approvals pending, {$pendingPayrollCount} payroll runs pending.
            
            Format the response as JSON with two fields:
            - \"briefing\": a beautiful, executive-style, 1st person summary (e.g. \"Revenue increased 18% this month...\")
            - \"recommendations\": array of 3 actionable items (e.g. [\"Follow up on overdue invoices first\", ...])
            Do not output markdown codeblocks (like ```json), output raw JSON only.";

            $aiBriefingJson = null;
            try {
                $aiRes = $this->gemini->chatWithoutTools([
                    ['role' => 'user', 'content' => $aiPrompt]
                ]);
                $content = $aiRes['content'] ?? '';
                
                $content = preg_replace('/^```json\s*/i', '', $content);
                $content = preg_replace('/```$/', '', trim($content));
                
                $aiBriefingJson = json_decode($content, true);
            } catch (\Throwable $e) {
                Log::error('Dashboard AI briefing failure', ['exception' => $e->getMessage()]);
            }

            if (!$aiBriefingJson || !isset($aiBriefingJson['briefing'])) {
                $briefingText = "Revenue " . ($revDiffVal >= 0 ? "increased by " : "decreased by ") . abs(round($revDiffVal, 1)) . "% this month compared to last month. " .
                                "Currently, we have {$overdueInvoicesCount} overdue invoices totaling ₹" . number_format($overdueInvoicesAmount) . " requiring immediate attention. " .
                                "Operations show {$delayedProjectsCount} projects behind schedule and {$overdueTasksCount} tasks past their due dates. " .
                                "The pipeline has {$leadsNeedingFollowupCount} active leads, with average team utilization holding at " . round($avgUtilisationPct ?? 0.0, 1) . "%. " .
                                "Our top margin project this cycle is '{$mostProfitableProjectName}' at {$mostProfitableProjectMargin}% profitability.";
                                
                $recs = [];
                if ($overdueInvoicesCount > 0) {
                    $recs[] = "Initiate follow-ups on the {$overdueInvoicesCount} overdue invoices worth ₹" . number_format($overdueInvoicesAmount) . ".";
                }
                if ($delayedProjectsCount > 0 || $overdueTasksCount > 0) {
                    $recs[] = "Review delivery schedules for {$delayedProjectsCount} delayed projects and assign resources to {$overdueTasksCount} overdue tasks.";
                }
                if ($pendingApprovalsCount > 0) {
                    $recs[] = "Clear the {$pendingApprovalsCount} pending approvals (quotes/expenses/timesheets) to unblock billing and workflows.";
                }
                if (count($recs) < 3) {
                    $recs[] = "Follow up with warm and hot leads in the sales pipeline to boost next month's bookings.";
                }
                
                $aiBriefingJson = [
                    'briefing' => $briefingText,
                    'recommendations' => array_slice($recs, 0, 3)
                ];
            }
            $dashboardData['executive_briefing'] = $aiBriefingJson;

            return $dashboardData;
        });

        return response()->json($data);
    }
}
