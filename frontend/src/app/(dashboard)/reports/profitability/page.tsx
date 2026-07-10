'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reports } from '@/lib/api';
import ReportShell from '@/components/reports/ReportShell';
import KpiCard from '@/components/reports/KpiCard';
import ReportTable from '@/components/reports/ReportTable';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { useToast } from '@/hooks/useToast';
import { formatCurrency } from '@/lib/utils';
import { Briefcase, Wallet, Users, CreditCard, Sparkles, TrendingUp } from 'lucide-react';

export default function ProjectProfitabilityReport() {
  const getInitialDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    let fyStartYear = year;
    if (now.getMonth() < 3) {
      fyStartYear = year - 1;
    }
    return {
      from: `${fyStartYear}-04-01`,
      to: `${fyStartYear + 1}-03-31`,
    };
  };

  const [dates, setDates] = useState(getInitialDates());
  const { showToast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'profitability', dates.from, dates.to],
    queryFn: async () => {
      const res = await reports.getProfitability({ from: dates.from, to: dates.to });
      return res.data;
    },
  });

  const handleExport = async () => {
    try {
      const res = await reports.exportCsv('profitability', { from: dates.from, to: dates.to });
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `project_profitability_${dates.from}_to_${dates.to}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      planning: 'badge-info',
      active: 'badge-accent',
      on_hold: 'badge-warning',
      completed: 'badge-success',
      cancelled: 'badge-danger',
    };
    const badgeClass = map[status] || 'badge-muted';
    return (
      <span className={`badge ${badgeClass}`}>
        {status.toUpperCase().replace('_', ' ')}
      </span>
    );
  };

  const columns = [
    {
      key: 'project_name',
      label: 'Project Details',
      render: (val: any, row: any) => (
        <div>
          <div className="font-bold text-slate-200">{val}</div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5">{row.project_number}</div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center' as const,
      render: (val: any) => getStatusBadge(val),
    },
    {
      key: 'hours_logged',
      label: 'Hours',
      align: 'center' as const,
      render: (val: any) => <span className="font-mono text-slate-400">{val} hrs</span>,
    },
    {
      key: 'revenue',
      label: 'Billed / Budget',
      align: 'right' as const,
      render: (val: any) => <span className="font-mono text-slate-300">{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'labor_cost',
      label: 'Labor Cost',
      align: 'right' as const,
      render: (val: any) => <span className="font-mono text-slate-400">{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'expense_cost',
      label: 'Expenses',
      align: 'right' as const,
      render: (val: any) => <span className="font-mono text-slate-450">{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'net_profit',
      label: 'Net Profit',
      align: 'right' as const,
      render: (val: any) => {
        const amt = Number(val);
        return (
          <span className={`font-mono font-semibold ${amt >= 0 ? 'text-emerald-400' : 'text-rose-450'}`}>
            {formatCurrency(amt)}
          </span>
        );
      },
    },
    {
      key: 'margin_percentage',
      label: 'Margin %',
      align: 'right' as const,
      render: (val: any) => {
        const pct = Number(val);
        return (
          <span className={`font-mono font-bold ${pct >= 0 ? 'text-emerald-455' : 'text-rose-500'}`}>
            {pct}%
          </span>
        );
      },
    },
  ];

  const profitColor = data && data.summary.total_net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400';
  const marginColor = data && data.summary.avg_margin_pct >= 0 ? 'text-emerald-400' : 'text-rose-400';

  return (
    <ReportShell
      title="Project Profitability Report"
      description="Compare project budget/revenue against timesheet labor costs and direct expenses to analyze net margins."
      titleHelp={
        <HelpIcon
          title="Project Profitability Report"
          content={{
            what: 'Revenue (linked invoice total, or budget if not yet invoiced) vs. timesheet labor cost and approved expenses logged in the period, for every project active at any point during it.',
            why: 'A project counts as "in scope" if it overlaps the selected period at all — not only if it started inside it — so an ongoing project\'s costs for this period are never silently dropped.',
          }}
        />
      }
      guide={
        <HowToUseGuide
          moduleKey="reports_profitability"
          title="Project Profitability Report"
          content={{
            overview: 'Compares what each project is worth against what it actually cost to deliver, for any date range.',
            sections: [
              {
                heading: 'What it shows',
                items: [
                  'Revenue — the project\'s linked invoice total (if approved/sent/paid), otherwise its budget amount.',
                  'Labor Cost — approved/submitted timesheet hours in the period × each person\'s hourly rate.',
                  'Direct Expenses — approved/reimbursed expenses logged against the project in the period.',
                  'Net Profit / Margin — Revenue minus Labor Cost and Expenses.',
                ],
              },
              {
                heading: 'Who sees what',
                items: [
                  'Project Managers only see profitability for projects they manage.',
                  'Finance, Founder, and Director see every project.',
                ],
              },
            ],
          }}
        />
      }
      from={dates.from}
      to={dates.to}
      onDateChange={(from, to) => setDates({ from, to })}
      onExport={handleExport}
      isLoading={isLoading}
      error={error ? (error as any).message : null}
    >
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
            <KpiCard
              title="Projects in Scope"
              value={data.summary.project_count}
              subtext="Active During Period"
              icon={<Briefcase className="w-5 h-5 text-sky-400" />}
            />
            <KpiCard
              title="Total Revenue"
              value={formatCurrency(data.summary.total_revenue)}
              subtext="Project Billed/Revenue"
              icon={<Wallet className="w-5 h-5" />}
            />
            <KpiCard
              title="Labor Cost"
              value={formatCurrency(data.summary.total_labor_cost)}
              subtext="Timesheet Hourly Cost"
              icon={<Users className="w-5 h-5 text-violet-400" />}
            />
            <KpiCard
              title="Direct Expenses"
              value={formatCurrency(data.summary.total_expense_cost)}
              subtext="Approved Allocations"
              icon={<CreditCard className="w-5 h-5 text-rose-400" />}
            />
            <KpiCard
              title="Net Profit"
              value={formatCurrency(data.summary.total_net_profit)}
              subtext="Revenue - Labor - Expense"
              icon={<Sparkles className={`w-5 h-5 ${profitColor}`} />}
            />
            <KpiCard
              title="Avg Margin"
              value={`${data.summary.avg_margin_pct}%`}
              subtext="Return on Projects"
              icon={<TrendingUp className={`w-5 h-5 ${marginColor}`} />}
            />
          </div>

          {/* Project Breakdown Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 className="kpi-label" style={{ fontSize: '0.8125rem' }}>Per-Project Profitability Breakdown</h3>
            <ReportTable columns={columns} data={data.breakdown} />
          </div>
        </div>
      )}
    </ReportShell>
  );
}
