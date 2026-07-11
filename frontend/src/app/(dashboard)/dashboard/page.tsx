'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { reports, attendanceApi, DashboardBriefing, TeamAttendanceEntry } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Minus,
  Users, DollarSign, Briefcase,
  Clock, AlertTriangle,
  ShieldCheck, Award, Flame, CreditCard, Sparkles,
  BarChart2, Bot,
  FolderOpen, FileCheck, CheckSquare,
  UserPlus, Banknote, Activity, Layers,
  CheckCircle2, FolderKanban, Radio, UsersRound, AlertCircle, Sun, ListTodo,
} from 'lucide-react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const DASHBOARD_HOWTO = {
  overview: 'The dashboard is your daily starting point. Every number here is calculated live from your invoices, expenses, projects, tasks, and leads — nothing is edited on this page; you fix data in the module it came from. What you see depends on your role: finance figures appear only for people allowed to see company money, sales figures for the sales team, and everyone gets their own "My Day" summary.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Start each morning with "My Day" (your own tasks, hours, and clock-in status) and the "Attention Required" panel — it lists only the overdue items you can actually act on.',
        'Scan the KPI cards for this month\'s numbers. Cards you don\'t see are ones your role doesn\'t cover — that\'s intentional, not missing data.',
        'Use the quick-action buttons at the top right to jump straight to creating a record. Only actions your role can perform are shown.',
        'Click any row in Attention Required or Project Health to open the related record and act on it.',
      ],
    },
    {
      heading: 'Reading the numbers',
      items: [
        'Revenue is what was invoiced this month; "Collections" in the chart is what clients actually paid. They are different on purpose.',
        'Net Profit = Revenue − approved Expenses − Payroll cost for the month, matching the Margins table exactly.',
        'The Financial Cash Flow chart shows 6 real months of history — the small sparklines on the Revenue and Net Profit cards come from the same data.',
        'Sales Pipeline counts are the CURRENT open pipeline (all time), while "New Leads" and "Conversion Rate" cover this month only — each label\'s ⓘ says which.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Check the dashboard first thing daily and clear alerts before starting new work.',
        'If Outstanding keeps growing, follow up the invoices under the "Pay" tab in Attention Required.',
        'Watch the Risk column in Project Health — anything "critical" deserves a conversation with the project manager today.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Reading Revenue as cash in the bank — Revenue is what was invoiced; "Collections" in the chart is what actually came in.',
        'Ignoring the alert count — items stay overdue until someone fixes them in their own module (Invoices, Tasks, Projects, CRM).',
        'Trying to edit figures here — the dashboard is read-only; update the source record instead.',
      ],
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const truncate = (str: string, n: number) =>
  str && str.length > n ? str.slice(0, n - 1) + '…' : str;

interface KpiCard {
  label: string;
  value: string | number;
  trend: 'up' | 'down' | 'flat';
  badge: string;
  sub: string;
  icon: React.ElementType;
  color: string;
  help: string;
  sparkline?: number[];
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const currentMonthName = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const perms = user?.permissions || [];
  const canViewFinancial = perms.includes('reports.view_financial');
  const canViewTeamAttendance = perms.includes('attendance.view_all');

  const [activeChartTab, setActiveChartTab] = useState<'cashflow' | 'margins'>('cashflow');
  const [attentionTab, setAttentionTab] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: dashboardData = {}, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => {
      const res = await reports.getDashboardSummary();
      return res.data;
    },
    enabled: !!user,
  });

  // The executive briefing is a separate endpoint (it may call an external AI
  // model) and is only served to reports.view_financial holders — don't even
  // request it for anyone else.
  const briefingQuery = useQuery<DashboardBriefing>({
    queryKey: ['dashboard', 'briefing'],
    queryFn: async () => {
      const res = await reports.getDashboardBriefing();
      return res.data;
    },
    enabled: !!user && canViewFinancial,
    retry: 1,
  });

  // "Who's in today" — fed by the existing attendance/team endpoint, which the
  // backend gates on attendance.view_all; mirror that gate here exactly.
  const presenceQuery = useQuery<TeamAttendanceEntry[]>({
    queryKey: ['dashboard', 'presence'],
    queryFn: async () => {
      const res = await attendanceApi.team();
      return (res.data as unknown as TeamAttendanceEntry[]) || [];
    },
    enabled: !!user && canViewTeamAttendance,
  });

  // ── Derived values (all from sections the backend chose to include) ──────
  const trends: any[] = dashboardData.financial_trends || [];
  const currentMonthTrend = trends.length > 0 ? trends[trends.length - 1] : null;

  const revenueSummary = dashboardData.this_month_revenue?.summary;
  const thisMonthRevenue = revenueSummary?.total_invoiced || 0;
  const lastMonthRevenue = dashboardData.last_month_revenue?.summary?.total_invoiced || 0;
  const revDiff = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
  const expenses = dashboardData.this_month_expenses?.summary?.total_approved || 0;
  const payrollThisMonth = currentMonthTrend?.payroll || 0;
  // One definition of Net Profit everywhere on this page: revenue − approved
  // expenses − payroll cost (identical to the Margins table's formula).
  const netProfit = thisMonthRevenue - expenses - payrollThisMonth;
  const margin = thisMonthRevenue > 0 ? (netProfit / thisMonthRevenue) * 100 : 0;
  const outstanding = revenueSummary?.total_outstanding || 0;
  const invoiceCount = revenueSummary?.invoice_count || 0;
  const topClients: any[] = dashboardData.this_month_revenue?.top_clients || [];

  const projectsSummary = dashboardData.projects_summary;
  const utilisationSummary = dashboardData.this_month_utilisation?.summary;
  const pipelineSummary = dashboardData.this_month_pipeline?.summary;
  const salesPipeline = dashboardData.sales_pipeline;
  const mySummary = dashboardData.my_summary;

  const ar = dashboardData.attention_required || {};
  const arCounts = ar.counts || {};

  // Attention tabs — only the lists the backend actually returned (i.e. the
  // ones this user is entitled to act on).
  const attentionTabs: Array<{ key: string; label: string; count: number; rows: any[] }> = [];
  if (ar.overdue_invoices) attentionTabs.push({ key: 'invoices', label: 'Pay', count: arCounts.invoices || 0, rows: ar.overdue_invoices });
  if (ar.overdue_tasks) attentionTabs.push({ key: 'tasks', label: 'Tasks', count: arCounts.tasks || 0, rows: ar.overdue_tasks });
  if (ar.delayed_projects) attentionTabs.push({ key: 'projects', label: 'Projects', count: arCounts.projects || 0, rows: ar.delayed_projects });
  if (ar.stale_leads) attentionTabs.push({ key: 'leads', label: 'Leads', count: arCounts.leads || 0, rows: ar.stale_leads });
  const effectiveAttentionTab = attentionTabs.some(t => t.key === attentionTab)
    ? attentionTab
    : attentionTabs[0]?.key ?? null;
  const totalAlerts = attentionTabs.reduce((sum, t) => sum + t.count, 0);

  // Real per-month history for sparklines — no fabricated trend arrays.
  const revenueSpark = trends.map((t: any) => t.revenue);
  const profitSpark = trends.map((t: any) => t.profit);

  // ── KPI cards: composed from the sections this user's role receives ──────
  const kpis: KpiCard[] = [];
  if (revenueSummary) {
    kpis.push({
      label: 'Revenue', value: formatCurrency(thisMonthRevenue),
      trend: revDiff >= 0 ? 'up' : 'down', badge: `${revDiff >= 0 ? '+' : ''}${revDiff.toFixed(1)}%`, sub: 'vs last month',
      icon: DollarSign, color: '#7c3aed', sparkline: revenueSpark.length > 1 ? revenueSpark : undefined,
      help: 'Total amount invoiced to clients this month (billed, not necessarily collected yet). The badge compares it with last month; the small line is the real 6-month history.',
    });
    kpis.push({
      label: 'Net Profit', value: formatCurrency(netProfit),
      trend: netProfit >= 0 ? 'up' : 'down', badge: `${margin.toFixed(0)}% margin`, sub: 'rev − expenses − payroll',
      icon: Award, color: '#10b981', sparkline: profitSpark.length > 1 ? profitSpark : undefined,
      help: 'This month\'s revenue minus approved expenses minus payroll cost — the same formula as the Margins table. The badge shows profit as a percentage of revenue.',
    });
    kpis.push({
      label: 'Outstanding', value: formatCurrency(outstanding),
      trend: outstanding > 0 ? 'down' : 'up', badge: `${invoiceCount} billed`, sub: 'pending collection',
      icon: CreditCard, color: '#f59e0b',
      help: 'Money billed on invoices issued this month that clients haven\'t paid yet. The badge is the number of invoices issued this month. Chase overdue ones under Attention Required → Pay.',
    });
  }
  if (dashboardData.active_clients_count !== undefined) {
    kpis.push({
      label: 'Active Clients', value: dashboardData.active_clients_count,
      trend: 'flat', badge: 'contracts live', sub: 'in engagement',
      icon: Users, color: '#3b82f6',
      help: 'Clients with at least one project currently being delivered (status Active or In Progress).',
    });
  }
  if (projectsSummary) {
    kpis.push({
      label: 'Active Projects', value: projectsSummary.active_count,
      trend: projectsSummary.overdue_count > 0 ? 'down' : 'flat',
      badge: `${projectsSummary.overdue_count} overdue`, sub: `${projectsSummary.avg_completion_pct}% avg completion`,
      icon: Briefcase, color: '#ef4444',
      help: 'Projects currently in delivery (status Active or In Progress) that you are allowed to see. "Overdue" means the end date has passed while the project is still running.',
    });
  }
  if (utilisationSummary) {
    kpis.push({
      label: 'Team Utilisation', value: `${(utilisationSummary.avg_utilisation_pct || 0).toFixed(1)}%`,
      trend: (utilisationSummary.avg_utilisation_pct || 0) >= 75 ? 'up' : 'down',
      badge: (utilisationSummary.avg_utilisation_pct || 0) >= 75 ? 'Optimal' : 'Underutilized',
      sub: `${Math.round(utilisationSummary.total_logged_hours || 0)}h logged`,
      icon: Clock, color: '#ec4899',
      help: 'Average share of the team\'s expected working hours actually logged on timesheets this month. For project managers this covers only people who log time on your projects.',
    });
  }
  if (pipelineSummary) {
    kpis.push({
      label: 'New Leads', value: pipelineSummary.total_leads || 0,
      trend: (pipelineSummary.total_leads || 0) > 0 ? 'up' : 'flat', badge: 'this month', sub: 'pipeline added',
      icon: Sparkles, color: '#06b6d4',
      help: 'Potential clients added to the CRM pipeline this month.',
    });
    kpis.push({
      label: 'Conversion Rate', value: `${(pipelineSummary.conversion_rate_pct || 0).toFixed(1)}%`,
      trend: (pipelineSummary.conversion_rate_pct || 0) > 20 ? 'up' : 'flat', badge: 'lead → won', sub: 'this month',
      icon: Flame, color: '#f97316',
      help: 'Of the leads created this month, the percentage already converted into won deals.',
    });
  }
  if (kpis.length === 0 && mySummary) {
    // Plain-employee view: no company-wide figures — own numbers instead.
    kpis.push({
      label: 'My Open Tasks', value: mySummary.open_tasks_count,
      trend: 'flat', badge: `${mySummary.overdue_tasks_count} overdue`, sub: 'assigned to you',
      icon: ListTodo, color: '#7c3aed',
      help: 'Tasks assigned to you that aren\'t completed yet. The badge counts how many are past their due date.',
    });
    kpis.push({
      label: 'My Hours This Month', value: `${Math.round(mySummary.hours_this_month)}h`,
      trend: 'flat', badge: 'timesheets', sub: 'logged so far',
      icon: Clock, color: '#10b981',
      help: 'Hours you\'ve logged on timesheets this month (drafts included, rejected entries excluded).',
    });
    kpis.push({
      label: 'Today', value: mySummary.attendance_today?.clocked_in ? 'Clocked In' : (mySummary.attendance_today ? 'Clocked Out' : 'Not Clocked In'),
      trend: 'flat', badge: mySummary.attendance_today?.status || '—', sub: 'attendance',
      icon: Sun, color: '#f59e0b',
      help: 'Your attendance status for today. Clock in and out from the Attendance page.',
    });
  }

  // Quick actions — shown only when this user can actually perform them
  // (mirrors the backend Policies via the same permission strings).
  const quickActions = [
    { label: '+ Lead', route: '/crm', icon: UserPlus, show: perms.includes('leads.create') },
    { label: '+ Quote', route: '/quotes', icon: FileCheck, show: perms.includes('quotes.create') },
    { label: '+ Invoice', route: '/invoices', icon: CreditCard, show: perms.includes('invoices.create') },
    { label: '+ Project', route: '/projects', icon: FolderOpen, show: perms.includes('projects.create') },
    { label: '+ Task', route: '/tasks', icon: CheckSquare, show: perms.includes('tasks.create') },
    { label: '+ Expense', route: '/expenses', icon: Layers, show: true }, // any employee may log an expense
    { label: 'Run Payroll', route: '/payroll', icon: Banknote, show: perms.includes('payroll.manage') },
  ].filter(a => a.show);

  // ── Render Sparkline (real data only) ─────────────────────────────────────
  const Sparkline = ({ values, color }: { values: number[]; color: string }) => {
    const W = 72; const H = 28;
    const min = Math.min(...values); const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 6) - 3;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={W} height={H} className="overflow-visible flex-shrink-0">
        <polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={pts} opacity="0.85" />
      </svg>
    );
  };

  // ── Cash Flow SVG Chart ──────────────────────────────────────────────────
  const CashFlowChart = () => {
    if (trends.length < 2) {
      return (
        <div className="flex flex-col items-center justify-center h-[220px] gap-3">
          <BarChart2 size={36} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No financial data available yet</p>
        </div>
      );
    }
    const W = 760; const H = 210; const PX = 56; const PY = 14;
    const cW = W - PX * 2; const cH = H - PY * 2 - 24;
    const maxVal = Math.max(...trends.flatMap((t: any) => [t.revenue, t.collections, t.expenses]), 1);
    const xOf = (i: number) => PX + (i / (trends.length - 1)) * cW;
    const yOf = (v: number) => PY + cH - (v / maxVal) * cH;
    const linePath = (key: string) => trends.map((t: any, i: number) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(t[key]).toFixed(1)}`).join(' ');
    const areaPath = (key: string) => {
      const line = linePath(key);
      return `${line} L ${xOf(trends.length - 1).toFixed(1)} ${(PY + cH).toFixed(1)} L ${PX.toFixed(1)} ${(PY + cH).toFixed(1)} Z`;
    };
    const series = [
      { key: 'revenue', color: '#7c3aed', label: 'Revenue', gid: 'gRev' },
      { key: 'collections', color: '#10b981', label: 'Collections', gid: 'gCol' },
      { key: 'expenses', color: '#ef4444', label: 'Expenses', gid: 'gExp' },
    ];
    const gridRatios = [0, 0.25, 0.5, 0.75, 1];
    return (
      <div className="relative w-full select-none">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }}>
          <defs>
            {series.map(s => (
              <linearGradient key={s.gid} id={s.gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {gridRatios.map((r, i) => {
            const y = PY + cH * r;
            const val = maxVal * (1 - r);
            return (
              <g key={i}>
                <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 4" />
                <text x={PX - 8} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize="8.5" fontFamily="monospace">
                  {val >= 100000 ? `${(val / 100000).toFixed(0)}L` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
                </text>
              </g>
            );
          })}
          {series.map(s => <path key={s.key + 'a'} d={areaPath(s.key)} fill={`url(#${s.gid})`} />)}
          {series.map(s => <path key={s.key + 'l'} d={linePath(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
          {hoveredMonth !== null && (
            <>
              <line x1={xOf(hoveredMonth)} y1={PY} x2={xOf(hoveredMonth)} y2={PY + cH} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3" />
              {series.map(s => (
                <circle key={s.key} cx={xOf(hoveredMonth)} cy={yOf(trends[hoveredMonth][s.key])} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              ))}
            </>
          )}
          {trends.map((t: any, i: number) => (
            <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fill="var(--text-secondary)" fontSize="9">
              {t.month_name?.split(' ')[0] || ''}
            </text>
          ))}
          {trends.map((_: any, i: number) => (
            <rect key={i} x={xOf(i) - cW / (trends.length - 1) / 2} y={PY} width={cW / (trends.length - 1)} height={cH} fill="transparent"
              onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)} style={{ cursor: 'crosshair' }} />
          ))}
        </svg>
        {hoveredMonth !== null && (
          <div style={{
            position: 'absolute',
            top: 12,
            left: `${Math.min((hoveredMonth / (trends.length - 1)) * 100, 72)}%`,
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 11,
            minWidth: 160,
            pointerEvents: 'none',
            zIndex: 20,
            boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 6 }}>
              {trends[hoveredMonth].month_name}
            </div>
            {series.map(s => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: 'var(--text-secondary)', marginBottom: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                  {s.label}
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(trends[hoveredMonth][s.key])}</strong>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8 }}>
          {series.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
              <span style={{ width: 10, height: 3, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              {s.label}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.25rem 0' }}>
        <div style={{ height: 56, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} className="animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ height: 92, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} className="animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
          <div style={{ height: 320, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} className="animate-pulse" />
          <div style={{ height: 320, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} className="animate-pulse" />
        </div>
      </div>
    );
  }

  const briefing = briefingQuery.data;

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.375rem' }}>

      {/* ── Header + Quick Actions ─────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              {greeting}, {user?.name?.split(' ')[0] || 'there'}
              <HelpIcon title="Dashboard" content={{
                what: 'A live summary of your work and — depending on your role — the business: this month\'s money, projects, team activity, and anything overdue.',
                why: 'It saves you opening every module: the most important numbers and alerts are gathered in one place, calculated straight from the database.',
                when: 'Check it first thing each day, and after big events like sending invoices or closing a deal.',
              }} />
            </span>
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Command center · {currentMonthName}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <HowToUseGuide moduleKey="dashboard" title="How the Dashboard Works" content={DASHBOARD_HOWTO} />
          {quickActions.map(({ label, route, icon: Icon }) => (
            <button
              key={route}
              onClick={() => router.push(`${route}?new=true`)}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-md)', gap: '0.375rem' }}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Load Error Banner ──────────────────────────────────────────── */}
      {isError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)',
          borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8125rem',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} />
            Couldn't load dashboard data. The numbers below may be incomplete or stale.
          </span>
          <button
            onClick={() => refetch()}
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', flexShrink: 0 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Executive Briefing Strip (financial viewers only) ─────────── */}
      {canViewFinancial && (briefingQuery.isLoading || briefing) && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(79,70,229,0.04) 100%)',
          border: '1px solid rgba(124,58,237,0.18)',
          borderRadius: 'var(--radius-lg)',
          padding: '0.875rem 1.25rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-start',
          position: 'relative',
          overflow: 'hidden',
          flexWrap: 'wrap',
        }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {briefing?.source === 'ai'
              ? <Sparkles size={14} style={{ color: '#a78bfa' }} />
              : <Bot size={14} style={{ color: '#a78bfa' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.375rem', flexWrap: 'wrap' }}>
              {briefing?.source === 'ai' ? (
                <>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a78bfa' }}>AI Executive Briefing</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                  <HelpIcon text="Written by the connected AI model from this month's live metrics, refreshed every few minutes. Click a recommendation on the right to jump to that module." size={12} />
                </>
              ) : (
                <>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a78bfa' }}>Executive Summary</span>
                  <span style={{
                    fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: 999,
                    background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)',
                  }}>
                    auto-generated · AI briefing unavailable
                  </span>
                  <HelpIcon text="This summary is calculated automatically from this month's live metrics. No AI model is connected right now (the AI service is disabled or has no API key), so this text is template-based, not AI-written." size={12} />
                </>
              )}
            </div>
            {briefingQuery.isLoading ? (
              <div className="animate-pulse" style={{ height: 34, borderRadius: 6, background: 'var(--surface-elevated)', maxWidth: 640 }} />
            ) : (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{briefing?.briefing}</p>
            )}
          </div>
          {(briefing?.recommendations?.length || 0) > 0 && (
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem', borderLeft: '1px solid rgba(124,58,237,0.15)', paddingLeft: '1rem', minWidth: 220, maxWidth: 280 }}>
              {briefing!.recommendations.slice(0, 3).map((rec: string, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  onClick={() => {
                    if (rec.toLowerCase().includes('invoice')) router.push('/invoices');
                    else if (rec.toLowerCase().includes('project')) router.push('/projects');
                    else if (rec.toLowerCase().includes('task')) router.push('/tasks');
                    else if (rec.toLowerCase().includes('lead')) router.push('/crm');
                    else if (rec.toLowerCase().includes('approval')) router.push('/timesheets/approvals');
                  }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: i === 0 ? 'var(--danger)' : 'var(--warning)', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ lineHeight: 1.5 }}>{truncate(rec, 80)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {canViewFinancial && briefingQuery.isError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          <AlertCircle size={13} />
          The executive briefing couldn't be loaded right now.
          <button onClick={() => briefingQuery.refetch()} style={{ color: 'var(--accent)', fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* ── KPI Grid ───────────────────────────────────────────────────── */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {kpis.map((card) => {
            const isUp = card.trend === 'up';
            const isDown = card.trend === 'down';
            const trendColor = isUp ? 'var(--success)' : isDown ? 'var(--danger)' : 'var(--text-muted)';
            const trendBg = isUp ? 'var(--success-subtle)' : isDown ? 'var(--danger-subtle)' : 'var(--surface-elevated)';
            const TIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
            return (
              <div
                key={card.label}
                className="kpi-card"
                style={{
                  padding: '0.875rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  cursor: 'default',
                  borderLeft: `3px solid ${card.color}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {card.label}
                    <HelpIcon text={card.help} size={11} />
                  </span>
                  <div style={{ padding: '0.25rem', borderRadius: 6, background: `${card.color}18` }}>
                    <card.icon size={13} style={{ color: card.color }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                      {card.value}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.375rem' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: '0.625rem', fontWeight: 700, padding: '0.15rem 0.4rem',
                        borderRadius: 999, background: trendBg, color: trendColor
                      }}>
                        <TIcon size={9} />
                        {card.badge}
                      </span>
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>{card.sub}</span>
                    </div>
                  </div>
                  {card.sparkline && <Sparkline values={card.sparkline} color={card.color} />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── My Day (own tasks / hours / clock status — every user) ─────── */}
      {mySummary && (
        <div className="card" style={{ padding: '1.125rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Sun size={15} style={{ color: 'var(--warning)' }} />
              My Day
              <HelpIcon title="My Day" content={{
                what: 'Your own workload at a glance: open tasks, anything overdue, hours logged this month, and today\'s clock-in status.',
                why: 'Whatever your role, your own to-dos are the first thing to clear each morning.',
                when: 'Click a task to open the Tasks page, or the clock status to open Attendance.',
              }} />
            </h2>
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <button onClick={() => router.push('/tasks')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <ListTodo size={13} style={{ color: 'var(--accent)' }} />
                <strong style={{ color: 'var(--text-primary)' }}>{mySummary.open_tasks_count}</strong> open tasks
              </button>
              <button onClick={() => router.push('/timesheets')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={13} style={{ color: 'var(--accent)' }} />
                <strong style={{ color: 'var(--text-primary)' }}>{Math.round(mySummary.hours_this_month)}h</strong> this month
              </button>
              <button onClick={() => router.push('/attendance')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
                  background: mySummary.attendance_today?.clocked_in ? 'var(--success)' : 'var(--text-muted)',
                }} />
                {mySummary.attendance_today?.clocked_in
                  ? 'Clocked in'
                  : mySummary.attendance_today?.check_out_at
                    ? 'Clocked out'
                    : 'Not clocked in yet'}
              </button>
            </div>
          </div>
          {(mySummary.overdue_tasks || []).length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
              Nothing overdue — you're on top of your work.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {(mySummary.overdue_tasks || []).map((t: any) => (
                <AttentionRow
                  key={t.id}
                  title={`${t.task_number}: ${truncate(t.title, 44)}`}
                  sub={`Due ${formatDate(t.due_date)}`}
                  right="Overdue"
                  rightColor="var(--danger)"
                  onClick={() => router.push('/tasks')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Chart + Attention Center ───────────────────────────────────── */}
      <div className={trends.length > 0 ? 'grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start' : ''}>

        {/* Cash Flow / Margins Chart — financial viewers only */}
        {trends.length > 0 && (
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  Financial Cash Flow
                  <HelpIcon title="Financial Cash Flow" content={{
                    what: 'Six months of money movement in three lines: Revenue (what you invoiced), Collections (what clients actually paid), and Expenses (what you spent, approved only).',
                    why: 'The gap between Revenue and Collections shows how much billed money is still stuck with clients; Expenses vs Revenue shows whether the month was profitable.',
                    when: 'Hover any month for exact figures, or switch to the "Margins" tab for a month-by-month profit table that also includes payroll cost.',
                  }} />
                </h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>6-month operational trends</p>
              </div>
              <div style={{ display: 'flex', gap: 4, padding: '3px', background: 'var(--surface-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                {(['cashflow', 'margins'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveChartTab(tab)} style={{
                    padding: '0.25rem 0.75rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
                    background: activeChartTab === tab ? 'var(--accent)' : 'transparent',
                    color: activeChartTab === tab ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 150ms',
                  }}>
                    {tab === 'cashflow' ? 'Cash Flow' : 'Margins'}
                  </button>
                ))}
              </div>
            </div>

            {activeChartTab === 'cashflow' ? (
              <CashFlowChart />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Month', 'Revenue', 'Payroll', 'Expenses', 'Net Profit', 'Margin'].map(h => (
                        <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: h === 'Month' ? 'left' : 'right', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trends.map((t: any, i: number) => {
                      const np = t.revenue - t.expenses - t.payroll;
                      const mg = t.revenue > 0 ? (np / t.revenue * 100) : 0;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-[var(--surface-hover)] transition-colors">
                          <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.month_name}</td>
                          <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', color: 'var(--text-primary)' }}>{formatCurrency(t.revenue)}</td>
                          <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(t.payroll)}</td>
                          <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(t.expenses)}</td>
                          <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontWeight: 700, color: np >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(np)}</td>
                          <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontWeight: 600, color: mg >= 30 ? 'var(--success)' : mg >= 15 ? 'var(--warning)' : 'var(--danger)' }}>{mg.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Attention Required — tabs only for lists this user is entitled to */}
        {attentionTabs.length > 0 && (
          <div className="card" style={{ padding: '1.125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <div>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  Attention Required
                  <HelpIcon title="Attention Required" content={{
                    what: 'Your daily to-do radar: overdue invoice payments (Pay), overdue tasks, delayed projects, and leads that have gone quiet (stale). You only see the categories your role can act on.',
                    why: 'These items cost money or momentum the longer they sit — this panel surfaces them so nothing slips through.',
                    when: 'Check it every morning. Click any row to jump to the module where you can fix it.',
                  }} />
                </h2>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>Critical items need your review</p>
              </div>
              {totalAlerts > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: '0.6875rem', fontWeight: 700,
                  color: 'var(--danger)', background: 'var(--danger-subtle)',
                  border: '1px solid rgba(239,68,68,0.2)', borderRadius: 999,
                  padding: '0.2rem 0.6rem',
                }}>
                  <AlertTriangle size={10} />
                  {totalAlerts} alerts
                </span>
              )}
            </div>

            {attentionTabs.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${attentionTabs.length}, 1fr)`, gap: 3, padding: 3, background: 'var(--surface-elevated)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: '0.75rem' }}>
                {attentionTabs.map(({ key, label, count }) => (
                  <button key={key} onClick={() => setAttentionTab(key)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.25rem 0.375rem',
                    borderRadius: 6, background: effectiveAttentionTab === key ? 'var(--accent)' : 'transparent',
                    color: effectiveAttentionTab === key ? '#fff' : 'var(--text-secondary)',
                    fontSize: '0.625rem', fontWeight: 700, transition: 'all 150ms', cursor: 'pointer',
                  }}>
                    <span>{label}</span>
                    <span style={{ fontSize: '0.5625rem', opacity: 0.8 }}>({count})</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 120 }}>
              {effectiveAttentionTab === 'invoices' && (
                (ar.overdue_invoices || []).length === 0 ? (
                  <EmptyState icon={CheckCircle2} message="No overdue payments" />
                ) : (ar.overdue_invoices || []).map((inv: any) => (
                  <AttentionRow
                    key={inv.id}
                    title={`${inv.invoice_number} · ${truncate(inv.client || 'Unknown client', 20)}`}
                    sub={`Due ${formatDate(inv.due_date)}`}
                    right={formatCurrency(inv.due_amount)}
                    rightColor="var(--danger)"
                    onClick={() => router.push(`/invoices/${inv.id}`)}
                  />
                ))
              )}
              {effectiveAttentionTab === 'tasks' && (
                (ar.overdue_tasks || []).length === 0 ? (
                  <EmptyState icon={CheckCircle2} message="No overdue tasks" />
                ) : (ar.overdue_tasks || []).map((t: any) => (
                  <AttentionRow
                    key={t.id}
                    title={`${t.task_number}: ${truncate(t.title, 22)}`}
                    sub={t.assignee ? `Assigned to ${t.assignee}` : 'Unassigned'}
                    right="Overdue"
                    rightColor="var(--danger)"
                    onClick={() => router.push('/tasks')}
                  />
                ))
              )}
              {effectiveAttentionTab === 'projects' && (
                (ar.delayed_projects || []).length === 0 ? (
                  <EmptyState icon={CheckCircle2} message="No delayed projects" />
                ) : (ar.delayed_projects || []).map((p: any) => (
                  <AttentionRow
                    key={p.id}
                    title={`${truncate(p.name, 24)}`}
                    sub={`PM: ${p.manager}`}
                    right={`${p.completion_percentage}% done`}
                    rightColor="var(--warning)"
                    onClick={() => router.push(`/projects/${p.id}`)}
                  />
                ))
              )}
              {effectiveAttentionTab === 'leads' && (
                (ar.stale_leads || []).length === 0 ? (
                  <EmptyState icon={CheckCircle2} message="No stale leads" />
                ) : (ar.stale_leads || []).map((l: any) => (
                  <AttentionRow
                    key={l.id}
                    title={`${truncate(l.company_name, 22)}`}
                    sub={`Temp: ${l.temperature}`}
                    right="Stale"
                    rightColor="var(--warning)"
                    onClick={() => router.push('/crm')}
                  />
                ))
              )}
            </div>

            {((arCounts.approvals || 0) > 0 || (arCounts.payroll || 0) > 0) && (
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.75rem', paddingTop: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                {(arCounts.approvals || 0) > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileCheck size={12} style={{ color: 'var(--warning)' }} />
                    <strong style={{ color: 'var(--text-primary)' }}>{arCounts.approvals}</strong>
                    approvals waiting for you (quotes / expenses / timesheets)
                  </span>
                )}
                {(arCounts.payroll || 0) > 0 && (
                  <button onClick={() => router.push('/payroll')} style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>
                    <Banknote size={12} style={{ color: 'var(--warning)' }} />
                    <strong style={{ color: 'var(--text-primary)' }}>{arCounts.payroll}</strong>
                    payroll run{(arCounts.payroll || 0) > 1 ? 's' : ''} awaiting sign-off
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Project Health + Sales Funnel ──────────────────────────────── */}
      {(dashboardData.project_health || salesPipeline) && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

          {/* Project Health */}
          {dashboardData.project_health && (
            <div className="card" style={{ padding: '1.125rem' }}>
              <div style={{ marginBottom: '0.875rem' }}>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  Project Health
                  <HelpIcon title="Project Health" content={{
                    what: 'A check-up on every running project you can see (statuses Active and In Progress): progress %, budget spent, hours logged vs budgeted, and an overall Risk level. Riskiest projects sort to the top.',
                    why: 'It flags projects burning budget or time faster than they are progressing — before they become losses.',
                    when: 'Scan the Risk column: green (low) is fine, amber (medium) means watch it, red (critical) means talk to the project manager today. Click a row to open the project.',
                  }} />
                </h2>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>Budget, timeline & risk — riskiest first</p>
              </div>
              {(dashboardData.project_health || []).length === 0 ? (
                <EmptyState icon={FolderKanban} message="No running projects to display" />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Project', 'Manager', 'Progress', 'Budget Used', 'Hours', 'Risk'].map(h => (
                          <th key={h} style={{ padding: '0.375rem 0.625rem', textAlign: 'left', fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboardData.project_health || []).map((p: any) => {
                        const riskColor = p.risk_level === 'critical' ? 'var(--danger)' : p.risk_level === 'medium' ? 'var(--warning)' : 'var(--success)';
                        const riskBg = p.risk_level === 'critical' ? 'var(--danger-subtle)' : p.risk_level === 'medium' ? 'var(--warning-subtle)' : 'var(--success-subtle)';
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                            onClick={() => router.push(`/projects/${p.id}`)}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <td style={{ padding: '0.5rem 0.625rem' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8125rem' }}>{truncate(p.name, 20)}</div>
                              <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: 1 }}>{p.project_number}</div>
                            </td>
                            <td style={{ padding: '0.5rem 0.625rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{p.manager}</td>
                            <td style={{ padding: '0.5rem 0.625rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 56, height: 5, background: 'var(--surface-elevated)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                  <div style={{ width: `${Math.min(p.completion_percentage, 100)}%`, height: '100%', background: riskColor, borderRadius: 3, transition: 'width 300ms' }} />
                                </div>
                                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{p.completion_percentage}%</span>
                              </div>
                            </td>
                            <td style={{ padding: '0.5rem 0.625rem' }}>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{formatCurrency(p.cost)}</div>
                              <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: 1 }}>{p.budget_utilisation_pct}% of budget</div>
                            </td>
                            <td style={{ padding: '0.5rem 0.625rem' }}>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{Math.round(p.hours_logged)}h</div>
                              <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: 1 }}>{p.time_utilisation_pct}% used</div>
                            </td>
                            <td style={{ padding: '0.5rem 0.625rem' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.175rem 0.5rem', borderRadius: 999, background: riskBg, color: riskColor }}>
                                {p.risk_level}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Sales Pipeline Funnel — sales viewers only */}
          {salesPipeline && (
            <div className="card" style={{ padding: '1.125rem' }}>
              <div style={{ marginBottom: '0.875rem' }}>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  Sales Pipeline
                  <HelpIcon title="Sales Pipeline" content={{
                    what: 'A funnel of your CURRENT open leads by temperature: Fresh (new), Warm and Hot (interest building), Quoted (quote sent), and Won (deal closed). These are running totals, not this month only.',
                    why: 'It shows where deals stall — the small % next to each stage is how many leads made it from the stage above.',
                    when: 'Pipeline value is the total worth of all open leads. "Follow-ups pending" counts scheduled follow-ups nobody has completed yet — clear those first in the CRM.',
                  }} />
                </h2>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Pipeline value: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(salesPipeline.pipeline_value || 0)}</strong>
                </p>
              </div>
              {(() => {
                const sp = salesPipeline;
                const stages = [
                  { label: 'Fresh', count: sp.fresh_leads || 0, color: '#3b82f6' },
                  { label: 'Warm', count: sp.warm_leads || 0, color: '#f59e0b' },
                  { label: 'Hot', count: sp.hot_leads || 0, color: '#ef4444' },
                  { label: 'Quoted', count: sp.quotes_sent || 0, color: '#7c3aed' },
                  { label: 'Won', count: sp.won || 0, color: '#10b981' },
                ];
                const max = Math.max(...stages.map(s => s.count), 1);
                const total = stages[0].count || 1;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {stages.map((s, i) => {
                      const barPct = (s.count / max) * 100;
                      const convPct = i === 0 ? 100 : stages[i - 1].count > 0 ? Math.round((s.count / stages[i - 1].count) * 100) : 0;
                      return (
                        <div key={s.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{s.label}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {i > 0 && <span style={{ fontSize: '0.5625rem', color: 'var(--text-muted)' }}>{convPct}%↓</span>}
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', minWidth: 20, textAlign: 'right' }}>{s.count}</span>
                            </div>
                          </div>
                          <div style={{ height: 10, background: 'var(--surface-elevated)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <div style={{
                              width: `${barPct}%`, height: '100%',
                              background: `linear-gradient(90deg, ${s.color}, ${s.color}88)`,
                              borderRadius: 3, transition: 'width 400ms ease',
                            }} />
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.625rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.6875rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Overall conversion</span>
                        <strong style={{ color: 'var(--success)' }}>{total > 0 ? ((stages[stages.length - 1].count / total) * 100).toFixed(1) : 0}%</strong>
                      </div>
                      <button onClick={() => router.push('/crm')} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Follow-ups pending
                          <HelpIcon text="Scheduled follow-ups on leads that nobody has marked complete yet. Handle them from each lead's Follow-ups tab in the CRM." size={10} />
                        </span>
                        <strong style={{ color: (salesPipeline.pending_followups || 0) > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
                          {salesPipeline.pending_followups || 0}
                        </strong>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Team Performance + Who's In + Top Clients + Activity ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Team Performance — HR viewers / PMs (scoped server-side) */}
          {dashboardData.team_performance && (
            <div className="card" style={{ padding: '1.125rem' }}>
              <div style={{ marginBottom: '0.875rem' }}>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  Team Performance
                  <HelpIcon title="Team Performance" content={{
                    what: 'Each employee\'s month at a glance: Utilization (hours logged vs expected), total hours, tasks completed, and a productivity Score out of 100. Project managers see only people who log time on their projects.',
                    why: 'It shows who is overloaded and who has spare capacity, which helps when assigning new work.',
                    when: 'Green scores (75+) are on track; amber and red suggest checking in with that person. Hours come from their timesheets.',
                  }} />
                </h2>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>Utilization & productivity this month</p>
              </div>
              {(dashboardData.team_performance || []).length === 0 ? (
                <EmptyState icon={UsersRound} message="No team data available" />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Employee', 'Utilization', 'Hours', 'Tasks Done', 'Score'].map(h => (
                          <th key={h} style={{ padding: '0.375rem 0.625rem', textAlign: 'left', fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboardData.team_performance || []).slice(0, 6).map((m: any) => {
                        const sc = m.productivity_score;
                        const scColor = sc >= 75 ? 'var(--success)' : sc >= 50 ? 'var(--warning)' : 'var(--danger)';
                        const utilPct = Math.min(m.utilisation_pct, 100);
                        const utilColor = utilPct >= 80 ? 'var(--success)' : utilPct >= 60 ? 'var(--warning)' : 'var(--danger)';
                        return (
                          <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <td style={{ padding: '0.5rem 0.625rem', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8125rem' }}>{m.name}</td>
                            <td style={{ padding: '0.5rem 0.625rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 60, height: 5, background: 'var(--surface-elevated)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                  <div style={{ width: `${utilPct}%`, height: '100%', background: utilColor, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{m.utilisation_pct.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td style={{ padding: '0.5rem 0.625rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                              {m.logged_hours.toFixed(0)}h<span style={{ color: 'var(--text-muted)' }}>/{m.expected_hours}h</span>
                            </td>
                            <td style={{ padding: '0.5rem 0.625rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{m.completed_tasks}</td>
                            <td style={{ padding: '0.5rem 0.625rem' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', fontSize: '0.6875rem', fontWeight: 700,
                                padding: '0.15rem 0.5rem', borderRadius: 999,
                                background: sc >= 75 ? 'var(--success-subtle)' : sc >= 50 ? 'var(--warning-subtle)' : 'var(--danger-subtle)',
                                color: scColor,
                              }}>
                                {sc}/100
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Top Clients — financial viewers only */}
          {topClients.length > 0 && (
            <div className="card" style={{ padding: '1.125rem' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  Top Clients
                  <HelpIcon title="Top Clients" content={{
                    what: 'Your five biggest clients by amount billed on invoices issued this month, with what they\'ve paid and what\'s still outstanding.',
                    why: 'These accounts drive the month\'s revenue — outstanding balances here matter most.',
                    when: 'For all-time client value, open Reports → Client 360 Summary.',
                  }} />
                </h2>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>By billing this month</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {topClients.slice(0, 5).map((c: any, i: number) => (
                  <div key={c.client_id ?? i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.375rem 0.25rem', borderBottom: i < Math.min(topClients.length, 5) - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--text-muted)', width: 16 }}>#{i + 1}</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.client_name}</span>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(c.total_billed)}</div>
                      <div style={{ fontSize: '0.625rem', color: (c.outstanding || 0) > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {(c.outstanding || 0) > 0 ? `${formatCurrency(c.outstanding)} outstanding` : 'fully paid'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Who's In Today — attendance.view_all holders only */}
          {canViewTeamAttendance && (
            <div className="card" style={{ padding: '1.125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  Who's In Today
                  <HelpIcon title="Who's In Today" content={{
                    what: 'Live presence from today\'s attendance records: who has clocked in, who is on leave, and who hasn\'t clocked in yet.',
                    why: 'A quick headcount before assigning urgent work or scheduling a same-day meeting.',
                    when: 'Times shown are each person\'s clock-in time. Manage records in the Attendance module\'s Team Registry.',
                  }} />
                </h2>
                <UsersRound size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
              {presenceQuery.isLoading ? (
                <div className="animate-pulse" style={{ height: 80, borderRadius: 8, background: 'var(--surface-elevated)' }} />
              ) : presenceQuery.isError ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={13} /> Couldn't load today's attendance.
                  <button onClick={() => presenceQuery.refetch()} style={{ color: 'var(--accent)', fontWeight: 600 }}>Retry</button>
                </p>
              ) : (
                (() => {
                  const team = presenceQuery.data || [];
                  const present = team.filter(m => m.attendance && ['present', 'partial'].includes(m.attendance.status));
                  const onLeave = team.filter(m => m.attendance?.status === 'leave');
                  const notIn = team.filter(m => !m.attendance || !['present', 'partial', 'leave'].includes(m.attendance.status));
                  const Chip = ({ color, label, count }: { color: string; label: string; count: number }) => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
                      {count} {label}
                    </span>
                  );
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
                        <Chip color="var(--success)" label="in" count={present.length} />
                        <Chip color="var(--warning)" label="on leave" count={onLeave.length} />
                        <Chip color="var(--text-muted)" label="not in yet" count={notIn.length} />
                      </div>
                      {present.length === 0 ? (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Nobody has clocked in yet today.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                          {present.slice(0, 6).map(m => (
                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)', fontWeight: 600, minWidth: 0 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.attendance?.check_out_at ? 'var(--text-muted)' : 'var(--success)', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                              </span>
                              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{m.attendance?.check_in_at || ''}</span>
                            </div>
                          ))}
                          {present.length > 6 && (
                            <button onClick={() => router.push('/attendance')} style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontWeight: 600, textAlign: 'left' }}>
                              +{present.length - 6} more — open Team Registry
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* Activity Feed — own alerts, every user */}
          <div className="card" style={{ padding: '1.125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <div>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>Activity Feed</h2>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>Your recent notifications</p>
              </div>
              <Activity size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(dashboardData.alerts_list || []).length === 0 ? (
                <EmptyState icon={Radio} message="No recent activity" />
              ) : (
                (dashboardData.alerts_list || []).slice(0, 6).map((a: any) => {
                  const dotColor = a.type === 'danger' ? 'var(--danger)' : a.type === 'warning' ? 'var(--warning)' : a.type === 'success' ? 'var(--success)' : 'var(--info)';
                  return (
                    <div key={a.id} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{a.title}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{truncate(a.body, 60)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer Status Bar ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.625rem',
        padding: '0.625rem 1rem',
        background: 'rgba(16,185,129,0.06)',
        border: '1px solid rgba(16,185,129,0.15)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.8125rem',
        color: '#10b981',
      }}>
        <ShieldCheck size={14} />
        <span><strong>Dashboard Operational.</strong> All metrics are calculated live from database transactions and scoped to what your role can see.</span>
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AttentionRow({ title, sub, right, rightColor, onClick }: {
  title: string; sub: string; right: string; rightColor: string; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.5rem 0.625rem',
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8, cursor: 'pointer',
        transition: 'border-color 150ms, background 150ms',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
        (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLElement).style.background = 'var(--surface-elevated)';
      }}
    >
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: rightColor, flexShrink: 0, marginLeft: 8 }}>{right}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem', gap: '0.5rem' }}>
      <Icon size={24} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>{message}</span>
    </div>
  );
}
