import React from 'react';
import { Sparkles, Bot, AlertCircle, ArrowUpRight } from 'lucide-react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { truncate } from './shared';
import { formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface AICommandCenterProps {
  briefing: {
    briefing?: string;
    recommendations?: string[];
    source?: 'ai' | 'system';
  } | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  dashboardData: any;
  canViewFinancial: boolean;
  isProjectScoped?: boolean;
}

export default function AICommandCenter({
  briefing,
  isLoading,
  isError,
  onRetry,
  dashboardData,
  canViewFinancial,
  isProjectScoped = false
}: AICommandCenterProps) {
  const router = useRouter();

  if (!canViewFinancial) {
    return null; // AI Command Center is an executive briefing gated behind financial permission
  }

  // 1. Calculate Business Health Score
  const trends = dashboardData.financial_trends || [];
  const currentMonthTrend = trends.length > 0 ? trends[trends.length - 1] : null;
  const revenueSummary = dashboardData.this_month_revenue?.summary;
  const thisMonthRevenue = revenueSummary?.total_invoiced || 0;
  const lastMonthRevenue = dashboardData.last_month_revenue?.summary?.total_invoiced || 0;
  const revDiff = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
  const projects = dashboardData.project_health || [];
  const criticalRisksCount = projects.filter((p: any) => p.risk_level === 'critical').length;
  const mediumRisksCount = projects.filter((p: any) => p.risk_level === 'medium').length;
  const arCounts = dashboardData.attention_required?.counts || {};
  const approvalsCount = arCounts.approvals || 0;

  // Let's compute a dynamic score out of 100
  let score = 90;
  if (revDiff > 0) score += Math.min(5, revDiff / 5);
  else score += Math.max(-15, revDiff / 2);

  score -= criticalRisksCount * 6;
  score -= mediumRisksCount * 2;
  score -= Math.min(10, approvalsCount * 1.5);
  
  // Bound score between 50 and 100
  const healthScore = Math.max(50, Math.min(100, Math.round(score)));
  
  let healthLabel = 'Excellent';
  let healthColor = 'var(--success)';
  if (healthScore < 70) {
    healthLabel = 'Needs attention';
    healthColor = 'var(--danger)';
  } else if (healthScore < 85) {
    healthLabel = 'Good';
    healthColor = 'var(--warning)';
  }

  // 2. Collections
  const collectionsVal = currentMonthTrend?.collections || 0;

  // 3. Growth
  const growthText = `${revDiff >= 0 ? '+' : ''}${revDiff.toFixed(0)}%`;

  return (
    <div className="dash-ai-strip">
      <div className="dash-ai-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: 'rgba(124, 58, 237, 0.15)', border: '1px solid rgba(124, 58, 237, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {briefing?.source === 'ai' ? (
              <Sparkles size={13} style={{ color: 'var(--accent)' }} />
            ) : (
              <Bot size={13} style={{ color: 'var(--accent)' }} />
            )}
          </div>
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              AI Command Center {isProjectScoped && <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--text-muted)' }}>(Project Workspace)</span>}
              <HelpIcon title="AI Command Center" content={{
                what: 'An executive view summarizing business health, revenue trends, collections, operational risks, and approvals.',
                why: 'Provides the agency director a quick health check of the business along with recommendations.',
                when: 'Automatically generated on page load using connected AI or static calculations.'
              }} />
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Your AI business assistant</p>
          </div>
        </div>

        {/* Dynamic Metric Grid */}
        <div className="dash-ai-metric-grid" style={{ marginTop: '0.5rem' }}>
          <div className="dash-ai-metric-box">
            <span className="dash-ai-metric-label">Business Health</span>
            <span className="dash-ai-metric-value" style={{ color: healthColor }}>
              {healthScore}<span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/100</span>
            </span>
            <span style={{ fontSize: '0.625rem', fontWeight: 600, color: healthColor }}>{healthLabel}</span>
          </div>

          <div className="dash-ai-metric-box">
            <span className="dash-ai-metric-label">Revenue Growth</span>
            <span className="dash-ai-metric-value" style={{ color: revDiff >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {growthText}
            </span>
            <span style={{ fontSize: '0.625rem', color: 'var(--text-secondary)' }}>vs last month</span>
          </div>

          <div className="dash-ai-metric-box">
            <span className="dash-ai-metric-label">Collections</span>
            <span className="dash-ai-metric-value" style={{ fontSize: '0.875rem', padding: '0.125rem 0' }}>
              {formatCurrency(collectionsVal)}
            </span>
            <span style={{ fontSize: '0.625rem', color: 'var(--text-secondary)' }}>{isProjectScoped ? 'collections (Org-wide)' : 'vs last month'}</span>
          </div>

          <div className="dash-ai-metric-box">
            <span className="dash-ai-metric-label">Risks</span>
            <span className="dash-ai-metric-value" style={{ color: criticalRisksCount > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
              {criticalRisksCount + mediumRisksCount}
            </span>
            <span style={{ fontSize: '0.625rem', color: 'var(--text-secondary)' }}>{criticalRisksCount} critical</span>
          </div>

          <div className="dash-ai-metric-box">
            <span className="dash-ai-metric-label">Approvals</span>
            <span className="dash-ai-metric-value" style={{ color: approvalsCount > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
              {approvalsCount}
            </span>
            <span style={{ fontSize: '0.625rem', color: 'var(--text-secondary)' }}>{isProjectScoped ? 'pending (Org-wide)' : 'pending action'}</span>
          </div>
        </div>
      </div>

      <div className="dash-ai-suggestions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Smart Suggestions</span>
          
          {isLoading ? (
            <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <div style={{ height: '12px', background: 'var(--surface-elevated)', borderRadius: '3px', width: '90%' }} />
              <div style={{ height: '12px', background: 'var(--surface-elevated)', borderRadius: '3px', width: '80%' }} />
            </div>
          ) : isError ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <AlertCircle size={12} />
              Failed to load suggestions.
              <button onClick={onRetry} style={{ color: 'var(--accent)', fontWeight: 600 }}>Retry</button>
            </div>
          ) : (
            <div className="dash-ai-suggestion-list">
              {briefing?.recommendations && briefing.recommendations.length > 0 ? (
                briefing.recommendations.slice(0, 3).map((rec, i) => (
                  <div
                    key={i}
                    className="dash-ai-suggestion-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (rec.toLowerCase().includes('invoice')) router.push('/invoices');
                      else if (rec.toLowerCase().includes('project')) router.push('/projects');
                      else if (rec.toLowerCase().includes('task')) router.push('/tasks');
                      else if (rec.toLowerCase().includes('lead')) router.push('/crm');
                      else if (rec.toLowerCase().includes('approval')) router.push('/timesheets/approvals');
                    }}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: i === 0 ? 'var(--danger)' : 'var(--warning)',
                      flexShrink: 0, marginTop: 5
                    }} />
                    <span>{truncate(rec, 65)}</span>
                  </div>
                ))
              ) : (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>No recommendations today</p>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => router.push('/ai')}
          className="btn btn-primary"
          style={{ width: '100%', fontSize: '0.75rem', padding: '0.375rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', marginTop: '0.5rem' }}
        >
          Open AI Assistant <ArrowUpRight size={12} />
        </button>
      </div>
    </div>
  );
}
