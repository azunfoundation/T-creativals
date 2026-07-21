import React from 'react';
import { useRouter } from 'next/navigation';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { formatCurrency } from '@/lib/utils';
import { ArrowRight, Flame } from 'lucide-react';

interface SalesPipelineProps {
  salesPipeline: any;
  canViewSales: boolean;
  isProjectScoped?: boolean;
}

export default function SalesPipeline({ salesPipeline, canViewSales, isProjectScoped = false }: SalesPipelineProps) {
  const router = useRouter();

  if (!canViewSales || !salesPipeline) {
    return null; // Gated behind sales permission
  }

  const stages = [
    { label: 'Fresh', count: salesPipeline.fresh_leads || 0, color: '#3b82f6' },
    { label: 'Warm', count: salesPipeline.warm_leads || 0, color: '#f59e0b' },
    { label: 'Hot', count: salesPipeline.hot_leads || 0, color: '#ef4444' },
    { label: 'Quoted', count: salesPipeline.quotes_sent || 0, color: '#7c3aed' },
    { label: 'Won', count: salesPipeline.won || 0, color: '#10b981' }
  ];

  const maxVal = Math.max(...stages.map(s => s.count), 1);
  const totalLeads = stages[0].count || 1;
  const overallConversion = ((stages[stages.length - 1].count / totalLeads) * 100).toFixed(1);

  return (
    <div className="dash-card" style={{ flex: 1, minHeight: '300px' }}>
      <div className="dash-card-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="dash-card-title" style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Sales Pipeline {isProjectScoped && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>(Org-wide)</span>}
            <HelpIcon title="Sales Pipeline" content={{
              what: 'A visual funnel depicting the current status and conversion of leads in your sales pipeline.',
              why: 'Allows sales managers to monitor conversion bottlenecks between stages.',
              when: 'Evaluate daily. A high drop-off between Hot and Quoted indicates quoting delays.'
            }} />
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Pipeline value: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(salesPipeline.pipeline_value || 0)}</strong>
          </p>
        </div>
        <button
          onClick={() => router.push('/crm')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}
        >
          View CRM <ArrowRight size={12} />
        </button>
      </div>

      {/* Visual Funnel layout: Center-aligned funnel bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', flex: 1, justifyContent: 'center' }}>
        {stages.map((s, i) => {
          // Compute widths. Proportional to maximum value, but centered.
          // Minimum width of 35% so it's readable.
          const pct = Math.max(35, maxVal > 0 ? (s.count / maxVal) * 100 : 35);
          const convPct = i === 0 ? 100 : stages[i - 1].count > 0 ? Math.round((s.count / stages[i - 1].count) * 100) : 0;

          return (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--text-secondary)', marginBottom: '2px', padding: '0 4px' }}>
                <span style={{ fontWeight: 500 }}>{s.label}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {i > 0 && <span style={{ color: 'var(--text-muted)' }}>{convPct}%↓</span>}
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.count}</span>
                </div>
              </div>

              {/* Centered Funnel Bar */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <div
                  className="dash-funnel-bar"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${s.color}dd, ${s.color})`,
                    justifyContent: 'center',
                    padding: 0,
                    boxShadow: 'var(--shadow-sm)',
                    opacity: 0.9
                  }}
                >
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700 }}>{s.count}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Funnel Metrics */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Overall Conversion</span>
          <span style={{ fontWeight: 600, color: 'var(--success)' }}>{overallConversion}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Follow-ups Pending</span>
          <span style={{ fontWeight: 600, color: (salesPipeline.pending_followups || 0) > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
            {salesPipeline.pending_followups || 0}
          </span>
        </div>
      </div>
    </div>
  );
}
