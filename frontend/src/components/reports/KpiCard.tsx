import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
}

export default function KpiCard({ title, value, subtext, icon, trend }: KpiCardProps) {
  const isPositive = trend ? trend.value >= 0 : true;

  return (
    <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="kpi-label">{title}</span>
        {icon && (
          <div style={{
            padding: '0.5rem',
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {icon}
          </div>
        )}
      </div>

      <span className="kpi-value">{value}</span>

      {(trend || subtext) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', fontSize: '0.75rem' }}>
          {trend && (
            <span
              className={`badge ${isPositive ? 'badge-success' : 'badge-danger'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '0.625rem',
                padding: '2px 6px'
              }}
            >
              {isPositive ? (
                <ArrowUpRight size={12} />
              ) : (
                <ArrowDownRight size={12} />
              )}
              {Math.abs(trend.value)}%
            </span>
          )}
          {subtext && <span className="text-secondary">{subtext}</span>}
        </div>
      )}
    </div>
  );
}
