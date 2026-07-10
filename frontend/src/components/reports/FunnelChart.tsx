import React from 'react';

interface FunnelStage {
  stage: string;
  count: number;
}

interface FunnelChartProps {
  data: FunnelStage[];
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
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.625rem' }}>
        <span className="kpi-label">Conversion Funnel</span>
        <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)' }}>Based on count</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {data.map((row, idx) => {
          const percentage = Math.round((row.count / maxVal) * 100);
          
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{row.stage}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {row.count} <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '10px' }}>({percentage}%)</span>
                </span>
              </div>
              <div style={{ height: '16px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex', alignItems: 'center', border: '1px solid var(--border)' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--accent), #4f46e5)',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'all 1s ease-out',
                    width: `${percentage}%`
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
