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
import { ShieldCheck, Coins, Users, CreditCard, Gift } from 'lucide-react';

export default function PayrollSummaryReport() {
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
    queryKey: ['reports', 'payroll', dates.from, dates.to],
    queryFn: async () => {
      const res = await reports.getPayroll({ from: dates.from, to: dates.to });
      return res.data;
    },
  });

  const handleExport = async () => {
    try {
      const res = await reports.exportCsv('payroll', { from: dates.from, to: dates.to });
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payroll_summary_${dates.from}_to_${dates.to}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const getMonthName = (monthNum: number) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum - 1] || String(monthNum);
  };

  const runColumns = [
    { key: 'run_number', label: 'Run Number' },
    { key: 'period', label: 'Pay Period', render: (_: any, row: any) => `${getMonthName(row.month)} ${row.year}` },
    { key: 'employee_count', label: 'Employees', align: 'center' as const },
    {
      key: 'status',
      label: 'Status',
      align: 'center' as const,
      render: (val: any) => {
        const badgeClass = val === 'paid' ? 'badge-success' : 'badge-warning';
        return <span className={`badge ${badgeClass}`}>{String(val).toUpperCase()}</span>;
      },
    },
    {
      key: 'total_gross',
      label: 'Gross Cost',
      align: 'right' as const,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'total_net',
      label: 'Net Disbursed',
      align: 'right' as const,
      render: (val: any) => <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(Number(val))}</span>,
    },
  ];

  const earnerColumns = [
    { key: 'user_name', label: 'Employee Name' },
    {
      key: 'base_salary',
      label: 'Base Pay',
      align: 'right' as const,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'bonus_amount',
      label: 'Bonus',
      align: 'right' as const,
      render: (val: any) => (
        <span style={{ fontFamily: 'monospace', color: 'var(--success)', fontWeight: 500 }}>
          {Number(val) > 0 ? `+${formatCurrency(Number(val))}` : '-'}
        </span>
      ),
    },
    {
      key: 'net_salary',
      label: 'Total Net Payout',
      align: 'right' as const,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--success)', fontWeight: 600 }}>{formatCurrency(Number(val))}</span>,
    },
  ];

  return (
    <ReportShell
      title="Payroll Summary Report"
      description="View company payroll summaries, gross disbursements, net payout history, and bonuses/deductions."
      titleHelp={
        <HelpIcon
          title="Payroll Summary Report"
          content={{
            what: 'Payroll runs approved/processed/paid within the selected date range, scoped by when the run was created — not the pay period it covers.',
            why: 'A run created after month-end (a late close) shows up under the creation date\'s range, not the pay period\'s.',
          }}
        />
      }
      guide={
        <HowToUseGuide
          moduleKey="reports_payroll"
          title="Payroll Summary Report"
          content={{
            overview: 'Summarizes company-wide payroll cost, disbursements, and top earners for any date range.',
            sections: [
              {
                heading: 'What it shows',
                items: [
                  'Total Gross Outlay — company-side cost before deductions, across all runs in scope.',
                  'Net Disbursed — actual take-home paid to employees.',
                  'Deductions — TDS/PF/ESI and similar withholdings. Bonuses Paid — approved bonuses paid in the period.',
                  'Payroll Run Logs and Top Compensation Earners break the same totals down by run and by person.',
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
            <KpiCard title="Payroll Runs" value={data.summary.run_count} subtext="Completed Payrolls" icon={<ShieldCheck size={18} />} accent="info" />
            <KpiCard title="Total Gross Outlay" value={formatCurrency(data.summary.total_gross)} subtext="Company-side Cost" icon={<Coins size={18} />} accent="muted" />
            <KpiCard title="Net Disbursed" value={formatCurrency(data.summary.total_net)} subtext="Total Employee Take-home" icon={<CreditCard size={18} />} accent="success" />
            <KpiCard title="Deductions" value={formatCurrency(data.summary.total_deductions)} subtext="Taxes & Benefits" icon={<Users size={18} />} accent="danger" />
            <KpiCard title="Bonuses Paid" value={formatCurrency(data.summary.total_bonuses)} subtext="Performance Incentives" icon={<Gift size={18} />} accent="accent" />
          </div>

          {/* Tables Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem' }}>
            <div className="report-section">
              <p className="report-section-title">Payroll Run Logs</p>
              <ReportTable columns={runColumns} data={data.by_month} />
            </div>
            <div className="report-section">
              <p className="report-section-title">Top Compensation Earners</p>
              <ReportTable columns={earnerColumns} data={data.top_earners} />
            </div>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
