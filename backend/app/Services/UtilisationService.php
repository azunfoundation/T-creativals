<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonPeriod;

class UtilisationService
{
    /**
     * Calculate utilisation for a user in a given date range.
     *
     * @param User $user
     * @param Carbon $from
     * @param Carbon $to
     * @return array
     */
    public function calculateForUser(User $user, Carbon $from, Carbon $to, $preFetchedTimesheets = null): array
    {
        // ── 1. Logged Hours ───────────────────────────────────────────────────
        $timesheets = $preFetchedTimesheets !== null
            ? $preFetchedTimesheets
            : $user->timesheets()
                ->whereIn('status', ['submitted', 'approved'])
                ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
                ->get();

        $loggedHours = 0.0;
        $billableHours = 0.0;

        foreach ($timesheets as $timesheet) {
            $hours = (float) $timesheet->hours_logged;
            $loggedHours += $hours;
            if ($timesheet->is_billable) {
                $billableHours += $hours;
            }
        }

        // ── 2. Expected Hours (Prorated) ──────────────────────────────────────
        $expectedHours = $this->calculateExpectedHours($user, $from, $to);

        // ── 3. Derived Metrics ────────────────────────────────────────────────
        $utilisationPct = $expectedHours > 0
            ? round(($loggedHours / $expectedHours) * 100, 2)
            : 0.00;

        $billableRatePct = $loggedHours > 0
            ? round(($billableHours / $loggedHours) * 100, 2)
            : 0.00;

        return [
            'user_id' => $user->id,
            'user_name' => $user->name,
            'department' => $user->departments->first()?->name ?? 'Unassigned',
            'expected_hours' => round($expectedHours, 2),
            'logged_hours' => round($loggedHours, 2),
            'billable_hours' => round($billableHours, 2),
            'utilisation_pct' => $utilisationPct,
            'billable_rate_pct' => $billableRatePct,
        ];
    }

    /**
     * Calculate expected working hours for a user in a given date range (prorated).
     *
     * @param User $user
     * @param Carbon $from
     * @param Carbon $to
     * @return float
     */
    public function calculateExpectedHours(User $user, Carbon $from, Carbon $to): float
    {
        $compensation = $user->compensation;
        if (!$compensation) {
            return 0.00;
        }

        $expectedMonthlyHours = (float) $compensation->expected_monthly_hours;
        if ($expectedMonthlyHours <= 0) {
            return 0.00;
        }

        $totalExpectedHours = 0.0;

        // Iterate month by month through the period
        $start = $from->copy()->startOfDay();
        $end = $to->copy()->endOfDay();

        $current = $start->copy();
        while ($current->lt($end)) {
            $monthStart = $current->copy()->startOfMonth();
            $monthEnd = $current->copy()->endOfMonth();

            // Determine the overlap start and end dates
            $overlapStart = $start->gt($monthStart) ? $start : $monthStart;
            $overlapEnd = $end->lt($monthEnd) ? $end : $monthEnd;

            // Number of days in overlap (inclusive)
            $overlapDays = $overlapStart->copy()->startOfDay()->diffInDays($overlapEnd->copy()->startOfDay()) + 1;
            $daysInMonth = $current->daysInMonth;

            // Pro-rate the expected monthly hours
            $totalExpectedHours += $expectedMonthlyHours * ($overlapDays / $daysInMonth);

            // Move to next month
            $current->addMonth()->startOfMonth();
        }

        return $totalExpectedHours;
    }
}
