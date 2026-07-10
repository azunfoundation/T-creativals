'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preset, setPreset] = useState<string>('This FY');

  // Helper to format Date objects as YYYY-MM-DD local dates
  const formatDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getPresets = () => {
    const now = new Date();
    const year = now.getFullYear();

    // 1. This Month
    const thisMonthStart = new Date(year, now.getMonth(), 1);
    const thisMonthEnd = new Date(year, now.getMonth() + 1, 0);

    // 2. This Quarter
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const thisQuarterStart = new Date(year, currentQuarter * 3, 1);
    const thisQuarterEnd = new Date(year, (currentQuarter + 1) * 3, 0);

    // 3. Indian Financial Year (Apr 1 -> Mar 31)
    let fyStartYear = year;
    if (now.getMonth() < 3) {
      fyStartYear = year - 1;
    }
    const thisFyStart = new Date(fyStartYear, 3, 1);
    const thisFyEnd = new Date(fyStartYear + 1, 2, 31);

    // 4. Last Financial Year
    const lastFyStart = new Date(fyStartYear - 1, 3, 1);
    const lastFyEnd = new Date(fyStartYear, 2, 31);

    return {
      'This Month': { from: formatDateString(thisMonthStart), to: formatDateString(thisMonthEnd) },
      'This Quarter': { from: formatDateString(thisQuarterStart), to: formatDateString(thisQuarterEnd) },
      'This FY': { from: formatDateString(thisFyStart), to: formatDateString(thisFyEnd) },
      'Last FY': { from: formatDateString(lastFyStart), to: formatDateString(lastFyEnd) },
    };
  };

  const presets = getPresets();

  const handlePresetSelect = (name: string) => {
    setPreset(name);
    if (name !== 'Custom') {
      const selected = presets[name as keyof typeof presets];
      onChange(selected.from, selected.to);
    }
    setIsOpen(false);
  };

  const handleCustomDateChange = (type: 'from' | 'to', value: string) => {
    setPreset('Custom');
    if (type === 'from') {
      onChange(value, to);
    } else {
      onChange(from, value);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '0.5rem 0.75rem',
        fontSize: '0.875rem',
        color: 'var(--text-primary)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <Calendar size={16} className="text-accent" />
      
      {/* Preset Selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            cursor: 'pointer'
          }}
        >
          <span>{preset}</span>
          <ChevronDown size={14} />
        </button>

        {isOpen && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              marginTop: '0.5rem',
              width: '160px',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 50,
              padding: '0.25rem 0'
            }}
          >
            {Object.keys(presets).map((name) => (
              <button
                key={name}
                onClick={() => handlePresetSelect(name)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.375rem 0.75rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  background: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                {name}
              </button>
            ))}
            <button
              onClick={() => handlePresetSelect('Custom')}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.375rem 0.75rem',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                background: 'none',
                borderTop: '1px solid var(--border)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              Custom Range
            </button>
          </div>
        )}
      </div>

      <span style={{ color: 'var(--border)' }}>|</span>

      {/* Date Inputs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <input
          type="date"
          value={from}
          onChange={(e) => handleCustomDateChange('from', e.target.value)}
          className="form-input"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.75rem',
            width: '115px',
            cursor: 'pointer',
            padding: 0,
            boxShadow: 'none'
          }}
        />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => handleCustomDateChange('to', e.target.value)}
          className="form-input"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.75rem',
            width: '115px',
            cursor: 'pointer',
            padding: 0,
            boxShadow: 'none'
          }}
        />
      </div>
    </div>
  );
}
