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
import { Building2, Wallet, DollarSign, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function Client360Report() {
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
    queryKey: ['reports', 'clients', dates.from, dates.to],
    queryFn: async () => {
      const res = await reports.getClients({ from: dates.from, to: dates.to });
      return res.data;
    },
  });

  const handleExport = async () => {
    try {
      const res = await reports.exportCsv('clients', { from: dates.from, to: dates.to });
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `client_summary_${dates.from}_to_${dates.to}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return <span className="text-slate-600">-</span>;
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const columns = [
    {
      key: 'client_name',
      label: 'Client / Company Name',
      render: (val: any, row: any) => (
        <div>
          <div className="font-bold text-slate-200">{val}</div>
          <div className="text-[10px] text-slate-550 mt-0.5">{row.client_email}</div>
        </div>
      ),
    },
    {
      key: 'active_projects',
      label: 'Projects (Active/Total)',
      align: 'center' as const,
      render: (_: any, row: any) => (
        <span className="font-mono text-slate-300">
          {row.active_projects} <span className="text-slate-600 text-[10px]">/</span> {row.total_projects}
        </span>
      ),
    },
    {
      key: 'total_billed',
      label: 'Total Billed',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => <span className="font-mono text-slate-300">{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'total_paid',
      label: 'Total Collected',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => <span className="font-mono text-emerald-450">{formatCurrency(Number(val))}</span>,
    },
    {
      key: 'total_outstanding',
      label: 'Outstanding',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => {
        const amt = Number(val);
        return (
          <span className={`font-mono font-semibold ${amt > 0 ? 'text-rose-450' : 'text-slate-500'}`}>
            {formatCurrency(amt)}
          </span>
        );
      },
    },
    {
      key: 'last_invoice_date',
      label: 'Last Invoice Date',
      align: 'center' as const,
      render: (val: any) => <span className="text-slate-400">{formatDate(val)}</span>,
    },
    {
      key: 'last_payment_date',
      label: 'Last Payment Date',
      align: 'center' as const,
      render: (val: any) => <span className="text-slate-400">{formatDate(val)}</span>,
    },
  ];

  return (
    <ReportShell
      title="Client 360 Summary Report"
      description="Analyze accounts values, aggregate client invoices, active projects count, and payout histories."
      titleHelp={
        <HelpIcon
          title="Client 360 Summary"
          content={{
            what: 'Per-client billing figures (Total Billed/Collected/Outstanding) are scoped to invoices issued within the selected date range; Active/Total Projects counts are all-time, not date-scoped.',
            why: 'Health Score starts at 100 and is reduced for overdue invoices, on-hold or cancelled projects, and outstanding balance relative to billed — a quick way to spot at-risk accounts.',
          }}
        />
      }
      guide={
        <HowToUseGuide
          moduleKey="reports_clients"
          title="Client 360 Summary Report"
          content={{
            overview: 'A per-client rollup of billing, collections, and project activity, for any date range.',
            sections: [
              {
                heading: 'What it shows',
                items: [
                  'Total Billed / Collected / Outstanding — scoped to invoices issued in the selected period.',
                  'Projects (Active/Total) — all-time counts, independent of the date range.',
                  'Last Invoice / Payment Date — most recent activity within the selected period.',
                ],
              },
              {
                heading: 'Tips',
                items: [
                  'A client with no invoices in the selected period still appears, with billing figures at zero — widen the date range if you expect to see recent activity.',
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
              title="Total Clients"
              value={data.summary.total_clients}
              subtext="Registered Clients"
              icon={<Building2 className="w-5 h-5 text-sky-400" />}
            />
            <KpiCard
              title="Active Accounts"
              value={data.summary.total_active}
              subtext="With Active Projects"
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            />
            <KpiCard
              title="Total Billed"
              value={formatCurrency(data.summary.total_billed)}
              subtext="Billed in Selected Period"
              icon={<DollarSign className="w-5 h-5 text-indigo-400" />}
            />
            <KpiCard
              title="Total Collected"
              value={formatCurrency(data.summary.total_collected)}
              subtext="Cleared Payouts"
              icon={<Wallet className="w-5 h-5 text-emerald-450" />}
            />
            <KpiCard
              title="Outstanding"
              value={formatCurrency(data.summary.total_outstanding)}
              subtext="Awaiting Collections"
              icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
            />
          </div>

          {/* Client Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 className="kpi-label" style={{ fontSize: '0.8125rem' }}>Client Accounts Performance Breakdown</h3>
            <ReportTable columns={columns} data={data.breakdown} />
          </div>
        </div>
      )}
    </ReportShell>
  );
}
