import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export type KpiAccent = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  accent?: KpiAccent;
  trend?: {
    value: number;
    label?: string;
  };
}

const accentMap: Record<KpiAccent, { color: string; bg: string; glow: string; border: string }> = {
  accent:  { color: 'var(--accent)',   bg: 'var(--accent-subtle)',   glow: 'rgba(124,58,237,0.35)',  border: 'rgba(124,58,237,0.3)'  },
  success: { color: 'var(--success)',  bg: 'var(--success-subtle)',  glow: 'rgba(16,185,129,0.35)',  border: 'rgba(16,185,129,0.3)'  },
  warning: { color: 'var(--warning)',  bg: 'var(--warning-subtle)',  glow: 'rgba(245,158,11,0.35)',  border: 'rgba(245,158,11,0.3)'  },
  danger:  { color: 'var(--danger)',   bg: 'var(--danger-subtle)',   glow: 'rgba(239,68,68,0.35)',   border: 'rgba(239,68,68,0.3)'   },
  info:    { color: 'var(--info)',     bg: 'var(--info-subtle)',     glow: 'rgba(59,130,246,0.35)',  border: 'rgba(59,130,246,0.3)'  },
  muted:   { color: 'var(--text-muted)', bg: 'var(--surface-elevated)', glow: 'rgba(90,90,114,0.2)', border: 'var(--border)'       },
};

export default function KpiCard({ title, value, subtext, icon, accent = 'accent', trend }: KpiCardProps) {
  const isPositive = trend ? trend.value >= 0 : true;
  const colors = accentMap[accent];

  return (
    <div
      className="kpi-card report-kpi-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        position: 'relative',
        overflow: 'hidden',
        // Override kpi-card border with accent-matched border
        borderColor: 'var(--border)',
        transition: 'border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = colors.color;
        el.style.boxShadow = `0 0 0 1px ${colors.border}, 0 8px 24px ${colors.glow}`;
        el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = 'var(--border)';
        el.style.boxShadow = 'none';
        el.style.transform = 'translateY(0)';
      }}
    >
      {/* Top-right icon bubble */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="kpi-label">{title}</span>
        {icon && (
          <div style={{
            padding: '0.5rem',
            backgroundColor: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: 'var(--radius-md)',
            color: colors.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      <span className="kpi-value" style={{ letterSpacing: '-0.02em' }}>{value}</span>

      {/* Subtext / Trend */}
      {(trend || subtext) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.125rem', fontSize: '0.75rem' }}>
          {trend && (
            <span
              className={`badge ${isPositive ? 'badge-success' : 'badge-danger'}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.625rem', padding: '2px 6px' }}
            >
              {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(trend.value)}%
            </span>
          )}
          {subtext && <span className="text-secondary">{subtext}</span>}
        </div>
      )}

      {/* Accent bottom stripe */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: `linear-gradient(90deg, ${colors.color}, transparent)`,
        opacity: 0.5,
        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
      }} />
    </div>
  );
}
