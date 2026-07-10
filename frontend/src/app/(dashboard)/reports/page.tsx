'use client';

import React from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import {
  TrendingUp,
  GitMerge,
  FileSpreadsheet,
  DollarSign,
  TrendingDown,
  Activity,
  CreditCard,
  Building2,
  Lock,
  ChevronRight,
} from 'lucide-react';

interface ReportCard {
  title: string;
  description: string;
  href: string;
  icon: any;
  textColor: string;
  bgColor: string;
  borderColor: string;
  permissionCheck: (user: any) => boolean;
}

export default function ReportsHub() {
  const { user } = useAuthStore();

  const check = (permissions: string[], roles: string[] = []) => {
    if (!user) return false;
    // Founder and Director bypass all checks
    if (user.roles.some((r: any) => {
      const name = typeof r === 'string' ? r : r?.name || '';
      return name === 'founder' || name === 'director';
    })) {
      return true;
    }
    // Check specific roles
    if (roles.length > 0 && user.roles.some((r: any) => {
      const name = typeof r === 'string' ? r : r?.name || '';
      return roles.includes(name);
    })) {
      return true;
    }
    // Check permissions
    return user.permissions.some((p: string) => permissions.includes(p));
  };

  const REPORT_CARDS: ReportCard[] = [
    {
      title: 'Revenue Summary',
      description: 'Monthly invoicing trend, collection rate, and outstanding client balance breakdowns.',
      href: '/reports/revenue',
      icon: TrendingUp,
      textColor: 'var(--success)',
      bgColor: 'var(--success-subtle)',
      borderColor: 'rgba(16, 185, 129, 0.2)',
      permissionCheck: (u) => check(['reports.view_financial']),
    },
    {
      title: 'Sales Pipeline',
      description: 'Conversion rates, average acquisition costs, budget estimations, and deal temperatures.',
      href: '/reports/pipeline',
      icon: GitMerge,
      textColor: 'var(--info)',
      bgColor: 'var(--info-subtle)',
      borderColor: 'rgba(59, 130, 246, 0.2)',
      permissionCheck: (u) => check(['reports.view_sales']),
    },
    {
      title: 'Quote Conversion',
      description: 'Quote funnel stats, win/loss conversion ratios, and top quoted services analysis.',
      href: '/reports/quotes',
      icon: FileSpreadsheet,
      textColor: 'var(--accent)',
      bgColor: 'var(--accent-subtle)',
      borderColor: 'rgba(124, 58, 237, 0.2)',
      permissionCheck: (u) => check(['reports.view_sales', 'reports.view_financial']),
    },
    {
      title: 'Project Profitability',
      description: 'Per-project revenue vs actual labor cost (timesheet aggregate) vs direct project expenses.',
      href: '/reports/profitability',
      icon: DollarSign,
      textColor: 'var(--warning)',
      bgColor: 'var(--warning-subtle)',
      borderColor: 'rgba(245, 158, 11, 0.2)',
      permissionCheck: (u) => check(['reports.view_financial'], ['project_manager']),
    },
    {
      title: 'Team Utilisation',
      description: 'Timesheets analysis comparing actual logged hours against target/billable expected hours.',
      href: '/reports/utilisation',
      icon: Activity,
      textColor: 'var(--success)',
      bgColor: 'var(--success-subtle)',
      borderColor: 'rgba(16, 185, 129, 0.2)',
      permissionCheck: (u) => check(['reports.view_hr'], ['project_manager']),
    },
    {
      title: 'Expense Breakdown',
      description: 'Operational overhead categorized by billing type, category, vendor, and project allocations.',
      href: '/reports/expenses',
      icon: CreditCard,
      textColor: 'var(--danger)',
      bgColor: 'var(--danger-subtle)',
      borderColor: 'rgba(239, 68, 68, 0.2)',
      permissionCheck: (u) => check(['reports.view_financial']),
    },
    {
      title: 'Payroll Summary',
      description: 'Gross-to-net payouts, bonus aggregates, deductions, and monthly payroll history.',
      href: '/reports/payroll',
      icon: TrendingDown,
      textColor: 'var(--accent)',
      bgColor: 'var(--accent-subtle)',
      borderColor: 'rgba(124, 58, 237, 0.2)',
      permissionCheck: (u) => check(['reports.view_hr', 'reports.view_financial']),
    },
    {
      title: 'Client 360 Summary',
      description: 'Aggregate invoiced amounts, lifetime values, active projects count, and payment history per client.',
      href: '/reports/clients',
      icon: Building2,
      textColor: 'var(--accent)',
      bgColor: 'var(--accent-subtle)',
      borderColor: 'rgba(124, 58, 237, 0.2)',
      permissionCheck: (u) => check(['reports.view_sales', 'reports.view_financial']),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics Hub</h1>
          <p className="text-secondary text-sm">
            Access role-restricted intelligence modules, trend metrics, and spreadsheet exports.
          </p>
        </div>
        <HowToUseGuide
          moduleKey="reports_hub"
          title="Reports & Analytics Hub"
          content={{
            overview: 'Every report below covers a date range you choose (default: current Indian Financial Year, Apr–Mar) and can be exported to CSV.',
            sections: [
              {
                heading: 'Access',
                items: [
                  'Each card is locked (🔒) if your role doesn\'t have the permission that report requires — this matches exactly what the server will allow, not just what\'s shown here.',
                  'Project Managers get special access to Project Profitability and Team Utilisation, scoped to their own projects/team only.',
                ],
              },
              {
                heading: 'Tips',
                items: [
                  'Each report has its own ⓘ next to the title explaining exactly what\'s being measured and how it\'s scoped to the date range.',
                  'Use the date range picker\'s presets (This Month / This Quarter / This FY / Last FY) or a custom range on any report.',
                ],
              },
            ],
          }}
        />
      </div>

      <div className="kpi-grid kpi-grid-3" style={{ paddingTop: '1rem' }}>
        {REPORT_CARDS.map((card, idx) => {
          const isAllowed = card.permissionCheck(user);

          if (!isAllowed) {
            return (
              <div
                key={idx}
                className="card"
                style={{
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{
                    padding: '0.625rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-muted)',
                    display: 'inline-flex'
                  }}>
                    <card.icon size={20} />
                  </div>
                  <Lock size={16} className="text-muted" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-muted" style={{ color: 'var(--text-muted)' }}>{card.title}</h3>
                  <p className="text-muted text-xs mt-1">{card.description}</p>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={idx}
              href={card.href}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                justifyContent: 'space-between',
                cursor: 'pointer',
                textDecoration: 'none',
                transition: 'all var(--transition-base)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = 'var(--shadow-glow)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{
                    padding: '0.625rem',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${card.borderColor}`,
                    backgroundColor: card.bgColor,
                    color: card.textColor,
                    display: 'inline-flex'
                  }}>
                    <card.icon size={20} />
                  </div>
                  <ChevronRight size={16} className="text-secondary" />
                </div>
                <h3 className="text-sm font-bold text-primary">{card.title}</h3>
                <p className="text-secondary text-xs mt-1">{card.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
