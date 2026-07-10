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
import { DollarSign, Wallet, AlertCircle, RefreshCw } from 'lucide-react';

export default function RevenueReport() {
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
    queryKey: ['reports', 'revenue', dates.from, dates.to],
    queryFn: async () => {
      const res = await reports.getRevenue({ from: dates.from, to: dates.to });
      return res.data;
    },
  });

  const handleExport = async () => {
    try {
      const res = await reports.exportCsv('revenue', { from: dates.from, to: dates.to });
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `revenue_summary_${dates.from}_to_${dates.to}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const columns = [
    { key: 'client_name', label: 'Client Name' },
    {
      key: 'total_billed',
      label: 'Total Billed',
      align: 'right' as const,
      render: (val: any) => (
        <span style={{ fontFamily: 'monospace' }}>{formatCurrency(Number(val))}</span>
      ),
    },
    {
      key: 'total_paid',
      label: 'Total Collected',
      align: 'right' as const,
      render: (val: any) => (
        <span style={{ fontFamily: 'monospace', color: 'var(--success)' }}>{formatCurrency(Number(val))}</span>
      ),
    },
    {
      key: 'outstanding',
      label: 'Outstanding Balance',
      align: 'right' as const,
      render: (val: any) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: Number(val) > 0 ? 600 : undefined,
            color: Number(val) > 0 ? 'var(--danger)' : 'var(--text-muted)',
          }}
        >
          {formatCurrency(Number(val))}
        </span>
      ),
    },
  ];

  return (
    <ReportShell
      title="Revenue Summary Report"
      description="Track billing, collections efficiency, and receivables trends."
      titleHelp={
        <HelpIcon
          title="Revenue Summary"
          content={{
            what: 'Invoiced and collected amounts for the selected date range, based on each invoice\'s issue date — normalized to INR using the exchange rate recorded on each invoice.',
            why: 'Shows how much has been billed vs. actually collected, so you can see collection efficiency and outstanding receivables at a glance.',
          }}
        />
      }
      guide={
        <HowToUseGuide
          moduleKey="reports_revenue"
          title="Revenue Summary Report"
          content={{
            overview: 'Tracks how much the company has billed clients and how much of that has actually been collected, for any date range.',
            sections: [
              {
                heading: 'What it shows',
                items: [
                  'Total Billed — sum of invoice totals issued in the period (draft and rejected invoices are excluded).',
                  'Total Collected — payments actually received against those invoices.',
                  'Outstanding — billed minus collected, i.e. what clients still owe.',
                  'Collection Efficiency — collected as a percentage of billed.',
                ],
              },
              {
                heading: 'Tips',
                items: [
                  'Use the date presets (This Month / This Quarter / This FY) or pick a custom range.',
                  'The trend chart and Top Clients table are scoped to the same date range as the KPI cards.',
                  'Export CSV downloads the monthly trend used in the chart above.',
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
          <div className="kpi-grid kpi-grid-4">
            <KpiCard
              title="Total Billed"
              value={formatCurrency(data.summary.total_invoiced)}
              subtext={`${data.summary.invoice_count} Invoices Issued`}
              icon={<DollarSign size={18} />}
            />
            <KpiCard
              title="Total Collected"
              value={formatCurrency(data.summary.total_collected)}
              subtext="Received Payments"
              icon={<Wallet size={18} />}
            />
            <KpiCard
              title="Outstanding receivables"
              value={formatCurrency(data.summary.total_outstanding)}
              subtext="Unpaid Balances"
              icon={<AlertCircle size={18} />}
            />
            <KpiCard
              title="Collection Efficiency"
              value={`${data.summary.collection_rate_pct}%`}
              subtext="Billed vs Collected Ratio"
              icon={<RefreshCw size={18} />}
            />
          </div>

          {/* Charts Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 className="kpi-label" style={{ fontSize: '0.8125rem' }}>Revenue Trend (INR)</h3>
            <LineChart
              data={data.trend}
              xKey="month_key"
              yKey="invoiced_amount"
              secondaryYKey="collected_amount"
              valueFormatter={(val) => formatCurrency(val)}
            />
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', justifyContent: 'flex-end', paddingRight: '1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--success)', display: 'inline-block' }} /> Invoiced
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--info)', display: 'inline-block' }} /> Collected
              </span>
            </div>
          </div>

          {/* Top Clients Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 className="kpi-label" style={{ fontSize: '0.8125rem' }}>Top 5 Clients by Revenue</h3>
            <ReportTable columns={columns} data={data.top_clients} />
          </div>
        </div>
      )}
    </ReportShell>
  );
}
