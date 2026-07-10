'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, LogOut, FolderKanban, FileText, ChevronRight,
  Clock, TrendingUp, CheckCircle2, AlertCircle, BarChart2,
  ExternalLink, RefreshCw, User,
} from 'lucide-react';
import { portal, PortalProject, PortalInvoice, PaginationMeta } from '@/lib/api';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

type ClientUser = { id: number; name: string; email: string };

const PORTAL_DASHBOARD_HOWTO = {
  overview: 'Welcome to your client portal — your window into the work we\'re doing for you. From this dashboard you can follow the progress of your projects and keep track of the invoices we\'ve sent you, all in one place.',
  sections: [
    {
      heading: 'What You Can Do Here',
      items: [
        'See all your projects at a glance, each with a progress bar showing how far along it is.',
        'Click any project card to open its full details — milestones, tasks, and key dates.',
        'Review every invoice we\'ve sent you, with its amount, due date, and payment status.',
        'Use the refresh icon at the top right any time to pull in the latest updates.',
      ],
    },
    {
      heading: 'Understanding Invoice Statuses',
      items: [
        'Sent — the invoice is with you and awaiting payment.',
        'Partial — we\'ve received part of the payment; any remaining balance is shown in red.',
        'Paid — fully settled, nothing more to do.',
        'Overdue — the due date has passed; please get in touch if you have any questions.',
      ],
    },
    {
      heading: 'Tips',
      items: [
        'The numbers at the top give you a quick summary — active projects, pending invoices, total paid, and average progress across your projects.',
        'Everything here updates as our team works, so check back any time for the latest picture.',
        'If something looks off or you have a question, just reach out to your project manager.',
      ],
    },
  ],
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    planning:     { bg: '#1e3a5f', color: '#60a5fa', label: 'Planning' },
    in_progress:  { bg: '#1a3a2a', color: '#34d399', label: 'In Progress' },
    active:       { bg: '#1a3a2a', color: '#34d399', label: 'Active' },
    on_hold:      { bg: '#3d2f0a', color: '#fbbf24', label: 'On Hold' },
    completed:    { bg: '#1a2e1a', color: '#4ade80', label: 'Completed' },
    cancelled:    { bg: '#2e1a1a', color: '#f87171', label: 'Cancelled' },
  };
  const s = map[status] ?? { bg: 'var(--surface-2)', color: 'var(--text-secondary)', label: status };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {s.label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    draft:           { bg: 'var(--surface-2)', color: 'var(--text-muted)', label: 'Draft' },
    sent:            { bg: '#1e3a5f', color: '#60a5fa', label: 'Sent' },
    approved:        { bg: '#1a3a2a', color: '#34d399', label: 'Approved' },
    paid:            { bg: '#1a2e1a', color: '#4ade80', label: 'Paid' },
    partially_paid:  { bg: '#2a2a0a', color: '#facc15', label: 'Partial' },
    overdue:         { bg: '#2e1a1a', color: '#f87171', label: 'Overdue' },
    cancelled:       { bg: '#2e1a1a', color: '#f87171', label: 'Cancelled' },
  };
  const s = map[status] ?? { bg: 'var(--surface-2)', color: 'var(--text-secondary)', label: status };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {s.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: 'linear-gradient(90deg, #059669, #34d399)', borderRadius: 4, transition: 'width 0.4s ease' }} />
    </div>
  );
}

