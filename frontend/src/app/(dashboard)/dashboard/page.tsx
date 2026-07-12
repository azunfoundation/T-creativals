'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { reports, attendanceApi, DashboardBriefing, TeamAttendanceEntry } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import {
  TrendingUp,
  Users,
  DollarSign,
  Briefcase,
  Clock,
  Award,
  CreditCard,
  UserPlus,
  Banknote,
  Layers,
  FileCheck,
  CheckSquare,
  ListTodo,
  Sun,
  ShieldCheck,
  AlertCircle,
  FolderOpen
} from 'lucide-react';

// Imports of new V2 components
import HeroSection from '@/components/dashboard/HeroSection';
import AICommandCenter from '@/components/dashboard/AICommandCenter';
import KPICards from '@/components/dashboard/KPICards';
import TodaysFocus from '@/components/dashboard/TodaysFocus';
import AttentionRequired from '@/components/dashboard/AttentionRequired';
import FinancialOverview from '@/components/dashboard/FinancialOverview';
import ProjectHealth from '@/components/dashboard/ProjectHealth';
import SalesPipeline from '@/components/dashboard/SalesPipeline';
import TeamPerformance from '@/components/dashboard/TeamPerformance';
import TopClients from '@/components/dashboard/TopClients';
import WhosInToday from '@/components/dashboard/WhosInToday';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';

