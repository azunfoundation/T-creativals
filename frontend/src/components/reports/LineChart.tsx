'use client';

import React, { useState } from 'react';

interface LineChartProps {
  data: any[];
  xKey: string;
  yKey: string;
  secondaryYKey?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
}

export default function LineChart({
  data = [],
  xKey,
  yKey,
  secondaryYKey,
  height = 300,
  valueFormatter = (val) => String(val),
}: LineChartProps) {
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

  const pointsCount = data.length;
  const xStep = chartWidth / (pointsCount - 1 || 1);

  const getCoordinates = (index: number, val: number) => {
    const x = padding.left + index * xStep;
    const pct = val / valRange;
    const y = padding.top + chartHeight * (1 - pct);
    return { x, y };
  };

  // Generate paths
  const linePoints = data.map((d, i) => getCoordinates(i, Number(d[yKey] || 0)));
  const linePath = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Area path
  const areaPath = linePoints.length > 0
    ? `${linePath} L ${linePoints[linePoints.length - 1].x} ${height - padding.bottom} L ${linePoints[0].x} ${height - padding.bottom} Z`
    : '';

  // Secondary line and area
  let secLinePath = '';
  let secAreaPath = '';
  let secLinePoints: any[] = [];
  if (secondaryYKey) {
    secLinePoints = data.map((d, i) => getCoordinates(i, Number(d[secondaryYKey] || 0)));
    secLinePath = secLinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    secAreaPath = secLinePoints.length > 0
      ? `${secLinePath} L ${secLinePoints[secLinePoints.length - 1].x} ${height - padding.bottom} L ${secLinePoints[0].x} ${height - padding.bottom} Z`
      : '';
  }

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
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--success)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="secAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--info)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--info)" stopOpacity="0" />
          </linearGradient>
        </defs>

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

        {/* Areas */}
        {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}
        {secAreaPath && <path d={secAreaPath} fill="url(#secAreaGrad)" />}

        {/* X Axis labels */}
        {data.map((d, idx) => {
          const x = padding.left + idx * xStep;
          // Only show labels every few ticks if there are many labels
          const showLabel = data.length <= 12 || idx % Math.ceil(data.length / 12) === 0;

          return (
            showLabel && (
              <text
                key={idx}
                x={x}
                y={height - padding.bottom + 16}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="9"
                fontWeight="500"
              >
                {d[xKey]}
              </text>
            )
          );
        })}

        {/* Lines */}
        {linePath && (
          <path d={linePath} fill="none" stroke="var(--success)" strokeWidth={2} strokeLinejoin="round" />
        )}
        {secLinePath && (
          <path d={secLinePath} fill="none" stroke="var(--info)" strokeWidth={2} strokeLinejoin="round" />
        )}

        {/* Invisible vertical slices for hover detection */}
        {data.map((_, idx) => {
          const x = padding.left + idx * xStep;
          return (
            <rect
              key={idx}
              x={x - xStep / 2}
              y={padding.top}
              width={xStep}
              height={chartHeight}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}

        {/* Hover elements */}
        {hoveredIdx !== null && (
          <g>
            <line
              x1={padding.left + hoveredIdx * xStep}
              y1={padding.top}
              x2={padding.left + hoveredIdx * xStep}
              y2={height - padding.bottom}
              stroke="var(--border)"
              strokeWidth={1.5}
              strokeDasharray="2,2"
              pointerEvents="none"
            />
            {/* Primary value circle */}
            <circle
              cx={linePoints[hoveredIdx].x}
              cy={linePoints[hoveredIdx].y}
              r="4.5"
              fill="var(--background)"
              stroke="var(--success)"
              strokeWidth={2}
              pointerEvents="none"
            />
            {/* Secondary value circle */}
            {secondaryYKey && (
              <circle
                cx={secLinePoints[hoveredIdx].x}
                cy={secLinePoints[hoveredIdx].y}
                r="4.5"
                fill="var(--background)"
                stroke="var(--info)"
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
          </g>
        )}
      </svg>

      {/* HTML tooltip overlay */}
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
            left: `${padding.left + hoveredIdx * xStep}px`,
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
