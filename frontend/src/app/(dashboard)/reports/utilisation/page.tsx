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
import { Users, Clock, Flame, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function TeamUtilisationReport() {
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
    queryKey: ['reports', 'utilisation', dates.from, dates.to],
    queryFn: async () => {
      const res = await reports.getUtilisation({ from: dates.from, to: dates.to });
      return res.data;
    },
  });

  const handleExport = async () => {
    try {
      const res = await reports.exportCsv('utilisation', { from: dates.from, to: dates.to });
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `team_utilisation_${dates.from}_to_${dates.to}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const memberColumns = [
    { key: 'user_name', label: 'Team Member' },
    {
      key: 'department',
      label: 'Department',
      render: (val: any) => (
        <span className="badge badge-muted">{val || 'General'}</span>
      ),
    },
    { key: 'expected_hours', label: 'Target Hours', align: 'center' as const, sortable: true },
    { key: 'logged_hours', label: 'Logged Hours', align: 'center' as const, sortable: true },
    { key: 'billable_hours', label: 'Billable Hours', align: 'center' as const, sortable: true },
    {
      key: 'utilisation_pct',
      label: 'Utilisation',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => {
        const pct = Number(val);
        let color = 'var(--text-muted)';
        if (pct >= 85) color = 'var(--success)';
        else if (pct >= 65) color = 'var(--info)';
        else if (pct > 0) color = 'var(--warning)';
        return <span style={{ fontFamily: 'monospace', fontWeight: 600, color }}>{pct}%</span>;
      },
    },
    {
      key: 'billable_rate_pct',
      label: 'Billable Rate',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => <span style={{ fontFamily: 'monospace', fontWeight: 500, color: 'var(--success)' }}>{val}%</span>,
    },
  ];

  const projectColumns = [
    { key: 'project_name', label: 'Project Name' },
    {
      key: 'total_hours',
      label: 'Total Hours Logged',
      align: 'center' as const,
      sortable: true,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{val} hrs</span>,
    },
    {
      key: 'billable_hours',
      label: 'Billable Hours',
      align: 'right' as const,
      sortable: true,
      render: (val: any) => <span style={{ fontFamily: 'monospace', color: 'var(--success)' }}>{val} hrs</span>,
    },
  ];

  return (
    <ReportShell
      title="Team Utilisation Report"
      description="Track resource utilization metrics, comparing hours logged against available work capacities."
      titleHelp={
        <HelpIcon
          title="Team Utilisation Report"
          content={{
            what: 'Logged timesheet hours vs. expected working hours (from each person\'s compensation setup, prorated for the date range) per active, non-portal team member.',
            why: 'Utilisation % shows how close someone is to their target hours; Billable Rate % shows what share of logged time was marked billable.',
          }}
        />
      }
      guide={
        <HowToUseGuide
          moduleKey="reports_utilisation"
          title="Team Utilisation Report"
          content={{
            overview: 'Compares actual logged hours to each person\'s expected working hours for the selected period.',
            sections: [
              {
                heading: 'What it shows',
                items: [
                  'Target Hours — expected monthly hours (from Salary Setup) prorated for the selected date range.',
                  'Logged / Billable Hours — approved or submitted timesheet entries in the period.',
                  'Utilisation % — Logged ÷ Target. Billable Rate % — Billable ÷ Logged.',
                  'A team member only appears if they have expected hours configured or have logged time in the period.',
                ],
              },
              {
                heading: 'Who sees what',
                items: [
                  'Project Managers only see people who logged time on projects they manage.',
                  'HR, Founder, and Director see the whole team.',
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
            <KpiCard title="Team Size" value={data.summary.team_size} subtext="Active Employees" icon={<Users size={18} />} accent="info" />
            <KpiCard title="Total Hours Logged" value={`${data.summary.total_logged_hours} h`} subtext="Approved / Submitted" icon={<Clock size={18} />} accent="muted" />
            <KpiCard title="Billable Hours" value={`${data.summary.total_billable_hours} h`} subtext="Invoiced tasks" icon={<CheckCircle2 size={18} />} accent="success" />
            <KpiCard title="Billable Rate" value={`${data.summary.billable_rate_pct}%`} subtext="Billable / Logged" icon={<Flame size={18} />} accent="warning" />
            <KpiCard title="Avg Utilisation" value={`${data.summary.avg_utilisation_pct}%`} subtext="Logged / Available" icon={<ShieldAlert size={18} />} accent="accent" />
          </div>

          {/* Tables Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem' }}>
            <div className="report-section">
              <p className="report-section-title">Resource Allocation Breakdown</p>
              <ReportTable columns={memberColumns} data={data.breakdown} />
            </div>
            <div className="report-section">
              <p className="report-section-title">Top Projects by Hours Logged</p>
              <ReportTable columns={projectColumns} data={data.top_projects_by_hours} />
            </div>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
