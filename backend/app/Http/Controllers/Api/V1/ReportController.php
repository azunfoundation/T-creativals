<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\User;
use App\Services\FinancialReportService;
use App\Services\GeminiService;
use App\Services\LeadReportService;
use App\Services\ProfitabilityService;
use App\Services\UtilisationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    protected FinancialReportService $financialService;
    protected LeadReportService $leadService;
    protected ProfitabilityService $profitabilityService;
    protected UtilisationService $utilisationService;
    protected GeminiService $gemini;

    /**
     * Project statuses that mean "currently being delivered". Both values are
     * real, reachable states in the Project status enum — dashboards that only
     * checked 'active' silently ignored every 'in_progress' project.
     */
    protected const RUNNING_PROJECT_STATUSES = ['active', 'in_progress'];

    /**
     * Invoice statuses that represent a real receivable a client is expected
     * to pay (draft/pending_review/pending_approval aren't billed yet;
     * void/cancelled never will be).
     */
    protected const RECEIVABLE_INVOICE_STATUSES = ['approved', 'sent', 'partially_paid', 'overdue'];

    public function __construct(
        FinancialReportService $financialService,
        LeadReportService $leadService,
        ProfitabilityService $profitabilityService,
        UtilisationService $utilisationService,
        GeminiService $gemini
    ) {
        $this->financialService = $financialService;
        $this->leadService = $leadService;
        $this->profitabilityService = $profitabilityService;
        $this->utilisationService = $utilisationService;
        $this->gemini = $gemini;
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
                    DB::raw('sum(case when timesheets.is_billable then timesheets.hours_logged else 0 end) as billable_hours')
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
     *
     * Every section is permission-gated server-side: a section the caller may
     * not see is simply absent from the payload (the frontend renders only the
     * sections present). Previously the attention lists, financial trends,
     * team performance table, sales funnel, and executive briefing were
     * computed and returned to EVERY authenticated user — leaking company-wide
     * revenue, payroll, and per-employee performance data to plain employees.
     */
    public function dashboardOverview(Request $request)
    {
        $user = $request->user();
        $projectId = $request->filled('project_id') ? (int) $request->input('project_id') : null;

        // Authorization check if project_id is provided
        if ($projectId) {
            $canSeeAllProjects = $user->hasPermissionTo('projects.view_all') || $user->hasPermissionTo('reports.view_financial');
            if (!$canSeeAllProjects) {
                if ($user->hasRole('client')) {
                    $hasAccess = DB::table('projects')->where('id', $projectId)->where('client_id', $user->id)->exists();
                } else {
                    $hasAccess = DB::table('projects')
                        ->where('id', $projectId)
                        ->where(function ($q) use ($user) {
                            $q->where('manager_id', $user->id)
                               ->orWhereExists(function ($mq) use ($user) {
                                   $mq->select(DB::raw(1))
                                      ->from('project_members')
                                      ->whereColumn('project_members.project_id', 'projects.id')
                                      ->where('project_members.user_id', $user->id);
                               });
                        })->exists();
                }
                if (!$hasAccess) {
                    return response()->json(['message' => 'This action is unauthorized.'], 403);
                }
            }
        }

        // Short per-user & project cache window to absorb reloads/focus refetches.
        $cacheKey = 'dashboard_overview_v3_' . $user->id . ($projectId ? '_p_' . $projectId : '');

        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 2, function () use ($user, $projectId) {
            $now = Carbon::now();
            $today = $now->toDateString();

            $thisMonthFrom = $now->copy()->startOfMonth();
            $thisMonthTo = $now->copy()->endOfMonth();
            $lastMonthFrom = $now->copy()->subMonth()->startOfMonth();
            $lastMonthTo = $now->copy()->subMonth()->endOfMonth();

            // Founder holds every permission and director all but three (see
            // RolesPermissionsSeeder), so permission strings alone are the
            // source of truth — no role-name matching.
            $canViewFinancial = $user->hasPermissionTo('reports.view_financial');
            $canViewSales = $user->hasPermissionTo('reports.view_sales');
            $canViewHr = $user->hasPermissionTo('reports.view_hr');
            $isPm = $user->hasRole('project_manager');
            $canViewAllInvoices = $canViewFinancial || $user->hasPermissionTo('invoices.view_all');
            $canViewAllLeads = $canViewSales || $user->hasPermissionTo('leads.view_all');
            $canViewAllProjects = $user->hasPermissionTo('projects.view_all');
            $canSeeProjects = $canViewAllProjects || $user->hasPermissionTo('projects.view') || $canViewFinancial;

            $dashboardData = [];

            // Employee hourly-rate map — loaded at most once per request, and
            // only when a section that costs labor actually needs it.
            $userHourlyRates = null;
            $getHourlyRates = function () use (&$userHourlyRates): array {
                if ($userHourlyRates === null) {
                    $userHourlyRates = User::with('compensation')->get()->mapWithKeys(function ($u) {
                        return [$u->id => $u->hourly_rate];
                    })->toArray();
                }
                return $userHourlyRates;
            };

            // Fresh, correctly-scoped Project query per call site: full
            // visibility for projects.view_all / financial reporting holders;
            // own managed/member projects for everyone else with projects.view.
            $scopedProjectsQuery = function () use ($user, $canViewAllProjects, $canViewFinancial, $projectId) {
                $q = Project::query();
                if ($projectId) {
                    $q->where('id', $projectId);
                }
                if (!$canViewAllProjects && !$canViewFinancial) {
                    if ($user->hasRole('client')) {
                        $q->where('client_id', $user->id);
                    } else {
                        $q->where(function ($qq) use ($user) {
                            $qq->where('manager_id', $user->id)
                               ->orWhereHas('members', function ($mq) use ($user) {
                                   $mq->where('user_id', $user->id);
                               });
                        });
                    }
                }
                return $q;
            };

            // ── 1. Financial Overview (reports.view_financial only) ─────────
            if ($canViewFinancial) {
                $dashboardData['this_month_revenue'] = $this->financialService->getRevenueSummary($thisMonthFrom, $thisMonthTo, $projectId);
                $dashboardData['last_month_revenue'] = $this->financialService->getRevenueSummary($lastMonthFrom, $lastMonthTo, $projectId);
                $dashboardData['this_month_expenses'] = $this->financialService->getExpenseBreakdown($thisMonthFrom, $thisMonthTo, $projectId);

                // Profitability summary — period-overlap filter (same fix as
                // ReportController::projectProfitability): a project counts for
                // this month if it was ACTIVE at any point during it, not only
                // if it happened to start inside the month.
                $projectsQuery = Project::query()
                    ->where(function ($q) use ($thisMonthTo) {
                        $q->whereNull('start_date')->orWhere('start_date', '<=', $thisMonthTo->toDateString());
                    })
                    ->where(function ($q) use ($thisMonthFrom) {
                        $q->whereNull('end_date')->orWhere('end_date', '>=', $thisMonthFrom->toDateString());
                    });
                if ($projectId) {
                    $projectsQuery->where('id', $projectId);
                }
                $projects = $projectsQuery->with('invoice')->get();
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

                $totalRevenue = 0.0;
                $totalLabor = 0.0;
                $totalExpenses = 0.0;
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
                        $getHourlyRates()
                    );
                    $totalRevenue += $profit['revenue'];
                    $totalLabor += $profit['labor_cost'];
                    $totalExpenses += $profit['expense_cost'];
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

                // 6-month historical cash flow trends.
                $historicalTrends = [];
                for ($i = 5; $i >= 0; $i--) {
                    $monthStart = $now->copy()->subMonths($i)->startOfMonth();
                    $monthEnd = $now->copy()->subMonths($i)->endOfMonth();

                    $invQuery = DB::table('invoices')
                        ->whereNull('deleted_at')
                        ->whereIn('status', array_merge(self::RECEIVABLE_INVOICE_STATUSES, ['paid']))
                        ->whereBetween('issue_date', [$monthStart->toDateString(), $monthEnd->toDateString()]);
                    if ($projectId) {
                        $invQuery->where('project_id', $projectId);
                    }
                    $invoicedSum = (float) $invQuery->sum(DB::raw('total_amount * exchange_rate'));

                    $collQuery = DB::table('payments')
                        ->join('invoices', 'payments.invoice_id', '=', 'invoices.id')
                        ->whereNull('payments.deleted_at')
                        ->whereNull('invoices.deleted_at')
                        ->whereBetween('payments.payment_date', [$monthStart->toDateString(), $monthEnd->toDateString()]);
                    if ($projectId) {
                        $collQuery->where('invoices.project_id', $projectId);
                    }
                    $collectedSum = (float) $collQuery->sum(DB::raw('payments.amount * invoices.exchange_rate'));

                    $expQuery = DB::table('expenses')
                        ->join('currencies', 'expenses.currency_id', '=', 'currencies.id')
                        ->whereNull('expenses.deleted_at')
                        ->whereIn('expenses.status', ['approved', 'reimbursed'])
                        ->whereBetween('expenses.expense_date', [$monthStart->toDateString(), $monthEnd->toDateString()]);
                    if ($projectId) {
                        $expQuery->where('expenses.project_id', $projectId);
                    }
                    $expensesSum = (float) $expQuery->sum(DB::raw('expenses.amount * currencies.exchange_rate_to_inr'));

                    $payrollSum = 0.0;
                    if (!$projectId) {
                        $payrollSum = (float) DB::table('payroll_runs')
                            ->join('currencies', 'payroll_runs.currency_id', '=', 'currencies.id')
                            ->whereNull('payroll_runs.deleted_at')
                            ->whereIn('payroll_runs.status', ['approved', 'processed', 'paid'])
                            ->whereBetween(DB::raw('coalesce(payroll_runs.processed_at, payroll_runs.created_at)'), [$monthStart->toDateTimeString(), $monthEnd->toDateTimeString()])
                            ->sum(DB::raw('payroll_runs.total_net * currencies.exchange_rate_to_inr'));
                    }

                    $historicalTrends[] = [
                        'month_key' => $monthStart->format('Y-m'),
                        'month_name' => $monthStart->format('M Y'),
                        'revenue' => round($invoicedSum, 2),
                        'collections' => round($collectedSum, 2),
                        'expenses' => round($expensesSum, 2),
                        'payroll' => round($payrollSum, 2),
                        'profit' => round($invoicedSum - $expensesSum - $payrollSum, 2),
                    ];
                }
                $dashboardData['financial_trends'] = $historicalTrends;
            }

            // Active clients — clients with a running project. Financial and
            // sales viewers both legitimately need this KPI.
            if ($canViewFinancial || $canViewSales) {
                $clientsQuery = DB::table('projects')
                    ->whereNull('projects.deleted_at')
                    ->whereIn('projects.status', self::RUNNING_PROJECT_STATUSES)
                    ->join('users', 'projects.client_id', '=', 'users.id');
                if ($projectId) {
                    $clientsQuery->where('projects.id', $projectId);
                }
                $dashboardData['active_clients_count'] = $clientsQuery
                    ->distinct('projects.client_id')
                    ->count('projects.client_id');
            }

            // ── 2. Sales & CRM (reports.view_sales only) ────────────────────
            if ($canViewSales) {
                $dashboardData['this_month_pipeline'] = $this->leadService->getPipelineSummary($thisMonthFrom, $thisMonthTo, 'created');

                $quoteStats = DB::table('quotes')
                    ->select(
                        DB::raw('count(id) as total_quotes'),
                        DB::raw("sum(case when status = 'pending' then 1 else 0 end) as pending_count")
                    )
                    ->whereNull('deleted_at')
                    ->whereBetween('created_at', [$thisMonthFrom, $thisMonthTo])
                    ->first();
                $dashboardData['this_month_quotes'] = [
                    'summary' => [
                        'pending_count' => (int) ($quoteStats->pending_count ?? 0),
                    ]
                ];

                // Current-state sales funnel (snapshot of open pipeline, not
                // scoped to this month — labels in the UI say so).
                $wonStageIds = DB::table('lead_stages')->where('slug', 'won')->pluck('id')->toArray();
                $lostStageIds = DB::table('lead_stages')->where('slug', 'lost')->pluck('id')->toArray();
                $closedStageIds = array_merge($wonStageIds, $lostStageIds);

                $freshLeadsCount = DB::table('leads')
                    ->whereNull('deleted_at')
                    ->where('is_converted', false)
                    ->whereNotIn('stage_id', $closedStageIds)
                    ->where('temperature', 'cold')
                    ->count();

                $warmLeadsCount = DB::table('leads')
                    ->whereNull('deleted_at')
                    ->where('is_converted', false)
                    ->whereNotIn('stage_id', $closedStageIds)
                    ->where('temperature', 'warm')
                    ->count();

                $hotLeadsCount = DB::table('leads')
                    ->whereNull('deleted_at')
                    ->where('is_converted', false)
                    ->whereNotIn('stage_id', $closedStageIds)
                    ->where('temperature', 'hot')
                    ->count();

                $quotesSentCount = DB::table('quotes')->whereNull('deleted_at')->where('status', 'sent')->count();

                $wonCount = DB::table('leads')
                    ->whereNull('deleted_at')
                    ->where(function($q) use ($wonStageIds) {
                        $q->where('is_converted', true)
                          ->orWhereIn('stage_id', $wonStageIds);
                    })
                    ->count();

                $lostCount = DB::table('quotes')->whereNull('deleted_at')->where('status', 'rejected')->count();

                $pipelineValue = (float) DB::table('leads')
                    ->whereNull('deleted_at')
                    ->where('is_converted', false)
                    ->whereNotIn('stage_id', $closedStageIds)
                    ->sum('estimated_monthly_budget');

                // Real scheduled follow-ups still open (lead_followups rows),
                // not "every unconverted lead" — the PRD's "Pending Follow-ups"
                // means follow-ups someone actually scheduled.
                $pendingFollowupsCount = DB::table('lead_followups')
                    ->join('leads', 'lead_followups.lead_id', '=', 'leads.id')
                    ->whereNull('leads.deleted_at')
                    ->where('lead_followups.is_completed', false)
                    ->count();

                $dashboardData['sales_pipeline'] = [
                    'fresh_leads' => $freshLeadsCount,
                    'warm_leads' => $warmLeadsCount,
                    'hot_leads' => $hotLeadsCount,
                    'quotes_sent' => $quotesSentCount,
                    'won' => $wonCount,
                    'lost' => $lostCount,
                    'pipeline_value' => $pipelineValue,
                    'pending_followups' => $pendingFollowupsCount,
                ];
            }

            // ── 3. Team utilisation + performance (reports.view_hr, or a PM
            //       scoped to the people who log time on their projects) ─────
            if ($canViewHr || $isPm) {
                $usersQuery = User::query()->where('status', 'active')->where('is_client_portal_user', false);
                if ($projectId) {
                    $projectMemberUserIds = DB::table('project_members')->where('project_id', $projectId)->pluck('user_id')->toArray();
                    $projectTimesheetUserIds = DB::table('timesheets')->where('project_id', $projectId)->pluck('user_id')->toArray();
                    $projectManagerId = DB::table('projects')->where('id', $projectId)->value('manager_id');
                    $relevantUserIds = array_unique(array_merge($projectMemberUserIds, $projectTimesheetUserIds, $projectManagerId ? [$projectManagerId] : []));
                    $usersQuery->whereIn('id', $relevantUserIds);
                } elseif (!$canViewHr && $isPm) {
                    $pmProjectUserIds = DB::table('timesheets')
                        ->join('projects', 'timesheets.project_id', '=', 'projects.id')
                        ->where('projects.manager_id', $user->id)
                        ->pluck('timesheets.user_id')
                        ->unique();
                    $usersQuery->whereIn('id', $pmProjectUserIds);
                }
                $teamUsers = $usersQuery->with(['departments', 'compensation'])->get();
                $teamUserIds = $teamUsers->pluck('id')->toArray();

                $tsQuery = DB::table('timesheets')
                    ->whereIn('user_id', $teamUserIds)
                    ->whereIn('status', ['submitted', 'approved'])
                    ->whereBetween('date', [$thisMonthFrom->toDateString(), $thisMonthTo->toDateString()])
                    ->whereNull('deleted_at');
                if ($projectId) {
                    $tsQuery->where('project_id', $projectId);
                }
                $timesheetsGrouped = $tsQuery->get()->groupBy('user_id');

                $taskQuery = DB::table('tasks')
                    ->whereIn('assigned_to', $teamUserIds)
                    ->where('status', 'done')
                    ->whereNull('deleted_at');
                if ($projectId) {
                    $taskQuery->where('project_id', $projectId);
                }
                $completedTasksGrouped = $taskQuery
                    ->select('assigned_to', DB::raw('count(*) as count'))
                    ->groupBy('assigned_to')
                    ->get()
                    ->keyBy('assigned_to');

                $totalExpected = 0.0;
                $totalLogged = 0.0;
                $totalBillable = 0.0;
                $teamPerformanceList = [];
                foreach ($teamUsers as $tu) {
                    $uId = $tu->id;
                    $preTimesheets = $timesheetsGrouped->get($uId, collect([]));
                    $util = $this->utilisationService->calculateForUser($tu, $thisMonthFrom, $thisMonthTo, $preTimesheets);
                    if ($util['expected_hours'] > 0 || $util['logged_hours'] > 0) {
                        $totalExpected += $util['expected_hours'];
                        $totalLogged += $util['logged_hours'];
                        $totalBillable += $util['billable_hours'];
                    }

                    $logged = (float) $util['logged_hours'];
                    $expected = (float) $util['expected_hours'];
                    $utilisation = $expected > 0 ? round(($logged / $expected) * 100, 1) : 0.0;
                    $completedTasks = (int) ($completedTasksGrouped->get($uId)->count ?? 0);

                    $teamPerformanceList[] = [
                        'id' => $uId,
                        'name' => $tu->name,
                        'logged_hours' => $logged,
                        'expected_hours' => $expected,
                        'utilisation_pct' => $utilisation,
                        'completed_tasks' => $completedTasks,
                        'productivity_score' => min(100, (int) round(($completedTasks * 8) + ($utilisation * 0.6))),
                    ];
                }
                $avgUtilisationPct = $totalExpected > 0 ? round(($totalLogged / $totalExpected) * 100, 2) : 0.00;
                $dashboardData['this_month_utilisation'] = [
                    'summary' => [
                        'total_logged_hours' => round($totalLogged, 2),
                        'avg_utilisation_pct' => $avgUtilisationPct,
                    ]
                ];

                usort($teamPerformanceList, function ($a, $b) {
                    return $b['productivity_score'] <=> $a['productivity_score'];
                });
                $dashboardData['team_performance'] = array_slice($teamPerformanceList, 0, 12);
            }

            // ── 4. Projects summary + health (scoped to what this user can
            //       actually see; health only covers running projects) ───────
            $delayedProjectsList = null;
            $delayedProjectsCount = null;
            if ($canSeeProjects) {
                $scopedProjects = $scopedProjectsQuery()
                    ->with(['manager:id,name', 'client:id,name', 'invoice'])
                    ->get();
                $runningProjects = $scopedProjects
                    ->filter(function ($p) {
                        return in_array($p->status, self::RUNNING_PROJECT_STATUSES, true);
                    })
                    ->values();

                $overdueRunning = $runningProjects->filter(function ($p) use ($today) {
                    return $p->end_date && $p->end_date->toDateString() < $today;
                });

                $dashboardData['projects_summary'] = [
                    'total_count' => $scopedProjects->count(),
                    'active_count' => $runningProjects->count(),
                    'completed_count' => $scopedProjects->where('status', 'completed')->count(),
                    'overdue_count' => $overdueRunning->count(),
                    'avg_completion_pct' => $runningProjects->count() > 0
                        ? round((float) $runningProjects->avg('completion_percentage'), 1)
                        : 0.0,
                ];

                // Delayed-projects data for the Attention panel — reuses the
                // already-fetched scoped collection, no extra queries.
                $delayedProjectsCount = $overdueRunning->count();
                $delayedProjectsList = $overdueRunning
                    ->sortBy(function ($p) {
                        return $p->end_date?->toDateString() ?? '9999-12-31';
                    })
                    ->take(5)
                    ->map(function ($p) {
                        return [
                            'id' => $p->id,
                            'project_number' => $p->project_number,
                            'name' => $p->name,
                            'end_date' => $p->end_date?->toDateString(),
                            'completion_percentage' => $p->completion_percentage,
                            'manager' => $p->manager?->name ?? 'Unassigned',
                        ];
                    })
                    ->values();

                // Project Health — batched
                $runningIds = $runningProjects->pluck('id')->toArray();
                $healthTimesheets = DB::table('timesheets')
                    ->whereIn('project_id', $runningIds)
                    ->whereIn('status', ['submitted', 'approved'])
                    ->whereNull('deleted_at')
                    ->get()
                    ->groupBy('project_id');
                $healthExpenses = DB::table('expenses')
                    ->select('project_id', DB::raw('sum(amount) as total_expenses'))
                    ->whereIn('project_id', $runningIds)
                    ->whereIn('status', ['approved', 'reimbursed'])
                    ->whereNull('deleted_at')
                    ->groupBy('project_id')
                    ->get()
                    ->keyBy('project_id');

                $projectHealthList = [];
                foreach ($runningProjects as $proj) {
                    $pId = $proj->id;
                    $profit = $this->profitabilityService->calculate(
                        $proj,
                        null,
                        null,
                        $healthTimesheets->get($pId, collect([])),
                        (float) ($healthExpenses->get($pId)->total_expenses ?? 0.0),
                        $getHourlyRates()
                    );

                    $budget = (float) $proj->budget_amount;
                    $cost = (float) $profit['total_cost'];
                    $budgetUtilisation = $budget > 0 ? round(($cost / $budget) * 100, 1) : 0.0;

                    $budgetHours = (float) $proj->budget_hours;
                    $hoursLogged = (float) $profit['hours_logged'];
                    $timeUtilisation = $budgetHours > 0 ? round(($hoursLogged / $budgetHours) * 100, 1) : 0.0;

                    $isOverdue = $proj->end_date && $proj->end_date->toDateString() < $today;
                    $daysToDeadline = $proj->end_date
                        ? Carbon::now()->startOfDay()->diffInDays($proj->end_date->copy()->startOfDay(), false)
                        : null;
                    $riskLevel = 'low';
                    if ($isOverdue || $budgetUtilisation > 100 || $timeUtilisation > 100) {
                        $riskLevel = 'critical';
                    } elseif ($budgetUtilisation > 80 || $timeUtilisation > 80 || ($daysToDeadline !== null && $daysToDeadline >= 0 && $daysToDeadline <= 7)) {
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
                $riskRank = ['critical' => 0, 'medium' => 1, 'low' => 2];
                usort($projectHealthList, function ($a, $b) use ($riskRank) {
                    return ($riskRank[$a['risk_level']] <=> $riskRank[$b['risk_level']])
                        ?: ($b['budget_utilisation_pct'] <=> $a['budget_utilisation_pct']);
                });
                $dashboardData['project_health'] = array_slice($projectHealthList, 0, 15);
            }

            // ── 5. Alerts list (always own records) ─────────────────────────
            $alertsQuery = DB::table('alerts')->where('user_id', $user->id);
            if ($projectId) {
                $alertsQuery->where(function($aq) use ($projectId) {
                    $aq->where('project_id', $projectId)->orWhereNull('project_id');
                });
            }
            $dashboardData['alerts_list'] = $alertsQuery
                ->orderBy('created_at', 'desc')
                ->limit(10)
                ->get();

            // ── 6. My Day (every user, own records only) ────────────────────
            $myOpenTasksQuery = DB::table('tasks')
                ->whereNull('deleted_at')
                ->where('assigned_to', $user->id)
                ->whereNotIn('status', ['done', 'cancelled']);
            if ($projectId) {
                $myOpenTasksQuery->where('project_id', $projectId);
            }

            $myOverdueTasksQuery = DB::table('tasks')
                ->whereNull('deleted_at')
                ->where('assigned_to', $user->id)
                ->whereNotIn('status', ['done', 'cancelled'])
                ->where('due_date', '<', $today);
            if ($projectId) {
                $myOverdueTasksQuery->where('project_id', $projectId);
            }

            $myHoursQuery = DB::table('timesheets')
                ->whereNull('deleted_at')
                ->where('user_id', $user->id)
                ->whereIn('status', ['draft', 'submitted', 'approved'])
                ->whereBetween('date', [$thisMonthFrom->toDateString(), $thisMonthTo->toDateString()]);
            if ($projectId) {
                $myHoursQuery->where('project_id', $projectId);
            }

            $todayAttendance = DB::table('attendance_records')
                ->where('user_id', $user->id)
                ->whereDate('date', $today)
                ->first();
            $dashboardData['my_summary'] = [
                'open_tasks_count' => $myOpenTasksQuery->count(),
                'overdue_tasks_count' => (clone $myOverdueTasksQuery)->count(),
                'overdue_tasks' => (clone $myOverdueTasksQuery)
                    ->select('id', 'task_number', 'title', 'due_date')
                    ->orderBy('due_date', 'asc')
                    ->limit(5)
                    ->get(),
                'hours_this_month' => round((float) $myHoursQuery->sum('hours_logged'), 2),
                'attendance_today' => $todayAttendance ? [
                    'status' => $todayAttendance->status,
                    'clocked_in' => $todayAttendance->check_in_at !== null && $todayAttendance->check_out_at === null,
                    'check_in_at' => $todayAttendance->check_in_at,
                    'check_out_at' => $todayAttendance->check_out_at,
                ] : null,
            ];

            // ── 7. Attention Required (each list/count only for callers the
            //       backend would actually let act on it) ─────────────────────
            $attention = ['counts' => []];

            if ($canViewAllInvoices) {
                $overdueInvoicesQuery = DB::table('invoices')
                    ->whereNull('invoices.deleted_at')
                    ->whereIn('invoices.status', self::RECEIVABLE_INVOICE_STATUSES)
                    ->where('invoices.due_date', '<', $today);
                if ($projectId) {
                    $overdueInvoicesQuery->where('invoices.project_id', $projectId);
                }
                $attention['counts']['invoices'] = (clone $overdueInvoicesQuery)->count();
                $attention['counts']['invoices_amount'] = (float) (clone $overdueInvoicesQuery)->sum(DB::raw('invoices.due_amount * invoices.exchange_rate'));
                $attention['overdue_invoices'] = (clone $overdueInvoicesQuery)
                    ->leftJoin('users', 'invoices.client_id', '=', 'users.id')
                    ->select('invoices.id', 'invoices.invoice_number', 'invoices.title', 'invoices.due_date', 'invoices.due_amount', 'users.name as client')
                    ->orderBy('invoices.due_date', 'asc')
                    ->limit(5)
                    ->get();
            }

            // Overdue tasks
            $overdueTasksQuery = DB::table('tasks')
                ->whereNull('tasks.deleted_at')
                ->whereNotIn('tasks.status', ['done', 'cancelled'])
                ->where('tasks.due_date', '<', $today);
            if ($projectId) {
                $overdueTasksQuery->where('tasks.project_id', $projectId);
            }
            if ($canViewAllProjects || $canViewFinancial || $canViewHr) {
                // company-wide / project-wide
            } elseif ($isPm) {
                $overdueTasksQuery
                    ->join('projects', 'tasks.project_id', '=', 'projects.id')
                    ->whereNull('projects.deleted_at')
                    ->where('projects.manager_id', $user->id);
            } else {
                $overdueTasksQuery->where('tasks.assigned_to', $user->id);
            }
            $attention['counts']['tasks'] = (clone $overdueTasksQuery)->count();
            $attention['overdue_tasks'] = (clone $overdueTasksQuery)
                ->leftJoin('users', 'tasks.assigned_to', '=', 'users.id')
                ->select('tasks.id', 'tasks.task_number', 'tasks.title', 'tasks.due_date', 'users.name as assignee')
                ->orderBy('tasks.due_date', 'asc')
                ->limit(5)
                ->get();

            if ($delayedProjectsList !== null) {
                $attention['counts']['projects'] = $delayedProjectsCount;
                $attention['delayed_projects'] = $delayedProjectsList;
            }

            if ($canViewAllLeads) {
                $staleLeadsQuery = DB::table('leads')
                    ->whereNull('deleted_at')
                    ->where('is_converted', false)
                    ->where('updated_at', '<', $now->copy()->subDays(14));
                $attention['counts']['leads'] = (clone $staleLeadsQuery)->count();
                $attention['stale_leads'] = (clone $staleLeadsQuery)
                    ->select('id', 'lead_number', 'company_name', 'priority', 'temperature', 'updated_at')
                    ->orderBy('updated_at', 'asc')
                    ->limit(5)
                    ->get();
            }

            // Pending approvals — only the queues THIS user can act on, so the
            // badge never advertises approvals the backend would 403.
            $pendingApprovalsCount = 0;
            if ($user->hasPermissionTo('quotes.approve')) {
                $pendingApprovalsCount += DB::table('quotes')->whereNull('deleted_at')->where('status', 'pending')->count();
            }
            if ($user->hasPermissionTo('expenses.approve')) {
                $pendingApprovalsCount += DB::table('expenses')->whereNull('deleted_at')->where('status', 'submitted')->count();
            }
            if ($user->hasPermissionTo('timesheets.approve')) {
                $pendingApprovalsCount += DB::table('timesheets')->whereNull('deleted_at')->where('status', 'submitted')->count();
            }
            $attention['counts']['approvals'] = $pendingApprovalsCount;

            if ($user->hasPermissionTo('payroll.view')) {
                // "Pending" payroll = runs still awaiting sign-off. 'approved'
                // is the terminal state (see the Payroll module audit) and was
                // wrongly counted as pending here forever.
                $attention['counts']['payroll'] = DB::table('payroll_runs')
                    ->whereNull('deleted_at')
                    ->whereIn('status', ['draft', 'submitted'])
                    ->count();
            }

            $dashboardData['attention_required'] = $attention;

            return $dashboardData;
        });

        return response()->json($data);
    }

    /**
     * Executive Briefing for the Dashboard.
     * Route: GET /api/v1/reports/dashboard/briefing
     *
     * Separated from dashboardOverview so the dashboard's core data never
     * blocks on an external AI call. The response is honest about its origin:
     * source = 'ai' only when a real model produced the text; source =
     * 'system' when the metrics-derived template was used (AI disabled,
     * keyless, or the call failed). Previously $this->gemini was referenced
     * without ever being injected, so the "AI" briefing ALWAYS threw,
     * silently fell back to the template, and presented it as model output.
     */
    public function dashboardBriefing(Request $request)
    {
        $user = $request->user();
        $projectId = $request->filled('project_id') ? (int) $request->input('project_id') : null;

        // The briefing summarizes revenue and project figures.
        if (!$user->hasPermissionTo('reports.view_financial')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        if ($projectId) {
            $canSeeAllProjects = $user->hasPermissionTo('projects.view_all') || $user->hasPermissionTo('reports.view_financial');
            if (!$canSeeAllProjects) {
                $hasAccess = DB::table('projects')->where('id', $projectId)->where('manager_id', $user->id)->exists();
                if (!$hasAccess) {
                    return response()->json(['message' => 'This action is unauthorized.'], 403);
                }
            }
        }

        $cacheKey = 'dashboard_briefing_v2_' . $user->id . ($projectId ? '_p_' . $projectId : '');
        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 300, function () use ($projectId) {
            $now = Carbon::now();
            $today = $now->toDateString();
            $thisMonthFrom = $now->copy()->startOfMonth();
            $thisMonthTo = $now->copy()->endOfMonth();
            $lastMonthFrom = $now->copy()->subMonth()->startOfMonth();
            $lastMonthTo = $now->copy()->subMonth()->endOfMonth();

            // ── Metrics the briefing summarizes ──────────────────────────────
            $thisMonthRev = (float) $this->financialService->getRevenueSummary($thisMonthFrom, $thisMonthTo, $projectId)['summary']['total_invoiced'];
            $lastMonthRev = (float) $this->financialService->getRevenueSummary($lastMonthFrom, $lastMonthTo, $projectId)['summary']['total_invoiced'];
            $revDiffVal = $lastMonthRev > 0 ? (($thisMonthRev - $lastMonthRev) / $lastMonthRev) * 100 : 0.0;
            $revChangeText = ($revDiffVal >= 0 ? 'increased ' : 'decreased ') . abs(round($revDiffVal, 1)) . '%';

            $overdueInvoicesQuery = DB::table('invoices')
                ->whereNull('deleted_at')
                ->whereIn('status', self::RECEIVABLE_INVOICE_STATUSES)
                ->where('due_date', '<', $today);
            $overdueInvoicesCount = (clone $overdueInvoicesQuery)->count();
            $overdueInvoicesAmount = (float) (clone $overdueInvoicesQuery)->sum(DB::raw('due_amount * exchange_rate'));

            $overdueTasksCount = DB::table('tasks')
                ->whereNull('deleted_at')
                ->whereNotIn('status', ['done', 'cancelled'])
                ->where('due_date', '<', $today)
                ->count();

            $delayedProjectsCount = DB::table('projects')
                ->whereNull('deleted_at')
                ->whereIn('status', self::RUNNING_PROJECT_STATUSES)
                ->where('end_date', '<', $today)
                ->count();

            $openLeadsCount = DB::table('leads')->whereNull('deleted_at')->where('is_converted', false)->count();
            $pendingFollowupsCount = DB::table('lead_followups')
                ->join('leads', 'lead_followups.lead_id', '=', 'leads.id')
                ->whereNull('leads.deleted_at')
                ->where('lead_followups.is_completed', false)
                ->count();
            $staleLeadsCount = DB::table('leads')
                ->whereNull('deleted_at')
                ->where('is_converted', false)
                ->where('updated_at', '<', $now->copy()->subDays(14))
                ->count();

            $pendingApprovalsCount = DB::table('quotes')->whereNull('deleted_at')->where('status', 'pending')->count()
                + DB::table('expenses')->whereNull('deleted_at')->where('status', 'submitted')->count()
                + DB::table('timesheets')->whereNull('deleted_at')->where('status', 'submitted')->count();
            $pendingPayrollCount = DB::table('payroll_runs')
                ->whereNull('deleted_at')
                ->whereIn('status', ['draft', 'submitted'])
                ->count();

            // Average team utilisation this month
            $teamUsers = User::where('status', 'active')->where('is_client_portal_user', false)->with('compensation')->get();
            $timesheetsGrouped = DB::table('timesheets')
                ->whereIn('user_id', $teamUsers->pluck('id')->toArray())
                ->whereIn('status', ['submitted', 'approved'])
                ->whereBetween('date', [$thisMonthFrom->toDateString(), $thisMonthTo->toDateString()])
                ->whereNull('deleted_at')
                ->get()
                ->groupBy('user_id');
            $totalExpected = 0.0;
            $totalLogged = 0.0;
            foreach ($teamUsers as $tu) {
                $util = $this->utilisationService->calculateForUser($tu, $thisMonthFrom, $thisMonthTo, $timesheetsGrouped->get($tu->id, collect([])));
                if ($util['expected_hours'] > 0 || $util['logged_hours'] > 0) {
                    $totalExpected += $util['expected_hours'];
                    $totalLogged += $util['logged_hours'];
                }
            }
            $avgUtilisationPct = $totalExpected > 0 ? round(($totalLogged / $totalExpected) * 100, 1) : 0.0;

            // Most profitable running project (all-time figures, batched)
            $mostProfitableProjectName = 'None';
            $mostProfitableProjectMargin = 0.0;
            $mostProfitableProjectProfit = 0.0;
            $runningProjects = Project::whereIn('status', self::RUNNING_PROJECT_STATUSES)->with('invoice')->get();
            if ($runningProjects->count() > 0) {
                $pIds = $runningProjects->pluck('id')->toArray();
                $profitTimesheets = DB::table('timesheets')
                    ->whereIn('project_id', $pIds)
                    ->whereIn('status', ['submitted', 'approved'])
                    ->whereNull('deleted_at')
                    ->get()
                    ->groupBy('project_id');
                $profitExpenses = DB::table('expenses')
                    ->select('project_id', DB::raw('sum(amount) as total_expenses'))
                    ->whereIn('project_id', $pIds)
                    ->whereIn('status', ['approved', 'reimbursed'])
                    ->whereNull('deleted_at')
                    ->groupBy('project_id')
                    ->get()
                    ->keyBy('project_id');
                $hourlyRates = User::with('compensation')->get()->mapWithKeys(function ($u) {
                    return [$u->id => $u->hourly_rate];
                })->toArray();

                foreach ($runningProjects as $proj) {
                    $profit = $this->profitabilityService->calculate(
                        $proj,
                        null,
                        null,
                        $profitTimesheets->get($proj->id, collect([])),
                        (float) ($profitExpenses->get($proj->id)->total_expenses ?? 0.0),
                        $hourlyRates
                    );
                    if ($profit['net_profit'] > $mostProfitableProjectProfit) {
                        $mostProfitableProjectProfit = $profit['net_profit'];
                        $mostProfitableProjectMargin = $profit['margin_percentage'];
                        $mostProfitableProjectName = $proj->name;
                    }
                }
            }

            // ── AI generation (only when a real model is reachable) ─────────
            $aiJson = null;
            if ($this->gemini->isConfigured()) {
                $aiPrompt = "You are AZUN, the Executive Business Assistant of Creativals OS. Summarize these live business metrics for the Founder/CEO. Keep it to 2 short paragraphs under 250 words total.
                Metrics:
                - Revenue this month: ₹" . number_format($thisMonthRev) . " (which {$revChangeText} vs last month: ₹" . number_format($lastMonthRev) . ").
                - Overdue invoices: {$overdueInvoicesCount} invoices worth ₹" . number_format($overdueInvoicesAmount) . " are past due.
                - Delayed projects: {$delayedProjectsCount} projects are running but past their deadline.
                - Overdue tasks: {$overdueTasksCount} tasks are overdue.
                - CRM: {$openLeadsCount} open leads; {$pendingFollowupsCount} scheduled follow-ups still pending; {$staleLeadsCount} leads have gone quiet for 14+ days.
                - Team utilization: average team utilization is {$avgUtilisationPct}%.
                - Most profitable running project: '{$mostProfitableProjectName}' (Margin: {$mostProfitableProjectMargin}%).
                - Pending actions: {$pendingApprovalsCount} approvals pending, {$pendingPayrollCount} payroll runs awaiting sign-off.

                Format the response as JSON with two fields:
                - \"briefing\": a beautiful, executive-style, 1st person summary (e.g. \"Revenue increased 18% this month...\")
                - \"recommendations\": array of 3 actionable items (e.g. [\"Follow up on overdue invoices first\", ...])
                Do not output markdown codeblocks (like ```json), output raw JSON only.";

                try {
                    $aiRes = $this->gemini->chatWithoutTools([
                        ['role' => 'user', 'content' => $aiPrompt],
                    ]);
                    $content = preg_replace('/^```json\s*/i', '', $aiRes['content'] ?? '');
                    $content = preg_replace('/```$/', '', trim($content));
                    $decoded = json_decode($content, true);
                    if (is_array($decoded) && !empty($decoded['briefing'])) {
                        $aiJson = [
                            'briefing' => (string) $decoded['briefing'],
                            'recommendations' => array_slice(array_values(array_filter(array_map(
                                function ($r) {
                                    return is_string($r) ? $r : null;
                                },
                                (array) ($decoded['recommendations'] ?? [])
                            ))), 0, 3),
                        ];
                    }
                } catch (\Throwable $e) {
                    Log::error('Dashboard AI briefing failure', ['exception' => $e->getMessage()]);
                }
            }

            if ($aiJson) {
                return [
                    'briefing' => $aiJson['briefing'],
                    'recommendations' => $aiJson['recommendations'],
                    'source' => 'ai',
                    'generated_at' => $now->toIso8601String(),
                ];
            }

            // Honest metrics-derived fallback — labeled 'system' so the UI
            // never presents it as model-written text.
            $briefingText = "Revenue " . ($revDiffVal >= 0 ? "increased by " : "decreased by ") . abs(round($revDiffVal, 1)) . "% this month compared to last month. " .
                "Currently, {$overdueInvoicesCount} overdue invoices totaling ₹" . number_format($overdueInvoicesAmount) . " require follow-up. " .
                "Operations show {$delayedProjectsCount} projects behind schedule and {$overdueTasksCount} tasks past their due dates. " .
                "The pipeline has {$openLeadsCount} open leads with {$pendingFollowupsCount} scheduled follow-ups pending, and average team utilization is holding at {$avgUtilisationPct}%. " .
                ($mostProfitableProjectName !== 'None'
                    ? "The top-margin running project is '{$mostProfitableProjectName}' at {$mostProfitableProjectMargin}% profitability."
                    : "No running project currently shows a positive net profit.");

            $recs = [];
            if ($overdueInvoicesCount > 0) {
                $recs[] = "Follow up on the {$overdueInvoicesCount} overdue invoices worth ₹" . number_format($overdueInvoicesAmount) . ".";
            }
            if ($delayedProjectsCount > 0 || $overdueTasksCount > 0) {
                $recs[] = "Review delivery schedules for {$delayedProjectsCount} delayed projects and reassign the {$overdueTasksCount} overdue tasks.";
            }
            if ($pendingApprovalsCount > 0) {
                $recs[] = "Clear the {$pendingApprovalsCount} pending approvals (quotes/expenses/timesheets) to unblock billing and workflows.";
            }
            if (count($recs) < 3) {
                $recs[] = "Follow up with warm and hot leads in the sales pipeline to boost next month's bookings.";
            }

            return [
                'briefing' => $briefingText,
                'recommendations' => array_slice($recs, 0, 3),
                'source' => 'system',
                'generated_at' => $now->toIso8601String(),
            ];
        });

        return response()->json($data);
    }
}
