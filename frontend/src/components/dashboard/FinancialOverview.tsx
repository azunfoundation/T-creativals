import React, { useState } from 'react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { formatCurrency } from '@/lib/utils';
import { BarChart2 } from 'lucide-react';

interface FinancialOverviewProps {
  trends: any[];
  canViewFinancial: boolean;
}

export default function FinancialOverview({ trends, canViewFinancial }: FinancialOverviewProps) {
  const [activeTab, setActiveTab] = useState<'cashflow' | 'margins'>('cashflow');
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  
  // Toggles for individual series lines
  const [visibleSeries, setVisibleSeries] = useState({
    revenue: true,
    collections: true,
    expenses: true,
    profit: true
  });

  if (!canViewFinancial) {
    return null; // Financial chart is gated behind financial permission
  }

  const seriesConfig = [
    { key: 'revenue', color: '#7c3aed', label: 'Revenue', gid: 'gRev' },
    { key: 'collections', color: '#10b981', label: 'Collections', gid: 'gCol' },
    { key: 'expenses', color: '#f59e0b', label: 'Expenses', gid: 'gExp' },
    { key: 'profit', color: '#ef4444', label: 'Profit', gid: 'gProf' }
  ];

  const toggleSeries = (key: 'revenue' | 'collections' | 'expenses' | 'profit') => {
    setVisibleSeries(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const renderChart = () => {
    if (trends.length < 2) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', gap: '0.75rem' }}>
          <BarChart2 size={36} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No financial data available yet</p>
        </div>
      );
    }

    const W = 760;
    const H = 210;
    const PX = 56;
    const PY = 14;
    const cW = W - PX * 2;
    const cH = H - PY * 2 - 24;

    // Get max value across all visible metrics to scale the Y axis
    const activeKeys = Object.entries(visibleSeries)
      .filter(([_, visible]) => visible)
      .map(([key]) => key);

    const maxVal = Math.max(
      ...trends.flatMap((t: any) => 
        activeKeys.map(k => Math.abs(t[k] || 0))
      ),
      1
    );

    const xOf = (i: number) => PX + (i / (trends.length - 1)) * cW;
    const yOf = (v: number) => PY + cH - (v / maxVal) * cH;

    // SVG Line drawing helper: Draw smooth bezier curves
    // Standard cubic bezier path formulation for smooth lines
    const bezierPath = (key: string) => {
      if (trends.length === 0) return '';
      let path = '';
      trends.forEach((t: any, i: number) => {
        const x = xOf(i);
        const y = yOf(t[key] || 0);
        if (i === 0) {
          path = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
        } else {
          const prevX = xOf(i - 1);
          const prevY = yOf(trends[i - 1][key] || 0);
          const cpX1 = prevX + (x - prevX) / 2;
          const cpY1 = prevY;
          const cpX2 = prevX + (x - prevX) / 2;
          const cpY2 = y;
          path += ` C ${cpX1.toFixed(1)} ${cpY1.toFixed(1)}, ${cpX2.toFixed(1)} ${cpY2.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      });
      return path;
    };

    const areaPath = (key: string) => {
      const line = bezierPath(key);
      if (!line) return '';
      return `${line} L ${xOf(trends.length - 1).toFixed(1)} ${(PY + cH).toFixed(1)} L ${PX.toFixed(1)} ${(PY + cH).toFixed(1)} Z`;
    };

    const gridRatios = [0, 0.25, 0.5, 0.75, 1];

    return (
      <div className="relative w-full select-none" style={{ marginTop: '0.5rem' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }}>
          <defs>
            {seriesConfig.map(s => (
              <linearGradient key={s.gid} id={s.gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* Grid lines */}
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

          {/* Gradient Area Fills */}
          {seriesConfig.map(s => {
            const isVisible = visibleSeries[s.key as keyof typeof visibleSeries];
            if (!isVisible) return null;
            return (
              <path
                key={s.key + 'a'}
                d={areaPath(s.key)}
                fill={`url(#${s.gid})`}
                style={{ transition: 'd 0.3s ease' }}
              />
            );
          })}

          {/* Lines */}
          {seriesConfig.map(s => {
            const isVisible = visibleSeries[s.key as keyof typeof visibleSeries];
            if (!isVisible) return null;
            return (
              <path
                key={s.key + 'l'}
                d={bezierPath(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: 'd 0.3s ease' }}
              />
            );
          })}

          {/* Hover Crosshairs & Points */}
          {hoveredMonth !== null && (
            <>
              <line
                x1={xOf(hoveredMonth)}
                y1={PY}
                x2={xOf(hoveredMonth)}
                y2={PY + cH}
                stroke="var(--text-muted)"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              {seriesConfig.map(s => {
                const isVisible = visibleSeries[s.key as keyof typeof visibleSeries];
                if (!isVisible) return null;
                return (
                  <circle
                    key={s.key}
                    cx={xOf(hoveredMonth)}
                    cy={yOf(trends[hoveredMonth][s.key] || 0)}
                    r="4"
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth="2"
                  />
                );
              })}
            </>
          )}

          {/* Month labels */}
          {trends.map((t: any, i: number) => (
            <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fill="var(--text-secondary)" fontSize="9">
              {t.month_name?.split(' ')[0] || ''}
            </text>
          ))}

          {/* Hover hitboxes */}
          {trends.map((_: any, i: number) => (
            <rect
              key={i}
              x={xOf(i) - cW / (trends.length - 1) / 2}
              y={PY}
              width={cW / (trends.length - 1)}
              height={cH}
              fill="transparent"
              onMouseEnter={() => setHoveredMonth(i)}
              onMouseLeave={() => setHoveredMonth(null)}
              style={{ cursor: 'crosshair' }}
            />
          ))}
        </svg>

        {/* Hover Tooltip */}
        {hoveredMonth !== null && (
          <div
            style={{
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
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 6 }}>
              {trends[hoveredMonth].month_name}
            </div>
            {seriesConfig.map(s => {
              const isVisible = visibleSeries[s.key as keyof typeof visibleSeries];
              if (!isVisible) return null;
              return (
                <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: 'var(--text-secondary)', marginBottom: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                    {s.label}
                  </span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(trends[hoveredMonth][s.key])}</strong>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend / Toggles */}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          {seriesConfig.map(s => {
            const isVisible = visibleSeries[s.key as keyof typeof visibleSeries];
            return (
              <div
                key={s.key}
                onClick={() => toggleSeries(s.key as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: isVisible ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: isVisible ? 1 : 0.5,
                  transition: 'opacity 0.2s ease',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: isVisible ? 'transparent' : 'var(--border-subtle)'
                }}
              >
                <span style={{ width: 10, height: 3, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                {s.label}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTable = () => {
    return (
      <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
        <table className="data-table" style={{ width: '100%', fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Month</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Revenue</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Payroll</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Expenses</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Net Profit</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {[...trends].reverse().map((t: any, i: number) => {
              const rev = t.revenue || 0;
              const pay = t.payroll || 0;
              const exp = t.expenses || 0;
              const prof = t.profit || 0;
              const marg = rev > 0 ? (prof / rev) * 100 : 0;
              return (
                <tr key={i}>
                  <td style={{ padding: '0.5rem', fontWeight: 500 }}>{t.month_name}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(rev)}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(pay)}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(exp)}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: prof >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatCurrency(prof)}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: marg >= 20 ? 'var(--success)' : marg >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>
                    {marg.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="dash-card" style={{ flex: 1.5, minHeight: '340px' }}>
      <div className="dash-card-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="dash-card-title" style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Financial Overview
            <HelpIcon title="Financial Overview" content={{
              what: 'Visualizing historical billing, actual client collections, payroll costs, and profit.',
              why: 'Allows management to monitor profit margins and operational expenses MoM.',
              when: 'Evaluate trends monthly to predict cash flow runway.'
            }} />
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>6-Month cash flow history & margins breakdown</p>
        </div>

        <div className="dash-chart-tabs">
          <button
            onClick={() => setActiveTab('cashflow')}
            className={`dash-chart-tab ${activeTab === 'cashflow' ? 'active' : ''}`}
          >
            Cash Flow
          </button>
          <button
            onClick={() => setActiveTab('margins')}
            className={`dash-chart-tab ${activeTab === 'margins' ? 'active' : ''}`}
          >
            Margins
          </button>
        </div>
      </div>

      {activeTab === 'cashflow' ? renderChart() : renderTable()}
    </div>
  );
}
