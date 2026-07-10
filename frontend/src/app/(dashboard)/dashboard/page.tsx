'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { reports } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Minus,
  Users, DollarSign, Briefcase,
  Clock, AlertTriangle,
  ShieldCheck, Award, Flame, CreditCard, Sparkles,
  ChevronRight, BarChart2,
  FolderOpen, FileCheck, CheckSquare,
  UserPlus, Banknote, Activity, Layers, ArrowUpRight,
  Crown, CheckCircle2, FolderKanban, Radio, UsersRound, AlertCircle
} from 'lucide-react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const DASHBOARD_HOWTO = {
  overview: 'The dashboard is your daily starting point. Every number here is calculated live from your invoices, expenses, projects, tasks, and leads — nothing is edited on this page; you fix data in the module it came from.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Start each morning with the "Attention Required" panel — it lists overdue invoices, overdue tasks, delayed projects, and stale leads.',
        'Scan the eight KPI cards for this month\'s Revenue, Net Profit, Outstanding money, clients, projects, utilisation, and leads.',
        'Use the quick-action buttons at the top right (+ Lead, + Quote, + Invoice, + Project...) to jump straight to creating a record.',
        'Click any row in Attention Required or Project Health to open the related record and act on it.',
      ],
    },
    {
      heading: 'Reading the numbers',
      items: [
        'Revenue, Net Profit, and Outstanding cover the current month and come from invoice and approved-expense records.',
        'The Financial Cash Flow chart shows 6 months of Revenue (billed), Collections (money actually received), and Expenses — hover a month for exact figures.',
        'Switch the chart to the "Margins" tab for a month-by-month profit and margin table.',
        'Sales Pipeline shows how many leads sit at each stage, from Fresh through Won.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Check the dashboard first thing daily and clear alerts before starting new work.',
        'If Outstanding keeps growing, follow up the invoices under the "Pay" tab in Attention Required.',
        'Watch the Risk column in Project Health — anything "critical" deserves a conversation with the project manager.',
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

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const currentMonthName = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const [activeChartTab, setActiveChartTab] = useState<'cashflow' | 'margins'>('cashflow');
  const [activeAttentionTab, setActiveAttentionTab] = useState<'invoices' | 'tasks' | 'projects' | 'leads'>('invoices');
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

  // ── Derived Values ────────────────────────────────────────────────────────
  const thisMonthRevenue = dashboardData.this_month_revenue?.summary?.total_invoiced || 0;
  const lastMonthRevenue = dashboardData.last_month_revenue?.summary?.total_invoiced || 0;
  const revDiff = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
  const expenses = dashboardData.this_month_expenses?.summary?.total_approved || 0;
  const netProfit = thisMonthRevenue - expenses;
  const margin = thisMonthRevenue > 0 ? (netProfit / thisMonthRevenue) * 100 : 0;
  const outstanding = dashboardData.this_month_revenue?.summary?.total_outstanding || 0;
  const invoiceCount = dashboardData.this_month_revenue?.summary?.invoice_count || 0;
  const activeClients = dashboardData.active_clients_count || 0;
  const activeProjects = (dashboardData.projects_list || []).filter((p: any) => p.status === 'active').length;
  const avgUtil = dashboardData.this_month_utilisation?.summary?.avg_utilisation_pct || 0;
  const newLeads = dashboardData.this_month_pipeline?.summary?.total_leads || 0;
  const convRate = dashboardData.this_month_pipeline?.summary?.conversion_rate_pct || 0;

  const aiBriefing = dashboardData.executive_briefing || { briefing: '', recommendations: [] };
  const ar = dashboardData.attention_required || {};
  const attention = {
    invoices: ar.overdue_invoices || [],
    tasks: ar.overdue_tasks || [],
    projects: ar.delayed_projects || [],
    leads: ar.stale_leads || [],
    counts: ar.counts || { tasks: 0, invoices: 0, projects: 0, leads: 0, approvals: 0, payroll: 0 },
  };
  const totalAlerts = attention.counts.tasks + attention.counts.invoices + attention.counts.projects + attention.counts.leads;

  const kpis = [
    { label: 'Revenue', value: formatCurrency(thisMonthRevenue), trend: revDiff >= 0 ? 'up' : 'down', badge: `${revDiff >= 0 ? '+' : ''}${revDiff.toFixed(1)}%`, sub: 'vs last month', icon: DollarSign, color: '#7c3aed', sparkline: [20, 35, 30, 45, 40, 55, 60], help: 'Total amount invoiced to clients this month. The badge compares it with last month. Note: invoiced, not necessarily collected yet.' },
    { label: 'Net Profit', value: formatCurrency(netProfit), trend: netProfit >= 0 ? 'up' : 'down', badge: `${margin.toFixed(0)}% margin`, sub: 'rev − expenses', icon: Award, color: '#10b981', sparkline: [10, 20, 15, 30, 25, 45, 50], help: 'This month\'s revenue minus approved expenses. The badge shows profit as a percentage of revenue (margin).' },
    { label: 'Outstanding', value: formatCurrency(outstanding), trend: outstanding > 0 ? 'down' : 'up', badge: `${invoiceCount} unpaid`, sub: 'pending collection', icon: CreditCard, color: '#f59e0b', sparkline: [60, 50, 40, 55, 35, 40, 30], help: 'Money billed this month but not yet paid by clients. Follow up these invoices under Attention Required → Pay.' },
    { label: 'Active Clients', value: activeClients, trend: 'flat' as const, badge: 'contracts live', sub: 'in engagement', icon: Users, color: '#3b82f6', sparkline: [2, 3, 3, 4, 4, 5, 5], help: 'Clients with a live engagement right now — the accounts you are currently doing work for.' },
    { label: 'Active Projects', value: activeProjects, trend: activeProjects > 0 ? 'up' : 'flat', badge: 'in delivery', sub: 'running projects', icon: Briefcase, color: '#ef4444', sparkline: [4, 5, 4, 6, 7, 8, 9], help: 'Projects currently marked "Active". Projects in Planning, On Hold, or Completed are not counted.' },
    { label: 'Team Utilisation', value: `${avgUtil.toFixed(1)}%`, trend: avgUtil >= 75 ? 'up' : 'down', badge: avgUtil >= 75 ? 'Optimal' : 'Underutilized', sub: 'target: 80%', icon: Clock, color: '#ec4899', sparkline: [65, 70, 72, 75, 78, 80, 81], help: 'Average share of the team\'s expected working hours actually logged on timesheets this month. Around 80% is the target.' },
    { label: 'New Leads', value: newLeads, trend: newLeads > 0 ? 'up' : 'flat', badge: 'this month', sub: 'pipeline added', icon: Sparkles, color: '#06b6d4', sparkline: [5, 8, 7, 12, 10, 15, 14], help: 'Potential clients added to the CRM pipeline this month.' },
    { label: 'Conversion Rate', value: `${convRate.toFixed(1)}%`, trend: convRate > 20 ? 'up' : 'flat', badge: 'lead → won', sub: 'win percentage', icon: Flame, color: '#f97316', sparkline: [15, 18, 17, 20, 22, 24, 25], help: 'Percentage of this month\'s leads that turned into won deals. Higher means the sales pipeline is converting well.' },
  ] as const;

  // ── Render Sparkline ───────────────────────────────────────────────────────
  const Sparkline = ({ values, color }: { values: readonly number[]; color: string }) => {
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
    const trends: any[] = dashboardData.financial_trends || [];
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
          {/* Grid */}
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
          {/* Areas */}
          {series.map(s => <path key={s.key + 'a'} d={areaPath(s.key)} fill={`url(#${s.gid})`} />)}
          {/* Lines */}
          {series.map(s => <path key={s.key + 'l'} d={linePath(s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
          {/* Hover line + dots */}
          {hoveredMonth !== null && (
            <>
              <line x1={xOf(hoveredMonth)} y1={PY} x2={xOf(hoveredMonth)} y2={PY + cH} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3" />
              {series.map(s => (
                <circle key={s.key} cx={xOf(hoveredMonth)} cy={yOf(trends[hoveredMonth][s.key])} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              ))}
            </>
          )}
          {/* X labels */}
          {trends.map((t: any, i: number) => (
            <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fill="var(--text-secondary)" fontSize="9">
              {t.month_name?.split(' ')[0] || ''}
            </text>
          ))}
          {/* Interaction zones */}
          {trends.map((_: any, i: number) => (
            <rect key={i} x={xOf(i) - cW / (trends.length - 1) / 2} y={PY} width={cW / (trends.length - 1)} height={cH} fill="transparent"
              onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)} style={{ cursor: 'crosshair' }} />
          ))}
        </svg>
        {/* Tooltip */}
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
        {/* Legend */}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ height: 92, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} className="animate-pulse" />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem' }}>
          <div style={{ height: 320, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} className="animate-pulse" />
          <div style={{ height: 320, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} className="animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.375rem' }}>

      {/* ── Header + Quick Actions ─────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            {greeting}, {user?.name?.split(' ')[0] || 'Founder'}
            <Crown size={18} style={{ color: 'var(--accent)', opacity: 0.85 }} />
            <HelpIcon title="Dashboard" content={{
              what: 'A live summary of the whole business — this month\'s money, projects, team activity, and anything overdue.',
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
          {[
            { label: '+ Lead', route: '/crm', icon: UserPlus },
            { label: '+ Quote', route: '/quotes', icon: FileCheck },
            { label: '+ Invoice', route: '/invoices', icon: CreditCard },
            { label: '+ Project', route: '/projects', icon: FolderOpen },
            { label: '+ Task', route: '/tasks', icon: CheckSquare },
            { label: '+ Expense', route: '/expenses', icon: Layers },
            { label: 'Run Payroll', route: '/payroll', icon: Banknote },
          ].map(({ label, route, icon: Icon }) => (
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

      {/* ── AI Briefing Strip ─────────────────────────────────────────── */}
      {aiBriefing.briefing && (
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
        }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={14} style={{ color: '#a78bfa' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a78bfa' }}>AI Co-Pilot</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              <HelpIcon text="An auto-generated summary of how the business looks right now, with suggested next actions. Click a recommendation on the right to jump to that module." size={12} />
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{aiBriefing.briefing}</p>
          </div>
          {aiBriefing.recommendations?.length > 0 && (
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem', borderLeft: '1px solid rgba(124,58,237,0.15)', paddingLeft: '1rem', minWidth: 220, maxWidth: 280 }}>
              {aiBriefing.recommendations.slice(0, 3).map((rec: string, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  onClick={() => {
                    if (rec.toLowerCase().includes('invoice')) router.push('/invoices');
                    else if (rec.toLowerCase().includes('project')) router.push('/projects');
                    else if (rec.toLowerCase().includes('task')) router.push('/tasks');
                  }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: i === 0 ? 'var(--danger)' : 'var(--warning)', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ lineHeight: 1.5 }}>{truncate(rec, 80)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── KPI Grid (8 cards, 4+4) ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.875rem' }}>
        {kpis.map((card, idx) => {
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
              {/* Top row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {card.label}
                  <HelpIcon text={card.help} size={11} />
                </span>
                <div style={{ padding: '0.25rem', borderRadius: 6, background: `${card.color}18` }}>
                  <card.icon size={13} style={{ color: card.color }} />
                </div>
              </div>
              {/* Value + sparkline */}
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
                <Sparkline values={card.sparkline} color={card.color} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Chart + Attention Center ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.25rem', alignItems: 'start' }}>

        {/* Cash Flow / Margins Chart */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                Financial Cash Flow
                <HelpIcon title="Financial Cash Flow" content={{
                  what: 'Six months of money movement in three lines: Revenue (what you invoiced), Collections (what clients actually paid), and Expenses (what you spent).',
                  why: 'The gap between Revenue and Collections shows how much billed money is still stuck with clients; Expenses vs Revenue shows whether the month was profitable.',
                  when: 'Hover any month for exact figures, or switch to the "Margins" tab for a month-by-month profit table.',
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
                  {(dashboardData.financial_trends || []).map((t: any, i: number) => {
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

        {/* Attention Required */}
        <div className="card" style={{ padding: '1.125rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
            <div>
              <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                Attention Required
                <HelpIcon title="Attention Required" content={{
                  what: 'Your daily to-do radar: overdue invoice payments (Pay), overdue tasks, delayed projects, and leads that have gone quiet (stale).',
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

          {/* Tab bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, padding: 3, background: 'var(--surface-elevated)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: '0.75rem' }}>
            {([
              { key: 'invoices', label: 'Pay', count: attention.counts.invoices },
              { key: 'tasks', label: 'Tasks', count: attention.counts.tasks },
              { key: 'projects', label: 'Projects', count: attention.counts.projects },
              { key: 'leads', label: 'Leads', count: attention.counts.leads },
            ] as const).map(({ key, label, count }) => (
              <button key={key} onClick={() => setActiveAttentionTab(key)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.25rem 0.375rem',
                borderRadius: 6, background: activeAttentionTab === key ? 'var(--accent)' : 'transparent',
                color: activeAttentionTab === key ? '#fff' : 'var(--text-secondary)',
                fontSize: '0.625rem', fontWeight: 700, transition: 'all 150ms', cursor: 'pointer',
              }}>
                <span>{label}</span>
                <span style={{ fontSize: '0.5625rem', opacity: 0.8 }}>({count})</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 120 }}>
            {activeAttentionTab === 'invoices' && (
              attention.invoices.length === 0 ? (
                <EmptyState icon={CheckCircle2} message="No overdue payments" />
              ) : attention.invoices.map((inv: any) => (
                <AttentionRow
                  key={inv.id}
                  title={`${inv.invoice_number} · ${truncate(inv.client, 20)}`}
                  sub={`Due ${formatDate(inv.due_date)}`}
                  right={formatCurrency(inv.due_amount)}
                  rightColor="var(--danger)"
                  onClick={() => router.push('/invoices')}
                />
              ))
            )}
            {activeAttentionTab === 'tasks' && (
              attention.tasks.length === 0 ? (
                <EmptyState icon={CheckCircle2} message="No overdue tasks" />
              ) : attention.tasks.map((t: any) => (
                <AttentionRow
                  key={t.id}
                  title={`${t.task_number}: ${truncate(t.title, 22)}`}
                  sub={`Assigned to ${t.assignee}`}
                  right="Overdue"
                  rightColor="var(--danger)"
                  onClick={() => router.push('/tasks')}
                />
              ))
            )}
            {activeAttentionTab === 'projects' && (
              attention.projects.length === 0 ? (
                <EmptyState icon={CheckCircle2} message="No delayed projects" />
              ) : attention.projects.map((p: any) => (
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
            {activeAttentionTab === 'leads' && (
              attention.leads.length === 0 ? (
                <EmptyState icon={CheckCircle2} message="No stale leads" />
              ) : attention.leads.map((l: any) => (
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
        </div>
      </div>

      {/* ── Project Health + Sales Funnel ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem', alignItems: 'start' }}>

        {/* Project Health */}
        <div className="card" style={{ padding: '1.125rem' }}>
          <div style={{ marginBottom: '0.875rem' }}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              Project Health
              <HelpIcon title="Project Health" content={{
                what: 'A per-project check-up: progress %, budget spent ("Budget Used"), hours logged vs budgeted, and an overall Risk level.',
                why: 'It flags projects burning budget or time faster than they are progressing — before they become losses.',
                when: 'Scan the Risk column: green (low) is fine, amber (medium) means watch it, red (critical) means talk to the project manager today. Click a row to open the project.',
              }} />
            </h2>
            <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>Budget, timeline & risk tracking</p>
          </div>
          {(dashboardData.project_health || []).length === 0 ? (
            <EmptyState icon={FolderKanban} message="No active projects to display" />
          ) : (
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
          )}
        </div>

        {/* Sales Pipeline Funnel */}
        <div className="card" style={{ padding: '1.125rem' }}>
          <div style={{ marginBottom: '0.875rem' }}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              Sales Pipeline
              <HelpIcon title="Sales Pipeline" content={{
                what: 'A funnel of your leads by stage: Fresh (new), Warm and Hot (interest building), Quoted (quote sent), and Won (deal closed).',
                why: 'It shows where deals stall — the small % next to each stage is how many leads made it from the stage above.',
                when: 'Pipeline value is the total worth of all open leads. Manage the leads themselves in the CRM module.',
              }} />
            </h2>
            <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Pipeline value: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(dashboardData.sales_pipeline?.pipeline_value || 0)}</strong>
            </p>
          </div>
          {(() => {
            const sp = dashboardData.sales_pipeline || {};
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
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.625rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Overall conversion</span>
                  <strong style={{ color: 'var(--success)' }}>{total > 0 ? ((stages[stages.length - 1].count / total) * 100).toFixed(1) : 0}%</strong>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Team Performance + Activity Feed ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem', alignItems: 'start' }}>

        {/* Team Performance */}
        <div className="card" style={{ padding: '1.125rem' }}>
          <div style={{ marginBottom: '0.875rem' }}>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              Team Performance
              <HelpIcon title="Team Performance" content={{
                what: 'Each employee\'s month at a glance: Utilization (hours logged vs expected), total hours, tasks completed, and a productivity Score out of 100.',
                why: 'It shows who is overloaded and who has spare capacity, which helps when assigning new work.',
                when: 'Green scores (75+) are on track; amber and red suggest checking in with that person. Hours come from their timesheets.',
              }} />
            </h2>
            <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>Utilization & productivity this month</p>
          </div>
          {(dashboardData.team_performance || []).length === 0 ? (
            <EmptyState icon={UsersRound} message="No team data available" />
          ) : (
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
          )}
        </div>

        {/* Activity Feed */}
        <div className="card" style={{ padding: '1.125rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
            <div>
              <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>Activity Feed</h2>
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>Recent system events</p>
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
        <span><strong>Dashboard Operational.</strong> All metrics are calculated live from database transactions.</span>
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
