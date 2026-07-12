import React from 'react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { KpiCard } from './shared';

interface KPICardsProps {
  cards: KpiCard[];
}

export default function KPICards({ cards }: KPICardsProps) {
  // Sparkline generator (pure SVG)
  const Sparkline = ({ values, color }: { values: number[]; color: string }) => {
    if (!values || values.length < 2) return null;
    const W = 72;
    const H = 28;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * W;
        const y = H - ((v - min) / range) * (H - 6) - 3;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg width={W} height={H} className="overflow-visible flex-shrink-0" style={{ pointerEvents: 'none' }}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pts}
          opacity="0.85"
        />
      </svg>
    );
  };

  return (
    <div className="dash-grid-6">
      {cards.map((card, i) => {
        const Icon = card.icon;
        const isUp = card.trend === 'up';
        const isDown = card.trend === 'down';
        const trendColor = isUp ? 'var(--success)' : isDown ? 'var(--danger)' : 'var(--text-muted)';
        
        return (
          <div
            key={i}
            className="dash-card dash-kpi-card"
            style={{ borderTop: `3px solid ${card.color}` }}
          >
            <div className="dash-card-header">
              <span className="dash-card-title">
                {card.label}
                <HelpIcon text={card.help} size={12} />
              </span>
              <div style={{
                color: card.color,
                background: `${card.color}15`,
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon size={13} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
              <div className="dash-kpi-value">{card.value}</div>
            </div>

            <div className="dash-kpi-footer">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                <span className="dash-kpi-trend" style={{ color: trendColor }}>
                  {card.badge}
                </span>
                <span className="dash-kpi-sub">{card.sub}</span>
              </div>
              {card.sparklineData && card.sparklineData.length > 1 && (
                <Sparkline values={card.sparklineData} color={card.color} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
