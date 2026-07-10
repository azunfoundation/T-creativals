'use client';

import React, { useState } from 'react';

interface BarChartProps {
  data: any[];
  xKey: string;
  yKey: string;
  secondaryYKey?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
}

export default function BarChart({
  data = [],
  xKey,
  yKey,
  secondaryYKey,
  height = 300,
  valueFormatter = (val) => String(val),
}: BarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-secondary text-xs">No trend data available</p>
      </div>
    );
  }

  // Padding inside the SVG
  const padding = { top: 20, right: 30, bottom: 40, left: 60 };
  const svgWidth = 600;
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate scales
  const values = data.map((d) => Number(d[yKey] || 0));
  const secValues = secondaryYKey ? data.map((d) => Number(d[secondaryYKey] || 0)) : [];
  const maxVal = Math.max(...values, ...secValues, 10);
  const minVal = 0;
  const valRange = maxVal - minVal;

  const barCount = data.length;
  const rawBarWidth = chartWidth / barCount;
  const barGap = rawBarWidth * 0.25; // 25% gap
  const barWidth = rawBarWidth - barGap;

  const getCoordinates = (index: number, val: number) => {
    const x = padding.left + index * rawBarWidth + barGap / 2;
    const pct = val / valRange;
    const y = padding.top + chartHeight * (1 - pct);
    const h = chartHeight * pct;
    return { x, y, h };
  };

  // Grid lines
  const gridCount = 4;
  const gridYCoords = Array.from({ length: gridCount + 1 }, (_, i) => {
    const val = minVal + (valRange / gridCount) * i;
    const pct = val / valRange;
    const y = padding.top + chartHeight * (1 - pct);
    return { y, val };
  });

  return (
    <div className="card" style={{ padding: '1.25rem', position: 'relative', width: '100%', minHeight: 0 }}>
      <svg viewBox={`0 0 ${svgWidth} ${height}`} className="w-full h-auto select-none">
        {/* Y Grid lines */}
        {gridYCoords.map((grid, idx) => (
          <g key={idx} style={{ opacity: 0.4 }}>
            <line
              x1={padding.left}
              y1={grid.y}
              x2={svgWidth - padding.right}
              y2={grid.y}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <text
              x={padding.left - 8}
              y={grid.y + 4}
              textAnchor="end"
              fill="var(--text-muted)"
              fontSize="10"
              fontFamily="monospace"
            >
              {valueFormatter(grid.val)}
            </text>
          </g>
        ))}

        {/* X Axis Line */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={svgWidth - padding.right}
          y2={height - padding.bottom}
          stroke="var(--border)"
          strokeWidth={1}
        />

        {/* Bars */}
        {data.map((d, idx) => {
          const val = Number(d[yKey] || 0);
          const { x, y, h } = getCoordinates(idx, val);

          // Double bars if secondary key exists
          if (secondaryYKey) {
            const secVal = Number(d[secondaryYKey] || 0);
            const coordSec = getCoordinates(idx, secVal);
            const halfWidth = barWidth / 2;

            return (
              <g key={idx}>
                {/* Bar 1 */}
                <rect
                  x={x}
                  y={y}
                  width={halfWidth}
                  height={Math.max(h, 2)}
                  rx="1.5"
                  fill="var(--success)"
                  style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
                {/* Bar 2 */}
                <rect
                  x={x + halfWidth + 1}
                  y={coordSec.y}
                  width={halfWidth}
                  height={Math.max(coordSec.h, 2)}
                  rx="1.5"
                  fill="var(--info)"
                  style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
                {/* X Axis Label */}
                <text
                  x={x + halfWidth}
                  y={height - padding.bottom + 16}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize="9"
                  fontWeight="500"
                >
                  {d[xKey]}
                </text>
              </g>
            );
          }

          // Single bar
          return (
            <g key={idx}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(h, 2)}
                rx="3"
                fill="var(--success)"
                style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
              <text
                x={x + barWidth / 2}
                y={height - padding.bottom + 16}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="9"
                fontWeight="500"
              >
                {d[xKey]}
              </text>
            </g>
          );
        })}

        {/* Hover values tooltip */}
        {hoveredIdx !== null && (
          <g>
            <rect
              x={padding.left + hoveredIdx * rawBarWidth}
              y={padding.top}
              width={rawBarWidth}
              height={chartHeight}
              fill="var(--border)"
              style={{ opacity: 0.1 }}
              pointerEvents="none"
            />
          </g>
        )}
      </svg>

      {/* HTML absolute tooltip overlay */}
      {hoveredIdx !== null && (
        <div
          style={{
            position: 'absolute',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.625rem',
            boxShadow: 'var(--shadow-lg)',
            pointerEvents: 'none',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            fontWeight: 500,
            zIndex: 10,
            left: `${padding.left + hoveredIdx * rawBarWidth + rawBarWidth / 2}px`,
            top: '20px',
            transform: 'translateX(-50%)'
          }}
        >
          <p style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '0.25rem' }}>{data[hoveredIdx][xKey]}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--success)', display: 'inline-block' }} /> Primary:</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--success)' }}>{valueFormatter(data[hoveredIdx][yKey])}</span>
            </div>
            {secondaryYKey && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--info)', display: 'inline-block' }} /> Secondary:</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--info)' }}>{valueFormatter(data[hoveredIdx][secondaryYKey])}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
