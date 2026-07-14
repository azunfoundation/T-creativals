import React from 'react';

interface FunnelStage {
  stage: string;
  count: number;
}

interface FunnelChartProps {
  data: FunnelStage[];
}

const STAGE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  Draft:            { color: '#8b8ba7', bg: 'rgba(139,139,167,0.15)', label: 'Draft' },
  'Pending Approval': { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  label: 'Pending Approval' },
  Approved:         { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  label: 'Approved' },
  Sent:             { color: '#7c3aed', bg: 'rgba(124,58,237,0.15)', label: 'Sent' },
  Won:              { color: '#10b981', bg: 'rgba(16,185,129,0.15)',  label: 'Won' },
  Rejected:         { color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   label: 'Rejected' },
};

function getStageStyle(stage: string, idx: number) {
  const colors: string[] = ['#8b8ba7','#f59e0b','#3b82f6','#7c3aed','#10b981','#ef4444'];
  const bgs: string[] = [
    'rgba(139,139,167,0.15)','rgba(245,158,11,0.15)','rgba(59,130,246,0.15)',
    'rgba(124,58,237,0.15)','rgba(16,185,129,0.15)','rgba(239,68,68,0.15)',
  ];
  if (STAGE_COLORS[stage]) return STAGE_COLORS[stage];
  return { color: colors[idx % colors.length], bg: bgs[idx % bgs.length], label: stage };
}

export default function FunnelChart({ data = [] }: FunnelChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-secondary text-xs">No funnel data available</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="report-section" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
        <span className="kpi-label">Conversion Funnel</span>
        <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', background: 'var(--surface-elevated)', padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--border)' }}>Based on count</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {data.map((row, idx) => {
          const percentage = Math.round((row.count / maxVal) * 100);
          const style = getStageStyle(row.stage, idx);

          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {/* Color dot */}
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: style.color, flexShrink: 0,
                    boxShadow: `0 0 6px ${style.color}`,
                  }} />
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{row.stage}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    fontSize: '10px', color: style.color, fontWeight: 600,
                    background: style.bg, padding: '1px 7px', borderRadius: '999px',
                    border: `1px solid ${style.color}22`,
                  }}>{percentage}%</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)', minWidth: '1.5rem', textAlign: 'right' }}>
                    {row.count}
                  </span>
                </span>
              </div>
              {/* Progress bar */}
              <div style={{
                height: '8px',
                background: 'var(--surface-elevated)',
                borderRadius: '999px',
                overflow: 'hidden',
                border: '1px solid var(--border)',
              }}>
                <div
                  style={{
                    height: '100%',
                    background: `linear-gradient(90deg, ${style.color}, ${style.color}99)`,
                    borderRadius: '999px',
                    width: `${percentage}%`,
                    transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: `0 0 8px ${style.color}66`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
