<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Project;
use Carbon\Carbon;
use Illuminate\Support\Facades\Gate;

class ProfitabilityService
{
    /**
     * Calculate project profitability.
     *
     * Formula: Net Profit = Revenue - Labor Cost - Expense Cost
     *
     * @param Project $project
     * @param Carbon|null $from
     * @param Carbon|null $to
     * @return array
     */
    public function calculate(Project $project, ?Carbon $from = null, ?Carbon $to = null, $preFetchedTimesheets = null, $preFetchedExpensesSum = null, $userHourlyRates = null): array
    {
        // ── 1. Revenue ────────────────────────────────────────────────────────
        $revenueStatuses = ['approved', 'sent', 'paid', 'partially_paid', 'overdue'];
        $revenue = (float) $project->budget_amount; // default fallback

        if ($project->invoice_id) {
            $invoice = $project->invoice;
            if ($invoice && in_array($invoice->status, $revenueStatuses, true)) {
                $revenue = (float) $invoice->total_amount;
            }
        }

        // ── 2. Labor Cost ─────────────────────────────────────────────────────
        if ($preFetchedTimesheets !== null) {
            $timesheets = $preFetchedTimesheets;
        } else {
            $timesheetQuery = $project->timesheets()
                ->whereIn('status', ['submitted', 'approved'])
                ->with(['user.compensation']);

            if ($from) {
                $timesheetQuery->where('date', '>=', $from->toDateString());
            }
            if ($to) {
                $timesheetQuery->where('date', '<=', $to->toDateString());
            }

            $timesheets = $timesheetQuery->get();
        }

        $laborCost = 0.0;
        $hoursLogged = 0.0;
        foreach ($timesheets as $timesheet) {
            $hours = (float) $timesheet->hours_logged;
            $hoursLogged += $hours;
            
            if ($userHourlyRates !== null) {
                $hourlyRate = (float) ($userHourlyRates[$timesheet->user_id] ?? 0.0);
            } else {
                $hourlyRate = $timesheet->user ? (float) $timesheet->user->hourly_rate : 0.0;
            }
            $laborCost += $hours * $hourlyRate;
        }

        // ── 3. Expense Cost ───────────────────────────────────────────────────
        if ($preFetchedExpensesSum !== null) {
            $expenseCost = (float) $preFetchedExpensesSum;
        } else {
            $expenseQuery = $project->expenses()
                ->whereIn('status', ['approved', 'reimbursed']);

            if ($from) {
                $expenseQuery->where('expense_date', '>=', $from->toDateString());
            }
            if ($to) {
                $expenseQuery->where('expense_date', '<=', $to->toDateString());
            }

            $expenseCost = (float) $expenseQuery->sum('amount');
        }

        // ── 4. Calculations ───────────────────────────────────────────────────
        $totalCost = $laborCost + $expenseCost;
        $netProfit = $revenue - $totalCost;
        $marginPercentage = $revenue > 0
            ? round(($netProfit / $revenue) * 100, 2)
            : 0.00;

        return [
            'project_id' => $project->id,
            'project_name' => $project->name,
            'project_number' => $project->project_number,
            'status' => $project->status,
            'start_date' => $project->start_date?->toDateString(),
            'end_date' => $project->end_date?->toDateString(),
            'budget_amount' => round((float) $project->budget_amount, 2),
            'hours_logged' => round($hoursLogged, 2),
            'revenue' => round($revenue, 2),
            'labor_cost' => round($laborCost, 2),
            'expense_cost' => round($expenseCost, 2),
            'total_cost' => round($totalCost, 2),
            'net_profit' => round($netProfit, 2),
            'margin_percentage' => $marginPercentage,
        ];
    }
}
