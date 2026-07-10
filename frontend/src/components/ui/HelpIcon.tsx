'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

export interface HelpContent {
  what?: string;
  why?: string;
  when?: string;
  steps?: string[];
  bestPractices?: string[];
  mistakes?: string[];
}

interface HelpIconProps {
  /** Short one-line tip shown as a native hover tooltip. Use for a quick field hint. */
  text?: string;
  /** Structured explanation shown in a click-to-open popover. Use for a feature/section. */
  content?: HelpContent;
  /** Optional label prefixing the popover, e.g. the field/feature name. */
  title?: string;
  size?: number;
}

/**
 * Small "ⓘ" affordance. Pass `text` for a simple hover tip, or `content` for a
 * richer what/why/when/steps popover. Safe to sprinkle next to any field, button,
 * or section heading — it never affects layout of its neighbors (inline-flex, tiny).
 */
export function HelpIcon({ text, content, title, size = 14 }: HelpIconProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!content) {
    return (
      <span
        title={text}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size + 4, height: size + 4, borderRadius: '50%',
          color: 'var(--text-muted)', cursor: 'help', verticalAlign: 'middle',
        }}
      >
        <Info size={size} />
      </span>
    );
  }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={text || 'Help'}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size + 6, height: size + 6, borderRadius: '50%',
          background: open ? 'var(--accent-subtle)' : 'transparent',
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        <Info size={size} />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '130%', left: 0, zIndex: 200,
            width: '320px', maxWidth: '80vw',
            background: 'var(--surface-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
            padding: '0.875rem 1rem', fontSize: '0.8125rem', lineHeight: 1.5,
            color: 'var(--text-secondary)',
          }}
        >
          {title && (
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
              {title}
            </div>
          )}
          {content.what && (
            <p style={{ margin: '0 0 0.5rem' }}><strong style={{ color: 'var(--text-primary)' }}>What: </strong>{content.what}</p>
          )}
          {content.why && (
            <p style={{ margin: '0 0 0.5rem' }}><strong style={{ color: 'var(--text-primary)' }}>Why: </strong>{content.why}</p>
          )}
          {content.when && (
            <p style={{ margin: '0 0 0.5rem' }}><strong style={{ color: 'var(--text-primary)' }}>When: </strong>{content.when}</p>
          )}
          {content.steps && content.steps.length > 0 && (
            <div style={{ margin: '0 0 0.5rem' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Steps:</strong>
              <ol style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                {content.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}
          {content.bestPractices && content.bestPractices.length > 0 && (
            <div style={{ margin: '0 0 0.5rem' }}>
              <strong style={{ color: 'var(--success)' }}>Best practice:</strong>
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                {content.bestPractices.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {content.mistakes && content.mistakes.length > 0 && (
            <div>
              <strong style={{ color: 'var(--danger)' }}>Avoid:</strong>
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                {content.mistakes.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
