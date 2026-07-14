'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reports } from '@/lib/api';
import ReportShell from '@/components/reports/ReportShell';
import KpiCard from '@/components/reports/KpiCard';
import ReportTable from '@/components/reports/ReportTable';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { statusBadgeConfig } from '@/components/ui/StatusBadge';
import { useToast } from '@/hooks/useToast';
import { formatCurrency } from '@/lib/utils';
import { Briefcase, Wallet, Users, CreditCard, Sparkles, TrendingUp } from 'lucide-react';

export default function ProjectProfitabilityReport() {
  const getInitialDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    let fyStartYear = year;
    if (now.getMonth() < 3) fyStartYear = year - 1;
    return { from: `${fyStartYear}-04-01`, to: `${fyStartYear + 1}-03-31` };
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
    const config = statusBadgeConfig('project', status);
    return (
      <span className={`badge ${config.className}`} style={{ textTransform: 'uppercase' }}>
        {config.label}
      </span>
    );
  };

  const columns = [
    {
      key: 'project_name',
      label: 'Project Details',
      render: (val: any, row: any) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{val}</div>
          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: '2px' }}>{row.project_number}</div>
        </div>
      ),
    },
    { key: 'status', label: 'Status', align: 'center' as const, render: (val: any) => getStatusBadge(val) },
    {
      key: 'hours_logged',
      label: 'Hours',
      align: 'center' as const,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{val} hrs</span>,
    },
    {
      key: 'revenue',
      label: 'Billed / Budget',
      align: 'right' as const,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'labor_cost',
      label: 'Labor Cost',
      align: 'right' as const,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'expense_cost',
      label: 'Expenses',
      align: 'right' as const,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'net_profit',
      label: 'Net Profit',
      align: 'right' as const,
      render: (val: any) => {
        const amt = Number(val);
        return (
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: amt >= 0 ? 'var(--success)' : 'var(--danger)' }}>
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
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: pct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {pct}%
          </span>
        );
      },
    },
  ];

  const profitAccent = data && data.summary.total_net_profit >= 0 ? 'success' : 'danger';
  const marginAccent = data && data.summary.avg_margin_pct >= 0 ? 'success' : 'danger';

  return (
    <ReportShell
      title="Project Profitability Report"
      description="Compare project budget/revenue against timesheet labor costs and direct expenses to analyze net margins."
      titleHelp={
        <HelpIcon
          title="Project Profitability Report"
          content={{
            what: 'Revenue (linked invoice total, or budget if not yet invoiced) vs. timesheet labor cost and approved expenses logged in the period, for every project active at any point during it.',
            why: 'A project counts as "in scope" if it overlaps the selected period at all — not only if it started inside it.',
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
            <KpiCard title="Projects in Scope" value={data.summary.project_count} subtext="Active During Period" icon={<Briefcase size={18} />} accent="info" />
            <KpiCard title="Total Revenue" value={formatCurrency(data.summary.total_revenue)} subtext="Project Billed/Revenue" icon={<Wallet size={18} />} accent="success" />
            <KpiCard title="Labor Cost" value={formatCurrency(data.summary.total_labor_cost)} subtext="Timesheet Hourly Cost" icon={<Users size={18} />} accent="accent" />
            <KpiCard title="Direct Expenses" value={formatCurrency(data.summary.total_expense_cost)} subtext="Approved Allocations" icon={<CreditCard size={18} />} accent="danger" />
            <KpiCard title="Net Profit" value={formatCurrency(data.summary.total_net_profit)} subtext="Revenue - Labor - Expense" icon={<Sparkles size={18} />} accent={profitAccent as any} />
            <KpiCard title="Avg Margin" value={`${data.summary.avg_margin_pct}%`} subtext="Return on Projects" icon={<TrendingUp size={18} />} accent={marginAccent as any} />
          </div>

          {/* Breakdown Table */}
          <div className="report-section">
            <p className="report-section-title">Per-Project Profitability Breakdown</p>
            <ReportTable columns={columns} data={data.breakdown} />
          </div>
        </div>
      )}
    </ReportShell>
  );
}
