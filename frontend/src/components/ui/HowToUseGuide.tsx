'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export interface HowToUseSection {
  heading: string;
  items: string[];
}

export interface HowToUseContent {
  overview: string;
  sections: HowToUseSection[];
}

interface HowToUseGuideProps {
  /** Unique key for this module, e.g. "projects" — used to auto-open the guide once per browser. */
  moduleKey: string;
  title: string;
  content: HowToUseContent;
}

function GuideBody({ title, content, onClose }: { title: string; content: HowToUseContent; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          maxWidth: '560px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)', animation: 'slideUp 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <HelpCircle size={18} style={{ color: 'var(--accent)' }} />
            {title}
          </h3>
          <button onClick={onClose} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer' }} className="hover:text-primary hover:bg-surface-elevated">
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{content.overview}</p>

          {content.sections.map((section, i) => (
            <div key={i}>
              <h4 style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {section.heading}
              </h4>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {section.items.map((item, j) => (
                  <li key={j} style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * "How to Use" button for a page header. Auto-opens once per browser the first
 * time a user visits this module (tracked via localStorage), so new hires get a
 * guided intro without asking anyone; the button lets them reopen it any time.
 */
export function HowToUseGuide({ moduleKey, title, content }: HowToUseGuideProps) {
  const [open, setOpen] = useState(false);
  const storageKey = `creativals_howto_seen_${moduleKey}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem(storageKey)) {
      setOpen(true);
      window.localStorage.setItem(storageKey, '1');
    }
  }, [storageKey]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-sm"
        title="Learn how this module works"
      >
        <HelpCircle size={14} /> How to Use
      </button>
      {open && <GuideBody title={title} content={content} onClose={() => setOpen(false)} />}
    </>
  );
}
