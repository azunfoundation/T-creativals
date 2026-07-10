'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, AlertCircle } from 'lucide-react';
import DateRangePicker from './DateRangePicker';

interface ReportShellProps {
  title: string;
  description?: string;
  titleHelp?: React.ReactNode;
  guide?: React.ReactNode;
  from: string;
  to: string;
  onDateChange: (from: string, to: string) => void;
  onExport?: () => void;
  isLoading?: boolean;
  error?: string | null;
  children: React.ReactNode;
}

export default function ReportShell({
  title,
  description,
  titleHelp,
  guide,
  from,
  to,
  onDateChange,
  onExport,
  isLoading = false,
  error = null,
  children,
}: ReportShellProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
      {/* Back button & Title bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Link
            href="/reports"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: 'var(--text-secondary)',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.5rem',
              textDecoration: 'none',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <ArrowLeft size={14} /> Back to Report Hub
          </Link>
          <h1 className="text-2xl font-bold" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            {title}
            {titleHelp}
          </h1>
          {description && <p className="text-secondary text-sm">{description}</p>}
        </div>

        {/* Date Filter & Export Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <DateRangePicker from={from} to={to} onChange={onDateChange} />
          {guide}

          {onExport && (
            <button
              onClick={onExport}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', height: '38px' }}
            >
              <Download size={16} className="text-success" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <Loader2 size={32} className="text-accent animate-spin" />
          <p className="text-secondary text-sm" style={{ textAlign: 'center' }}>Aggregating report metrics...</p>
        </div>
      ) : error ? (
        <div className="card" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '1rem', border: '1px solid var(--danger-subtle)', background: 'var(--danger-subtle)' }}>
          <AlertCircle size={40} className="text-danger" />
          <h3 className="text-primary font-bold">Failed to load report</h3>
          <p className="text-secondary text-sm" style={{ maxWidth: '400px' }}>{error}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {children}
        </div>
      )}
    </div>
  );
}