import { toArr, KpiCard } from '@/components/dashboard/shared';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const now = new Date();
  const currentMonthName = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const perms = user?.permissions || [];
  const canViewFinancial = perms.includes('reports.view_financial');
  const canViewTeamAttendance = perms.includes('attendance.view_all');

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: dashboardData = {}, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => {
      const d = (await reports.getDashboardSummary()).data;
      if (d.financial_trends)                   d.financial_trends = toArr(d.financial_trends);
      if (d.this_month_revenue?.top_clients)     d.this_month_revenue.top_clients = toArr(d.this_month_revenue.top_clients);
      if (d.this_month_expenses?.categories)     d.this_month_expenses.categories = toArr(d.this_month_expenses.categories);
      if (d.team_performance)                    d.team_performance = toArr(d.team_performance);
      if (d.project_health)                      d.project_health = toArr(d.project_health);
      if (d.alerts_list)                         d.alerts_list = toArr(d.alerts_list);
      return d;
    },
    enabled: !!user,
  });

  const briefingQuery = useQuery<DashboardBriefing>({
    queryKey: ['dashboard', 'briefing'],
    queryFn: async () => {
      const res = await reports.getDashboardBriefing();
      return res.data;
    },
    enabled: !!user && canViewFinancial,
  });

  const presenceQuery = useQuery({
    queryKey: ['dashboard', 'presence'],
    queryFn: async () => {
      const res = await attendanceApi.team();
      return (res.data as unknown as TeamAttendanceEntry[]) || [];
    },
    enabled: !!user && canViewTeamAttendance,
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const trends: any[] = dashboardData.financial_trends || [];
  const currentMonthTrend = trends.length > 0 ? trends[trends.length - 1] : null;

  const revenueSummary = dashboardData.this_month_revenue?.summary;
  const thisMonthRevenue = revenueSummary?.total_invoiced || 0;
  const lastMonthRevenue = dashboardData.last_month_revenue?.summary?.total_invoiced || 0;
  const revDiff = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
  const expenses = dashboardData.this_month_expenses?.summary?.total_approved || 0;
  const payrollThisMonth = currentMonthTrend?.payroll || 0;
  
  const netProfit = thisMonthRevenue - expenses - payrollThisMonth;
  const margin = thisMonthRevenue > 0 ? (netProfit / thisMonthRevenue) * 100 : 0;
  const outstanding = revenueSummary?.total_outstanding || 0;
  const invoiceCount = revenueSummary?.invoice_count || 0;
  const topClients = dashboardData.this_month_revenue?.top_clients || [];

  const projectsSummary = dashboardData.projects_summary;
  const utilisationSummary = dashboardData.this_month_utilisation?.summary;
  const pipelineSummary = dashboardData.this_month_pipeline?.summary;
  const salesPipeline = dashboardData.sales_pipeline;
  const mySummary = dashboardData.my_summary;
  const arCounts = dashboardData.attention_required?.counts || {};

  const revenueSpark = trends.map((t: any) => t.revenue);
  const profitSpark = trends.map((t: any) => t.profit);

  // ── KPI cards configuration ──────────────────────────────────────────────
  const kpis: KpiCard[] = [];
  if (revenueSummary) {
    kpis.push({
      label: 'Revenue', value: formatCurrency(thisMonthRevenue),
      trend: revDiff >= 0 ? 'up' : 'down', badge: `${revDiff >= 0 ? '+' : ''}${revDiff.toFixed(1)}%`, sub: 'vs last month',
      icon: DollarSign, color: '#7c3aed', sparklineData: revenueSpark.length > 1 ? revenueSpark : undefined,
      help: 'Total amount invoiced to clients this month (billed, not necessarily collected yet). The badge compares it with last month; the small line is the real 6-month history.',
    });
    kpis.push({
      label: 'Net Profit', value: formatCurrency(netProfit),
      trend: netProfit >= 0 ? 'up' : 'down', badge: `${margin.toFixed(0)}% margin`, sub: 'rev − expenses − payroll',
      icon: Award, color: '#10b981', sparklineData: profitSpark.length > 1 ? profitSpark : undefined,
      help: 'This month\'s revenue minus approved expenses minus payroll cost — the same formula as the Margins table. The badge shows profit as a percentage of revenue.',
    });
    kpis.push({
      label: 'Outstanding', value: formatCurrency(outstanding),
      trend: outstanding > 0 ? 'down' : 'up', badge: `${invoiceCount} billed`, sub: 'pending collection',
      icon: CreditCard, color: '#f59e0b',
      help: 'Money billed on invoices issued this month that clients haven\'t paid yet. The badge is the number of invoices issued this month. Chase overdue ones under Attention Required.',
    });
  }
  if (dashboardData.active_clients_count !== undefined) {
    kpis.push({
      label: 'Active Clients', value: dashboardData.active_clients_count,
      trend: 'flat', badge: 'contracts live', sub: 'in engagement',
      icon: Users, color: '#3b82f6',
      help: 'Total number of clients with active contracts/workorders in the agency.',
    });
  }
  if (pipelineSummary) {
    kpis.push({
      label: 'Pipeline Value', value: formatCurrency(pipelineSummary.pipeline_value || 0),
      trend: 'flat', badge: `${pipelineSummary.pending_leads || 0} open leads`, sub: 'sales opportunities',
      icon: TrendingUp, color: '#3b82f6',
      help: 'The estimated financial value of all open deals/opportunities in the CRM pipeline.',
    });
  }
  if (projectsSummary) {
    kpis.push({
      label: 'Active Projects', value: projectsSummary.active_count || 0,
      trend: (projectsSummary.overdue_count || 0) > 0 ? 'down' : 'up',
      badge: `${projectsSummary.overdue_count || 0} overdue`, sub: 'in progress',
      icon: Briefcase, color: '#7c3aed',
      help: 'Projects currently in progress. The badge shows how many have passed their end date.',
    });
  }
  if (utilisationSummary) {
    kpis.push({
      label: 'Team Utilisation', value: `${utilisationSummary.avg_utilisation_pct?.toFixed(0)}%`,
      trend: utilisationSummary.avg_utilisation_pct >= 75 ? 'up' : 'down',
      badge: `${Math.round(utilisationSummary.total_logged_hours)}h logged`, sub: 'vs capacity',
      icon: Clock, color: '#10b981',
      help: 'Average billable/logged hours divided by expected hours across all active staff this month.',
    });
  }

  // Fallback for standard employees with no financial/CRM visibility
  if (kpis.length === 0 && mySummary) {
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

  // Quick actions
  const quickActions = [
    { label: '+ Lead', route: '/crm', icon: UserPlus, show: perms.includes('leads.create') },
    { label: '+ Quote', route: '/quotes', icon: FileCheck, show: perms.includes('quotes.create') },
    { label: '+ Invoice', route: '/invoices', icon: CreditCard, show: perms.includes('invoices.create') },
    { label: '+ Project', route: '/projects', icon: FolderOpen, show: perms.includes('projects.create') },
    { label: '+ Task', route: '/tasks', icon: CheckSquare, show: perms.includes('tasks.create') },
    { label: '+ Expense', route: '/expenses', icon: Layers, show: true },
    { label: 'Run Payroll', route: '/payroll', icon: Banknote, show: perms.includes('payroll.manage') },
  ].filter(a => a.show);

  return (
    <div className="dash-container">
      {/* 1. Hero Section */}
      <HeroSection
        userName={user?.name || ''}
        quickActions={quickActions}
        currentMonthName={currentMonthName}
      />

      {/* Load Error Banner */}
      {isError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)',
          borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8125rem'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <AlertCircle size={15} />
            We couldn't load the dashboard summary.
          </span>
          <button onClick={() => refetch()} className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}>Retry</button>
        </div>
      )}

      {/* 2. AI Command Center */}
      <AICommandCenter
        briefing={briefingQuery.data}
        isLoading={briefingQuery.isLoading}
        isError={briefingQuery.isError}
        onRetry={() => briefingQuery.refetch()}
        dashboardData={dashboardData}
        canViewFinancial={canViewFinancial}
      />

      {/* 3. KPI Cards */}
      {kpis.length > 0 && <KPICards cards={kpis} />}

      {/* 4. Today's Focus */}
      {mySummary && (
        <TodaysFocus
          mySummary={mySummary}
          attentionCounts={arCounts}
          salesPipeline={salesPipeline}
        />
      )}

      {/* 5. & 6. Attention Required + Financial Overview (2-Column Grid) */}
      <div className="dash-grid-2">
        <AttentionRequired attentionData={dashboardData.attention_required || {}} />
        <FinancialOverview trends={trends} canViewFinancial={canViewFinancial} />
      </div>

      {/* 7, 8 & 9. Project Health + Sales Pipeline + Team Performance (3-Column Grid) */}
      <div className="dash-grid-3">
        <ProjectHealth
          projects={dashboardData.project_health || []}
          projectsSummary={projectsSummary}
        />
        
        <SalesPipeline
          salesPipeline={salesPipeline}
          canViewSales={perms.includes('reports.view_sales')}
        />
        
        <TeamPerformance teamPerformance={dashboardData.team_performance || []} />
      </div>

      {/* 10, 11 & 12. Top Clients + Who's In Today + Activity Feed (3-Column Grid) */}
      <div className="dash-grid-3">
        <TopClients
          topClients={topClients}
          projects={dashboardData.project_health || []}
          canViewFinancial={canViewFinancial}
        />

        <WhosInToday
          presenceData={presenceQuery.data}
          isLoading={presenceQuery.isLoading}
          isError={presenceQuery.isError}
          onRetry={() => presenceQuery.refetch()}
          canViewTeamAttendance={canViewTeamAttendance}
        />

        <ActivityFeed alertsList={dashboardData.alerts_list || []} />
      </div>

      {/* 13. Footer Status Bar */}
      <div className="dash-footer" style={{
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
