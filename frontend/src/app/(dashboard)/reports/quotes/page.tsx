'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reports } from '@/lib/api';
import ReportShell from '@/components/reports/ReportShell';
import KpiCard from '@/components/reports/KpiCard';
import FunnelChart from '@/components/reports/FunnelChart';
import ReportTable from '@/components/reports/ReportTable';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { useToast } from '@/hooks/useToast';
import { formatCurrency } from '@/lib/utils';
import { FileSpreadsheet, Percent, Coins, Award, Layers } from 'lucide-react';

export default function QuoteConversionReport() {
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
    queryKey: ['reports', 'quotes', dates.from, dates.to],
    queryFn: async () => {
      const res = await reports.getQuotes({ from: dates.from, to: dates.to });
      return res.data;
    },
  });

  const handleExport = async () => {
    try {
      const res = await reports.exportCsv('quotes', { from: dates.from, to: dates.to });
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `quote_conversion_${dates.from}_to_${dates.to}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const columns = [
    { key: 'service_name', label: 'Service / Item Description' },
    { key: 'quote_count', label: 'Quote Mentions', align: 'center' as const, sortable: true },
    {
      key: 'total_value',
      label: 'Total Quoted Value',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--success)', fontWeight: 600 }}>{formatCurrency(Number(val))}</span>,
    },
  ];

  return (
    <ReportShell
      title="Quote Conversion Report"
      description="Analyze quotation win rates, conversion funnel progression, and top-value service offerings."
      titleHelp={
        <HelpIcon
          title="Quote Conversion Report"
          content={{
            what: 'How quotes created in the selected period move through Draft → Pending Approval → Approved → Sent → Won/Rejected.',
            why: 'Win Rate is Won vs. (Won + Rejected) — it ignores quotes still in progress, so it reflects actual close performance, not just pipeline volume.',
          }}
        />
      }
      guide={
        <HowToUseGuide
          moduleKey="reports_quotes"
          title="Quote Conversion Report"
          content={{
            overview: 'Tracks how many quotes created in a period get won vs. rejected, and which services quote most often.',
            sections: [
              {
                heading: 'What it shows',
                items: [
                  'Conversion Funnel — count of quotes at each stage as of now, for quotes created in the period.',
                  'Win Rate — Won divided by (Won + Rejected); quotes still Draft/Pending/Sent don\'t count either way yet.',
                  'Top Quoted Services — line items appearing most often across quotes in the period, by total value.',
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
            <KpiCard title="Total Quotes" value={data.summary.total_quotes} subtext="Draft to Won Quotes" icon={<FileSpreadsheet size={18} />} accent="muted" />
            <KpiCard title="Win Rate" value={`${data.summary.win_rate_pct}%`} subtext="Won vs Rejected ratio" icon={<Percent size={18} />} accent="success" />
            <KpiCard title="Won Quotes" value={data.summary.won_count} subtext={`${data.summary.sent_count} Sent to Clients`} icon={<Award size={18} />} accent="warning" />
            <KpiCard title="Avg Quote Value" value={formatCurrency(data.summary.avg_quote_value)} subtext="Average Proposal Value" icon={<Coins size={18} />} accent="info" />
            <KpiCard title="Total Quote Value" value={formatCurrency(data.summary.total_quote_value)} subtext="Active Pipeline (Approved+)" icon={<Layers size={18} />} accent="accent" />
          </div>

          {/* Charts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem' }}>
            {/* Funnel — no extra wrapper since FunnelChart already uses report-section */}
            <FunnelChart data={data.funnel} />

            {/* Top Services */}
            <div className="report-section">
              <p className="report-section-title">Top Quoted Services</p>
              <ReportTable columns={columns} data={data.top_services} />
            </div>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
