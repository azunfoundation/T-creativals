'use client';
import React from 'react';

export function SkeletonLine({
  width = '100%',
  height = 16,
  borderRadius = 6,
}: {
  width?: string | number;
  height?: number;
  borderRadius?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background:
          'linear-gradient(90deg, var(--surface-elevated) 25%, var(--surface) 50%, var(--surface-elevated) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s infinite',
      }}
    />
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div
      style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem',
        height,
      }}
    >
      <SkeletonLine width="60%" height={14} />
      <div style={{ height: 12 }} />
      <SkeletonLine width="40%" height={28} />
      <div style={{ height: 8 }} />
      <SkeletonLine width="80%" height={12} />
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 16,
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonLine
              key={j}
              width={j === 0 ? 32 : `${60 + j * 10}%`}
              height={j === 0 ? 32 : 14}
              borderRadius={j === 0 ? 16 : 4}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
