import React from 'react';

export default function DashboardSkeleton() {
  return (
    <div className="dash-container animate-pulse">
      {/* Hero Section Skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ height: '1.75rem', width: '250px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)' }} />
          <div style={{ height: '1rem', width: '150px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-sm)' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: '2rem', width: '70px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      </div>

      {/* AI Command Center Skeleton */}
      <div style={{ height: '120px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-lg)' }} />

      {/* 6 KPI Cards Skeleton */}
      <div className="dash-grid-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="dash-card dash-kpi-card" style={{ height: '120px', background: 'var(--surface-elevated)' }} />
        ))}
      </div>

      {/* Today's Focus Strip Skeleton */}
      <div className="dash-focus-strip" style={{ background: 'var(--surface-elevated)', height: '70px' }} />

      {/* Two-Column Grid Skeleton (Attention + Chart) */}
      <div className="dash-grid-2">
        <div className="dash-card" style={{ height: '340px', background: 'var(--surface-elevated)' }} />
        <div className="dash-card" style={{ height: '340px', background: 'var(--surface-elevated)' }} />
      </div>

      {/* Three-Column Grid Skeleton (Project Health + Sales Pipeline + Team Performance) */}
      <div className="dash-grid-3">
        <div className="dash-card" style={{ height: '300px', background: 'var(--surface-elevated)' }} />
        <div className="dash-card" style={{ height: '300px', background: 'var(--surface-elevated)' }} />
        <div className="dash-card" style={{ height: '300px', background: 'var(--surface-elevated)' }} />
      </div>
    </div>
  );
}
