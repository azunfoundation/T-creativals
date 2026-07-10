<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Lead;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class LeadReportService
{
    /**
     * Calculate sales pipeline and lead conversion metrics.
     *
     * @param Carbon $from
     * @param Carbon $to
     * @param string $dateType 'created' or 'converted'
     * @return array
     */
    public function getPipelineSummary(Carbon $from, Carbon $to, string $dateType = 'created'): array
    {
        $dateField = $dateType === 'converted' ? 'converted_at' : 'created_at';

        // ── 1. Totals Query ───────────────────────────────────────────────────
        $query = Lead::query();

        if ($dateType === 'converted') {
            // Only leads converted in the range
            $query->where('is_converted', true)
                  ->whereBetween('converted_at', [$from->startOfDay(), $to->endOfDay()]);
        } else {
            // Leads created in the range
            $query->whereBetween('created_at', [$from->startOfDay(), $to->endOfDay()]);
        }

        $leads = $query->get();

        // Dual metrics for the period (always calculated to show side-by-side)
        $createdCount = Lead::whereBetween('created_at', [$from->startOfDay(), $to->endOfDay()])->count();
        $convertedCount = Lead::where('is_converted', true)
            ->whereBetween('converted_at', [$from->startOfDay(), $to->endOfDay()])
            ->count();

        $conversionRatePct = $createdCount > 0
            ? round(($convertedCount / $createdCount) * 100, 2)
            : 0.00;

        $avgBudget = $leads->avg('estimated_monthly_budget') ?? 0.00;
        $totalPipelineValue = $leads->where('is_converted', false)->sum('estimated_monthly_budget');

        // ── 2. Breakdown by Stage ─────────────────────────────────────────────
        $byStage = DB::table('leads')
            ->join('lead_stages', 'leads.stage_id', '=', 'lead_stages.id')
            ->select(
                'lead_stages.name as stage_name',
                'lead_stages.color as stage_color',
                DB::raw('count(leads.id) as lead_count'),
                DB::raw('sum(leads.estimated_monthly_budget) as total_budget')
            )
            ->whereNull('leads.deleted_at')
            ->groupBy('lead_stages.name', 'lead_stages.color', 'lead_stages.sort_order')
            ->orderBy('lead_stages.sort_order');

        if ($dateType === 'converted') {
            $byStage->where('leads.is_converted', true)
                    ->whereBetween('leads.converted_at', [$from->startOfDay(), $to->endOfDay()]);
        } else {
            $byStage->whereBetween('leads.created_at', [$from->startOfDay(), $to->endOfDay()]);
        }

        // ── 3. Breakdown by Source ────────────────────────────────────────────
        $bySource = DB::table('leads')
            ->join('lead_sources', 'leads.lead_source_id', '=', 'lead_sources.id')
            ->select(
                'lead_sources.name as source_name',
                'lead_sources.color as source_color',
                DB::raw('count(leads.id) as lead_count'),
                DB::raw('sum(case when leads.is_converted = 1 then 1 else 0 end) as conversion_count')
            )
            ->whereNull('leads.deleted_at')
            ->groupBy('lead_sources.name', 'lead_sources.color');

        if ($dateType === 'converted') {
            $bySource->where('leads.is_converted', true)
                     ->whereBetween('leads.converted_at', [$from->startOfDay(), $to->endOfDay()]);
        } else {
            $bySource->whereBetween('leads.created_at', [$from->startOfDay(), $to->endOfDay()]);
        }

        $bySourceResults = $bySource->get()->map(function ($row) {
            $row->conversion_rate_pct = $row->lead_count > 0
                ? round(($row->conversion_count / $row->lead_count) * 100, 2)
                : 0.00;
            return $row;
        });

        // ── 4. Breakdown by Executive ─────────────────────────────────────────
        $byExec = DB::table('leads')
            ->join('users', 'leads.sales_exec_id', '=', 'users.id')
            ->select(
                'users.name as exec_name',
                DB::raw('count(leads.id) as lead_count'),
                DB::raw('sum(case when leads.is_converted = 1 then 1 else 0 end) as converted_count'),
                DB::raw('sum(case when leads.is_converted = 0 then leads.estimated_monthly_budget else 0 end) as total_pipeline_value')
            )
            ->whereNull('leads.deleted_at')
            ->groupBy('users.name');

        if ($dateType === 'converted') {
            $byExec->where('leads.is_converted', true)
                   ->whereBetween('leads.converted_at', [$from->startOfDay(), $to->endOfDay()]);
        } else {
            $byExec->whereBetween('leads.created_at', [$from->startOfDay(), $to->endOfDay()]);
        }

        $byExecResults = $byExec->get()->map(function ($row) {
            $row->conversion_rate_pct = $row->lead_count > 0
                ? round(($row->converted_count / $row->lead_count) * 100, 2)
                : 0.00;
            return $row;
        });

        // ── 5. Lead Temperature Split ─────────────────────────────────────────
        $tempQuery = Lead::query();
        if ($dateType === 'converted') {
            $tempQuery->where('is_converted', true)
                      ->whereBetween('converted_at', [$from->startOfDay(), $to->endOfDay()]);
        } else {
            $tempQuery->whereBetween('created_at', [$from->startOfDay(), $to->endOfDay()]);
        }
        $temperatures = $tempQuery->select('temperature', DB::raw('count(*) as count'))
            ->groupBy('temperature')
            ->pluck('count', 'temperature');

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'date_type' => $dateType,
            ],
            'summary' => [
                'total_leads' => $leads->count(),
                'converted_leads' => $leads->where('is_converted', true)->count(),
                'conversion_rate_pct' => $conversionRatePct,
                'avg_budget' => round((float) $avgBudget, 2),
                'total_pipeline_value' => round((float) $totalPipelineValue, 2),
                'leads_created_period' => $createdCount,
                'leads_converted_period' => $convertedCount,
            ],
            'by_stage' => $byStage->get(),
            'by_source' => $bySourceResults,
            'by_exec' => $byExecResults,
            'temperature_split' => [
                'cold_count' => $temperatures->get('cold', 0),
                'warm_count' => $temperatures->get('warm', 0),
                'hot_count' => $temperatures->get('hot', 0),
            ],
        ];
    }
}