export default function PortalDashboard() {
  const router = useRouter();
  const [user, setUser]         = useState<ClientUser | null>(null);
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [projMeta, setProjMeta] = useState<PaginationMeta | null>(null);
  const [invMeta, setInvMeta]   = useState<PaginationMeta | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('client_user');
    if (!raw || !localStorage.getItem('client_token')) {
      router.replace('/portal/login');
      return;
    }
    try { setUser(JSON.parse(raw)); } catch { /* ignore */ }
  }, [router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, iRes] = await Promise.all([
        portal.getProjects({ per_page: 10 }),
        portal.getInvoices({ per_page: 10 }),
      ]);
      // The interceptor may unwrap .data.data → raw array, or leave .data with meta
      const pData = pRes.data as unknown as { data: PortalProject[]; meta: PaginationMeta } | PortalProject[];
      const iData = iRes.data as unknown as { data: PortalInvoice[]; meta: PaginationMeta } | PortalInvoice[];

      if (Array.isArray(pData)) {
        setProjects(pData);
      } else {
        setProjects(pData.data ?? []);
        if (pData.meta) setProjMeta(pData.meta);
      }
      if (Array.isArray(iData)) {
        setInvoices(iData);
      } else {
        setInvoices(iData.data ?? []);
        if (iData.meta) setInvMeta(iData.meta);
      }
    } catch {
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const handleLogout = () => {
    localStorage.removeItem('client_token');
    localStorage.removeItem('client_user');
    router.replace('/portal/login');
  };

  // Computed metrics
  const activeProjects  = projects.filter((p) => ['active', 'in_progress', 'planning'].includes(p.status)).length;
  const pendingInvoices = invoices.filter((i) => ['sent', 'approved', 'overdue'].includes(i.status)).length;
  const totalPaid       = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.paid_amount, 0);
  const avgCompletion   = projects.length ? Math.round(projects.reduce((s, p) => s + p.completion_percentage, 0) / projects.length) : 0;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const metrics = [
    { icon: FolderKanban, label: 'Active Projects',   value: String(activeProjects),    accent: '#10b981', bg: 'rgba(16,185,129,0.12)' },
    { icon: FileText,     label: 'Pending Invoices',  value: String(pendingInvoices),   accent: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    { icon: TrendingUp,   label: 'Total Paid',         value: formatCurrency(totalPaid), accent: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    { icon: BarChart2,    label: 'Avg Completion',    value: `${avgCompletion}%`,        accent: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  ];

  if (loading && !projects.length) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--surface-2)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading your portal…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top Nav ── */}
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #059669, #10b981)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={17} color="#fff" />
            </div>
            <div>
              <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>Creativals OS</span>
              <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', color: '#059669', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Client Portal</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <HowToUseGuide moduleKey="portal-dashboard" title="Welcome to Your Client Portal" content={PORTAL_DASHBOARD_HOWTO} />
            {user && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <User size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                {user.name}
              </span>
            )}
            <button
              id="portal-refresh"
              onClick={fetchData}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}
              title="Refresh"
            >
              <RefreshCw size={15} />
            </button>
            <button
              id="portal-logout"
              onClick={handleLogout}
              style={{ background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.875rem', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem' }}
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main style={{ flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', padding: '2rem 1.5rem' }}>
        {/* Page title */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Dashboard
            <HelpIcon title="Your Dashboard" content={{
              what: 'A live summary of everything we\'re working on for you — your projects, their progress, and the invoices we\'ve sent you.',
              why: 'So you always know where things stand without having to ask for a status update.',
              when: 'Check in any time — it updates automatically as our team makes progress.',
            }} />
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Welcome back, {user?.name ?? 'Client'}. Here's your project summary.</p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.5rem' }}>
            <AlertCircle size={16} />{error}
          </div>
        )}

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {metrics.map((m) => (
            <div key={m.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 44, height: 44, background: m.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <m.icon size={20} color={m.accent} />
              </div>
              <div>
                <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{m.value}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{m.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="portal-grid">
          {/* Projects column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                Your Projects
                <HelpIcon text="Click any project card to see its milestones, tasks, and detailed progress." />
              </h2>
              {projMeta && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{projMeta.total} total</span>}
            </div>

            {projects.length === 0 && !loading ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <FolderKanban size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                <p style={{ fontSize: '0.875rem' }}>No projects yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    id={`project-card-${p.id}`}
                    onClick={() => router.push(`/portal/projects/${p.id}`)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem', textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.2s', width: '100%', display: 'block' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#059669')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>{p.name}</div>
                        {p.project_number && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{p.project_number}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <StatusBadge status={p.status} />
                        <ChevronRight size={14} color="var(--text-muted)" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.completion_percentage}% complete</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />{p.milestones_count} milestones · {p.tasks_count} tasks
                      </span>
                    </div>
                    <ProgressBar value={p.completion_percentage} />
                    {(p.start_date || p.end_date) && (
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {p.start_date && <span><Clock size={11} style={{ display: 'inline', marginRight: 3 }} />Started: {new Date(p.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                        {p.end_date && <span>Due: {new Date(p.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Invoices column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                Invoice History
                <HelpIcon text="Status guide: Sent = awaiting your payment, Partial = partly paid, Paid = settled, Overdue = past its due date." />
              </h2>
              {invMeta && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{invMeta.total} total</span>}
            </div>

            {invoices.length === 0 && !loading ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <FileText size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                <p style={{ fontSize: '0.875rem' }}>No invoices yet.</p>
              </div>
            ) : (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                      {['Invoice', 'Amount', 'Due', 'Status'].map((h) => (
                        <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, idx) => (
                      <tr key={inv.id} style={{ borderBottom: idx < invoices.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8125rem' }}>{inv.invoice_number}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{new Date(inv.issue_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {inv.currency?.symbol ?? '₹'}{Number(inv.total_amount).toLocaleString('en-IN')}
                          </div>
                          {inv.due_amount > 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#f87171', marginTop: '0.1rem' }}>
                              Due: {inv.currency?.symbol ?? '₹'}{Number(inv.due_amount).toLocaleString('en-IN')}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          {new Date(inv.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <InvoiceStatusBadge status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .portal-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
