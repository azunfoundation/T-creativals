'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reports } from '@/lib/api';
import ReportShell from '@/components/reports/ReportShell';
import KpiCard from '@/components/reports/KpiCard';
import LineChart from '@/components/reports/LineChart';
import ReportTable from '@/components/reports/ReportTable';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { useToast } from '@/hooks/useToast';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, CheckCircle2, Clock, AlertTriangle, ListChecks } from 'lucide-react';

export default function ExpenseBreakdownReport() {
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
    queryKey: ['reports', 'expenses', dates.from, dates.to],
    queryFn: async () => {
      const res = await reports.getExpenses({ from: dates.from, to: dates.to });
      return res.data;
    },
  });

  const handleExport = async () => {
    try {
      const res = await reports.exportCsv('expenses', { from: dates.from, to: dates.to });
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `expense_breakdown_${dates.from}_to_${dates.to}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const catColumns = [
    {
      key: 'category_name',
      label: 'Category',
      render: (val: any, row: any) => (
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ backgroundColor: row.category_color || 'var(--text-muted)' }}
          />
          <span>{val}</span>
        </div>
      ),
    },
    { key: 'count', label: 'Item Count', align: 'center' as const, sortable: true },
    {
      key: 'total_amount',
      label: 'Total Allocated',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => <span className="font-mono text-emerald-400 font-semibold">{formatCurrency(Number(val))}</span>,
    },
  ];

  const vendorColumns = [
    { key: 'vendor_name', label: 'Vendor Name' },
    { key: 'count', label: 'Item Count', align: 'center' as const, sortable: true },
    {
      key: 'total_amount',
      label: 'Total Spent',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => <span className="font-mono text-slate-350">{formatCurrency(Number(val))}</span>,
    },
  ];

  const projColumns = [
    { key: 'project_name', label: 'Project Allocation' },
    { key: 'count', label: 'Allocated Items', align: 'center' as const, sortable: true },
    {
      key: 'total_amount',
      label: 'Total Cost',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => <span className="font-mono text-indigo-400">{formatCurrency(Number(val))}</span>,
    },
  ];

  return (
    <ReportShell
      title="Expense Breakdown Report"
      description="Track operational overheads, vendor payouts, and category-level/project-level expense distributions."
      titleHelp={
        <HelpIcon
          title="Expense Breakdown Report"
          content={{
            what: 'Expenses logged in the selected date range (by expense date), broken down by category, vendor, and project — normalized to INR.',
            why: 'Separates what has actually cleared approval (Approved) from what is still Pending or was Rejected, so the totals reflect real committed spend, not just requests.',
          }}
        />
      }
      guide={
        <HowToUseGuide
          moduleKey="reports_expenses"
          title="Expense Breakdown Report"
          content={{
            overview: 'Shows where operational spend is going — by category, vendor, and project — for any date range.',
            sections: [
              {
                heading: 'What it shows',
                items: [
                  'Total Submitted — every expense logged in the period, regardless of approval status.',
                  'Approved — expenses that cleared approval (includes reimbursed ones).',
                  'Pending — awaiting PM/finance action. Rejected — declined.',
                  '"Overhead / General" in the By Project breakdown means the expense wasn\'t tied to a specific project.',
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            <KpiCard
              title="Total Submitted"
              value={formatCurrency(data.summary.total_submitted)}
              subtext="Aggregated Expenses"
              icon={<CreditCard className="w-5 h-5 text-indigo-400" />}
            />
            <KpiCard
              title="Approved Expenses"
              value={formatCurrency(data.summary.total_approved)}
              subtext="Cleared Payouts"
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            />
            <KpiCard
              title="Pending Approval"
              value={formatCurrency(data.summary.total_pending)}
              subtext="Awaiting PM Action"
              icon={<Clock className="w-5 h-5 text-amber-400" />}
            />
            <KpiCard
              title="Rejected Expenses"
              value={formatCurrency(data.summary.total_rejected)}
              subtext="Declined Outlays"
              icon={<AlertTriangle className="w-5 h-5 text-rose-450" />}
            />
            <KpiCard
              title="Expense Count"
              value={data.summary.expense_count}
              subtext="Total Line Items"
              icon={<ListChecks className="w-5 h-5" />}
            />
          </div>

          {/* Line Chart Trend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 className="kpi-label" style={{ fontSize: '0.8125rem' }}>Expense Trend (INR)</h3>
            <LineChart
              data={data.trend}
              xKey="month_key"
              yKey="approved_amount"
              secondaryYKey="submitted_amount"
              valueFormatter={(val) => formatCurrency(val)}
            />
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', justifyContent: 'flex-end', padding: '0 1rem' }}>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Approved
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-sky-500 inline-block" /> Submitted
              </span>
            </div>
          </div>

          {/* Breakdown Tables Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Categories */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 className="kpi-label" style={{ fontSize: '0.8125rem' }}>By Category</h3>
              <ReportTable columns={catColumns} data={data.by_category} pageSize={5} />
            </div>

            {/* Vendors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 className="kpi-label" style={{ fontSize: '0.8125rem' }}>By Vendor</h3>
              <ReportTable columns={vendorColumns} data={data.by_vendor} pageSize={5} />
            </div>

            {/* Projects */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 className="kpi-label" style={{ fontSize: '0.8125rem' }}>By Project Allocation</h3>
              <ReportTable columns={projColumns} data={data.by_project} pageSize={5} />
            </div>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
