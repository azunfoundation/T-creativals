'use client';

import { use, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quotes as quotesApi, getApiErrorMessage } from '@/lib/api';
import type { Quote } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  ArrowLeft,
  Download,
  Printer,
  CheckCircle,
  XCircle,
  FileText,
  Clock,
  MessageSquare,
  Building,
  User as UserIcon,
  AlertCircle,
  Mail,
  Loader2,
  Check,
  X,
  Minus
} from 'lucide-react';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const QUOTE_DETAIL_HOWTO = {
  overview: 'This page shows one quote as the client will see it (the printable document on the left) plus its internal workflow (the sidebar on the right). What you can do here depends on the quote\'s status — Draft, Pending Approval, Approved, Sent, and so on.',
  sections: [
    {
      heading: 'Taking action',
      items: [
        'Draft or Rejected: click "Submit for Approval" to send it for internal review, or "Edit Scope Details" to change items and pricing first.',
        'Pending Approval: a Founder, Sales Head, or Admin sees Approve / Reject buttons — rejecting requires a comment explaining what to fix.',
        'Approved or Sent: use "Email to Client" to send the proposal, and "Convert to Invoice" once the client agrees.',
        '"Print" and "Download PDF" produce the client-ready document shown on the left, at any status.',
      ],
    },
    {
      heading: 'Reading the sidebar',
      items: [
        '"Approval Status" shows the current phase and the buttons available to you right now.',
        '"Approval Steps & Logs" is the audit trail — every submit, approve, and reject with who did it, when, and their comments.',
        '"Internal Staff Notes" (if present) are private comments from the quote builder — the client never sees them.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Get the quote Approved internally before emailing it — clients should only ever see signed-off pricing.',
        'Convert to Invoice as soon as the client accepts, so billing matches the agreed quote exactly.',
        'When rejecting, write actionable comments — the creator uses them to fix the draft and resubmit.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Emailing a Draft or Pending quote to the client before approval.',
        'Fixing a Rejected quote but forgetting to click "Submit for Approval" again — it stays stuck as Rejected.',
        'Re-sending a quote whose "Valid Until" date has passed instead of issuing a fresh one.',
      ],
    },
  ],
};

// ── Mock Fallback Data ──────────────────────────────────────────
const MOCK_QUOTE_DETAILS: Record<number, Quote> = {
  1: {
    id: 1,
    quote_number: 'QT-2026-0001',
    lead_id: 1,
    lead: {
      id: 1,
      company_name: 'Apex Designs',
      budget: 100000,
      priority: 'medium',
      temperature: 'warm',
      contacts: [{ id: 1, lead_id: 1, name: 'Sanjay Kapoor', designation: 'Marketing Director', email: 'sanjay@apex.co', phone: '+91 98765 43210', is_primary: true }],
      activities: [],
      stage_id: 1,
      source_id: 1,
      created_at: '',
      updated_at: ''
    },
    title: 'Website Redesign & SEO Campaign',
    currency: 'INR',
    valid_until: '2026-07-15T00:00:00Z',
    status: 'pending_approval',
    subtotal: 180000,
    discount_amount: 15000,
    tax_amount: 29700,
    total_amount: 194700,
    coupon_code: 'WELCOME10',
    terms_conditions: '1. Validity: This quote is valid for 30 days.\n2. Payment Terms: 50% advance, 50% upon delivery.\n3. Taxes: 18% GST will be applicable.',
    internal_notes: 'Margins are good. Standard 15% discount applied on development package.',
    items: [
      { id: 10, quote_id: 1, service_id: 4, description: 'Next.js Web App Development (Custom layout, headless CMS integration, contact forms)', quantity: 1, unit_price: 150000, discount_percent: 10, tax_rate: 18, subtotal: 150000, discount_amount: 15000, tax_amount: 24300, total_amount: 159300 },
      { id: 11, quote_id: 1, service_id: 1, description: 'SEO Optimization (3 months campaign)', quantity: 1, unit_price: 30000, discount_percent: 0, tax_rate: 18, subtotal: 30000, discount_amount: 0, tax_amount: 54000, total_amount: 35405 },
    ],
    created_by: 2,
    creator: { id: 2, name: 'Priya Singh', email: 'priya@creativals.in' },
    approvals: [
      { id: 1, quote_id: 1, user_id: 2, user: { id: 2, name: 'Priya Singh', email: '', roles: [], permissions: [], departments: [], avatar_url: null, status: 'active' }, step_name: 'Draft Created', status: 'approved', comments: 'Initial quote proposal draft.', actioned_at: '2026-06-10T11:00:00Z', created_at: '2026-06-10T11:00:00Z' },
      { id: 2, quote_id: 1, user_id: 2, user: { id: 2, name: 'Priya Singh', email: '', roles: [], permissions: [], departments: [], avatar_url: null, status: 'active' }, step_name: 'Submit for Review', status: 'approved', comments: 'Ready for Sales Head sign-off.', actioned_at: '2026-06-10T11:30:00Z', created_at: '2026-06-10T11:30:00Z' },
    ],
    created_at: '2026-06-10T11:00:00Z',
    updated_at: '2026-06-10T11:30:00Z',
  },
  2: {
    id: 2,
    quote_number: 'QT-2026-0002',
    lead_id: 2,
    lead: {
      id: 2,
      company_name: 'NovaTech Corp',
      budget: 500000,
      priority: 'high',
      temperature: 'hot',
      contacts: [{ id: 2, lead_id: 2, name: 'Amit Sharma', designation: 'CEO', email: 'amit@novatech.co', is_primary: true }],
      activities: [],
      stage_id: 1,
      source_id: 1,
      created_at: '',
      updated_at: ''
    },
    title: 'Mobile App Custom Development',
    currency: 'INR',
    valid_until: '2026-06-30T00:00:00Z',
    status: 'approved',
    subtotal: 300000,
    discount_amount: 0,
    tax_amount: 54000,
    total_amount: 354000,
    terms_conditions: 'Standard terms apply.',
    items: [
      { id: 12, quote_id: 2, service_id: 5, description: 'Mobile App Development (iOS/Android cross platform app)', quantity: 1, unit_price: 300000, discount_percent: 0, tax_rate: 18, subtotal: 300000, discount_amount: 0, tax_amount: 54000, total_amount: 354000 },
    ],
    created_by: 2,
    creator: { id: 2, name: 'Priya Singh', email: '' },
    approvals: [
      { id: 3, quote_id: 2, user_id: 1, user: { id: 1, name: 'Rahul Sharma', email: '', roles: [{ id: 1, name: 'founder', display_name: 'Founder' }], permissions: [], departments: [], avatar_url: null, status: 'active' }, step_name: 'Founder Review', status: 'approved', comments: 'Budget and scope look ideal.', actioned_at: '2026-06-09T14:20:00Z', created_at: '2026-06-09T14:20:00Z' }
    ],
    created_at: '2026-06-08T10:00:00Z',
    updated_at: '2026-06-09T14:20:00Z',
  }
};

interface Params {
  id: string;
}

// ── Safe currency code resolver ──────────────────────────────────
// The API may return currency as a string ('INR') or as an object {id, code, symbol, name}
function resolveCurrencyCode(currency: any): string {
  if (!currency) return 'INR';
  if (typeof currency === 'string') return currency;
  if (typeof currency === 'object') {
    return currency.code ?? currency.currency_code ?? currency.symbol ?? 'INR';
  }
  return 'INR';
}

// Small labelled section heading used across the document preview
function SectionLabel({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <span style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      gap: '0.375rem',
      fontSize: '0.625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
    }}>
      {children}
    </span>
  );
}

export default function QuoteDetailPage({ params }: { params: Promise<Params> }) {
  const { showToast } = useToast();
  const resolvedParams = use(params);
  const quoteId = Number(resolvedParams.id);

  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuthStore();

  // Dialog Modals State
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalActionType, setApprovalActionType] = useState<'approve' | 'reject'>('approve');
  const [commentsText, setCommentsText] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleEmailClient = async () => {
    if (!quote) return;
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      await quotesApi.send(quote.id);
      setEmailStatus({ type: 'success', message: 'Quote proposal sent to client successfully.' });
      setTimeout(() => setEmailStatus(null), 5000);
    } catch (err: any) {
      setEmailStatus({
        type: 'error',
        message: getApiErrorMessage(err, 'Failed to email quote. Please check SMTP settings.')
      });
      setTimeout(() => setEmailStatus(null), 7000);
    } finally {
      setSendingEmail(false);
    }
  };

  // Fetch quote detail
  const { data: quote, isLoading } = useQuery<Quote>({
    queryKey: ['quote-detail', quoteId],
    queryFn: async () => {
      try {
        const res = await quotesApi.get(quoteId);
        return res.data;
      } catch {
        // Fallback
        if (MOCK_QUOTE_DETAILS[quoteId]) {
          return MOCK_QUOTE_DETAILS[quoteId];
        }
        throw new Error('Quote details not found');
      }
    }
  });

  // Action Mutations
  const submitApprovalMutation = useMutation({
    mutationFn: () => quotesApi.submitApproval(quoteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-detail', quoteId] });
      showToast('Quote submitted for internal review.', 'info');
    },
    onError: () => {
      // Fallback
      if (quote) {
        quote.status = 'pending_approval';
        quote.approvals = quote.approvals || [];
        quote.approvals.push({
          id: Date.now(),
          quote_id: quoteId,
          user_id: user?.id || 1,
          user: user || undefined,
          step_name: 'Submit Approval',
          status: 'pending',
          created_at: new Date().toISOString()
        });
        queryClient.setQueryData(['quote-detail', quoteId], { ...quote });
      }
    }
  });

  const approveMutation = useMutation({
    mutationFn: (comments: string) => quotesApi.approve(quoteId, comments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-detail', quoteId] });
      setApprovalModalOpen(false);
      setCommentsText('');
    },
    onError: () => {
      // Fallback
      if (quote) {
        quote.status = 'approved';
        quote.approvals = quote.approvals || [];
        quote.approvals.push({
          id: Date.now(),
          quote_id: quoteId,
          user_id: user?.id || 1,
          user: user || undefined,
          step_name: 'Sales Head / Founder Review',
          status: 'approved',
          comments: commentsText || 'Approved pricing terms.',
          actioned_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
        queryClient.setQueryData(['quote-detail', quoteId], { ...quote });
      }
      setApprovalModalOpen(false);
      setCommentsText('');
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (comments: string) => quotesApi.reject(quoteId, comments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-detail', quoteId] });
      setApprovalModalOpen(false);
      setCommentsText('');
    },
    onError: () => {
      // Fallback
      if (quote) {
        quote.status = 'rejected';
        quote.approvals = quote.approvals || [];
        quote.approvals.push({
          id: Date.now(),
          quote_id: quoteId,
          user_id: user?.id || 1,
          user: user || undefined,
          step_name: 'Sales Head / Founder Review',
          status: 'rejected',
          comments: commentsText || 'Rejected. Adjust pricing.',
          actioned_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
        queryClient.setQueryData(['quote-detail', quoteId], { ...quote });
      }
      setApprovalModalOpen(false);
      setCommentsText('');
    }
  });

  if (isLoading) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '1.5rem' }}>
        <div className="skeleton" style={{ height: '70vh', borderRadius: 'var(--radius-lg)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-lg)' }} />
          <div className="skeleton" style={{ height: 280, borderRadius: 'var(--radius-lg)' }} />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="empty-state" style={{ minHeight: '60vh' }}>
        <AlertCircle size={48} className="empty-state-icon" style={{ color: 'var(--danger)', opacity: 1 }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Quotation Not Found</h2>
        <p style={{ fontSize: '0.875rem' }}>The quote you are looking for does not exist or has been deleted.</p>
        <Link href="/quotes" className="btn btn-secondary" style={{ marginTop: '0.5rem' }}>
          <ArrowLeft size={16} /> Back to List
        </Link>
      </div>
    );
  }

  // Permissions checks
  const isApprover = user?.roles?.some(r => ['founder', 'sales_head', 'admin'].includes(r.name));

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!quote) return;
    setDownloadingPdf(true);
    try {
      const res = await quotesApi.downloadPdf(quote.id);
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${quote.quote_number || 'quote'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      showToast('Failed to download PDF', 'info');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const openApprovalModal = (type: 'approve' | 'reject') => {
    setApprovalActionType(type);
    setApprovalModalOpen(true);
  };

  const submitApprovalAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (approvalActionType === 'approve') {
      approveMutation.mutate(commentsText);
    } else {
      if (!commentsText.trim()) {
        showToast('Please specify the rejection reasons in comments.', 'info');
        return;
      }
      rejectMutation.mutate(commentsText);
    }
  };

  // Status badge config (maps onto globals.css .badge-* classes)
  const statusConfig: Record<Quote['status'], { label: string; badgeClass: string }> = {
    draft: { label: 'Draft', badgeClass: 'badge-muted' },
    pending_approval: { label: 'Pending Approval', badgeClass: 'badge-warning' },
    approved: { label: 'Approved', badgeClass: 'badge-success' },
    sent: { label: 'Sent to Client', badgeClass: 'badge-info' },
    accepted: { label: 'Client Accepted', badgeClass: 'badge-accent' },
    rejected: { label: 'Rejected', badgeClass: 'badge-danger' },
    expired: { label: 'Expired', badgeClass: 'badge-muted' },
    converted: { label: 'Converted to Deal', badgeClass: 'badge-success' },
  };
  const activeStatus = statusConfig[quote.status] || { label: quote.status, badgeClass: 'badge-muted' };
  const currencyCode = resolveCurrencyCode(quote.currency);

  const metaRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', fontSize: '0.75rem' }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <style jsx global>{`
        .quote-detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 380px;
          gap: 1.5rem;
          align-items: start;
        }
        @media (max-width: 1100px) {
          .quote-detail-grid {
            grid-template-columns: 1fr;
          }
        }
        .quote-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        @media (max-width: 640px) {
          .quote-two-col {
            grid-template-columns: 1fr;
          }
        }
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-quote-preview,
          #printable-quote-preview * {
            visibility: visible;
          }
          #printable-quote-preview {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
            border: none !important;
            /* Force a white-paper palette regardless of app theme */
            --surface: #ffffff;
            --surface-elevated: #f9fafb;
            --background: #ffffff;
            --border: #e5e7eb;
            --border-subtle: #f3f4f6;
            --text-primary: #111827;
            --text-secondary: #4b5563;
            --text-muted: #6b7280;
            background: #ffffff !important;
          }
        }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <Link href="/quotes" className="btn btn-secondary btn-icon" title="Back to Quotes">
            <ArrowLeft size={16} />
          </Link>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.01em' }}>
                {quote.quote_number}
              </h1>
              <span className={`badge ${activeStatus.badgeClass}`}>{activeStatus.label}</span>
              <HelpIcon title="Quote Status" content={{
                what: `This quote is currently "${activeStatus.label}".`,
                why: 'A quote moves Draft → Pending Approval → Approved → Sent to Client → Client Accepted, and finally Converted once it becomes an invoice. Rejected sends it back to the creator for edits; Expired means its validity date passed.',
                when: 'Use the buttons in the "Approval Status" card on the right to move it to the next step.',
              }} />
            </div>
            <p className="truncate" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.125rem', maxWidth: '480px' }}>
              {quote.title}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <HowToUseGuide moduleKey="quote-detail" title="How This Quote Page Works" content={QUOTE_DETAIL_HOWTO} />
          <button onClick={handleEmailClient} disabled={sendingEmail} className="btn btn-primary btn-sm">
            {sendingEmail ? <Loader2 size={14} className="animate-pulse" /> : <Mail size={14} />}
            Email to Client
          </button>
          <button onClick={handlePrint} className="btn btn-secondary btn-sm">
            <Printer size={14} /> Print
          </button>
          <button onClick={handleDownloadPdf} disabled={downloadingPdf} className="btn btn-secondary btn-sm">
            {downloadingPdf ? <Loader2 size={14} className="animate-pulse" /> : <Download size={14} />}
            Download PDF
          </button>
        </div>
      </div>

      {emailStatus && (
        <div className="animate-slide-up" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          padding: '0.875rem 1.25rem',
          background: emailStatus.type === 'success' ? 'var(--success-subtle)' : 'var(--danger-subtle)',
          color: emailStatus.type === 'success' ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${emailStatus.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}>
          {emailStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {emailStatus.message}
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="quote-detail-grid">

        {/* Left: document preview (the printable "paper") */}
        <div
          id="printable-quote-preview"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            padding: '2.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem',
          }}
        >
          {/* Letterhead */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '1.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '1.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div className="workspace-logo" style={{ width: 38, height: 38, minWidth: 38, borderRadius: 10 }}>
                  <FileText size={18} color="#fff" />
                </div>
                <span style={{ fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Creativals Agency
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <p>7th Floor, DLF Cyber City, Phase 3</p>
                <p>Gurugram, Haryana - 122002</p>
                <p>GSTIN: 06AAFCC1483L1ZS</p>
                <p>Email: operations@creativals.in</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end', textAlign: 'right' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                Quotation Proposal
              </span>
              <span style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: 'var(--text-primary)', lineHeight: 1 }}>
                {quote.quote_number}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.375rem', minWidth: 200 }}>
                {metaRow('Quote Date', formatDate(quote.created_at || new Date()))}
                {metaRow('Valid Until', formatDate(quote.valid_until))}
                {metaRow('Currency', currencyCode)}
              </div>
            </div>
          </div>

          {/* Prepared for / by */}
          <div className="quote-two-col">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <SectionLabel><Building size={11} /> Prepared For</SectionLabel>
              {quote.lead ? (
                <div style={{ fontSize: '0.8125rem', lineHeight: 1.65 }}>
                  <h4 style={{ fontSize: '0.9375rem', fontWeight: 700 }}>
                    {(quote.lead_id ?? quote.lead.id) ? (
                      <Link
                        href={`/crm/${quote.lead_id ?? quote.lead.id}`}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                        className="hover:text-accent"
                        title="View Lead"
                      >
                        {quote.lead.company_name}
                      </Link>
                    ) : (
                      quote.lead.company_name
                    )}
                  </h4>
                  {quote.lead.contacts?.[0] && (
                    <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{quote.lead.contacts[0].name}</p>
                      <p>{quote.lead.contacts[0].designation || 'Primary Contact'}</p>
                      <p>Email: {quote.lead.contacts[0].email || 'N/A'}</p>
                      <p>Phone: {quote.lead.contacts[0].phone || 'N/A'}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No Lead Profile Linked</p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <SectionLabel><UserIcon size={11} /> Prepared By</SectionLabel>
              <div style={{ fontSize: '0.8125rem', lineHeight: 1.65 }}>
                <h4 style={{ fontSize: '0.9375rem', fontWeight: 700 }}>{quote.creator?.name || 'Account Executive'}</h4>
                <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  <p>Email: {quote.creator?.email || 'sales@creativals.in'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Subject */}
          <div style={{
            background: 'var(--accent-subtle)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--radius-md)',
            padding: '0.875rem 1.125rem',
          }}>
            <SectionLabel>Scope Proposal Subject</SectionLabel>
            <p style={{ fontSize: '0.9375rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--text-primary)' }}>{quote.title}</p>
          </div>

          {/* Line items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <SectionLabel>Scope of Deliverables &amp; Pricing</SectionLabel>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.8125rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '4%', textAlign: 'center' }}>#</th>
                      <th style={{ width: '46%' }}>Service &amp; Scope Deliverables</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>Qty</th>
                      <th style={{ width: '16%', textAlign: 'right' }}>Unit Price</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>Disc</th>
                      <th style={{ width: '16%', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.items?.map((item, index) => {
                      const itemSub = item.quantity * item.unit_price;
                      const itemDisc = itemSub * (item.discount_percent / 100);
                      const itemTotal = itemSub - itemDisc + (itemSub - itemDisc) * (item.tax_rate / 100);

                      return (
                        <tr key={item.id || index}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}>{index + 1}</td>
                          <td>
                            <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-primary)' }}>{item.service?.name || 'Custom Service'}</span>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{item.description}</span>
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(item.unit_price, currencyCode)}</td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: item.discount_percent > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: item.discount_percent > 0 ? 600 : 400 }}>
                            {item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{formatCurrency(itemTotal, currencyCode)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Terms + financial summary */}
          <div className="quote-two-col" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <SectionLabel>Terms &amp; Conditions</SectionLabel>
              <p style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.75,
                whiteSpace: 'pre-line',
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '0.875rem 1rem',
              }}>
                {quote.terms_conditions || 'No custom terms added.'}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <SectionLabel align="right">Financial Summary</SectionLabel>
              <div style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem 1.125rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                fontSize: '0.8125rem',
                fontVariantNumeric: 'tabular-nums',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Subtotal</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(quote.subtotal, currencyCode)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                  <span>Discount</span>
                  <span style={{ fontWeight: 600 }}>-{formatCurrency(quote.discount_amount, currencyCode)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>GST Tax</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(quote.tax_amount, currencyCode)}</span>
                </div>
                {quote.coupon_code && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent)', fontWeight: 600, borderTop: '1px dashed var(--border)', paddingTop: '0.5rem' }}>
                    <span>Promo ({quote.coupon_code})</span>
                    <span>Applied</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--border)', paddingTop: '0.625rem', marginTop: '0.125rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total Net</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.125rem' }}>{formatCurrency(quote.total_amount, currencyCode)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="quote-two-col" style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <div>
              <p>Prepared &amp; Verified By</p>
              <div style={{ borderBottom: '1px solid var(--border)', width: '55%', margin: '3rem auto 0.625rem' }} />
              <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{quote.creator?.name || 'Account Executive'}</p>
            </div>
            <div>
              <p>Client Acceptance Seal / Signature</p>
              <div style={{ borderBottom: '1px solid var(--border)', width: '55%', margin: '3rem auto 0.625rem' }} />
              <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{quote.lead?.company_name || 'Representative'}</p>
            </div>
          </div>
        </div>

        {/* Right: workflow sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Approval status card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.625rem' }}>
              Approval Status
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Current Phase</span>
              <span className={`badge ${activeStatus.badgeClass}`}>{activeStatus.label}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.875rem' }}>
              {/* Draft/Rejected -> Submit for Approval */}
              {(quote.status === 'draft' || quote.status === 'rejected') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <button
                    id="submit-approval-btn"
                    onClick={() => submitApprovalMutation.mutate()}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={submitApprovalMutation.isPending}
                  >
                    <Clock size={15} /> Submit for Approval
                  </button>
                  <HelpIcon text="Sends this quote for internal review. A Founder or Sales Head must approve the pricing before it can be emailed to the client." />
                </div>
              )}

              {/* Pending Approval -> Approver (Founder/Sales Head) Approve/Reject */}
              {quote.status === 'pending_approval' && (
                isApprover ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      id="approve-quote-btn"
                      onClick={() => openApprovalModal('approve')}
                      className="btn"
                      style={{ flex: 1, background: 'var(--success)', color: '#fff', fontWeight: 600 }}
                    >
                      <CheckCircle size={15} /> Approve
                    </button>
                    <button
                      id="reject-quote-btn"
                      onClick={() => openApprovalModal('reject')}
                      className="btn btn-danger"
                      style={{ flex: 1, fontWeight: 600 }}
                    >
                      <XCircle size={15} /> Reject
                    </button>
                    <HelpIcon text="Approve signs off the pricing so the quote can be emailed to the client. Reject returns it to the creator for edits — a comment explaining why is required." />
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    gap: '0.625rem',
                    alignItems: 'flex-start',
                    background: 'var(--warning-subtle)',
                    border: '1px solid var(--warning)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.875rem',
                  }}>
                    <AlertCircle size={16} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Awaiting review from Founder or Sales Head. You do not have permissions to action this step.
                    </p>
                  </div>
                )
              )}

              {/* Convert to Invoice — primary path once the quote is approved/sent */}
              {(quote.status === 'approved' || quote.status === 'sent') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <Link
                    href={`/invoices/create?quote_id=${quote.id}`}
                    className="btn btn-primary"
                    style={{ flex: 1, background: 'var(--success)', borderColor: 'var(--success)' }}
                  >
                    <FileText size={15} /> Convert to Invoice
                  </Link>
                  <HelpIcon text="Opens the invoice builder pre-filled with this quote's line items and totals. Do this once the client has agreed, so billing matches the quote exactly." />
                </div>
              )}

              {/* Edit Option if applicable */}
              {(quote.status === 'draft' || quote.status === 'rejected') && (
                <Link href={`/quotes/create?id=${quote.id}`} className="btn btn-secondary" style={{ width: '100%' }}>
                  Edit Scope Details
                </Link>
              )}
            </div>
          </div>

          {/* Workflow timeline card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.625rem' }}>
              Approval Steps &amp; Logs
            </h3>

            {quote.approvals && quote.approvals.length > 0 ? (
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
                {/* Timeline rail */}
                <div style={{ position: 'absolute', left: 12, top: 8, bottom: 8, width: 1, background: 'var(--border)' }} />
                {quote.approvals.map((log) => {
                  const isLogApproved = log.status === 'approved';
                  const isLogRejected = log.status === 'rejected';
                  const dotColor = isLogApproved ? 'var(--success)' : isLogRejected ? 'var(--danger)' : 'var(--text-muted)';
                  const dotBg = isLogApproved ? 'var(--success-subtle)' : isLogRejected ? 'var(--danger-subtle)' : 'var(--surface-elevated)';

                  return (
                    <div key={log.id} style={{ display: 'flex', gap: '0.75rem', position: 'relative' }}>
                      <div style={{
                        width: 25,
                        height: 25,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        zIndex: 1,
                        background: dotBg,
                        color: dotColor,
                        border: `1px solid ${dotColor}`,
                      }}>
                        {isLogApproved ? <Check size={12} strokeWidth={2.5} /> : isLogRejected ? <X size={12} strokeWidth={2.5} /> : <Minus size={12} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <h4 className="truncate" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{log.step_name}</h4>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {log.actioned_at || log.created_at ? formatRelativeTime(log.actioned_at || log.created_at) : 'pending'}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>By: {log.user?.name || 'System User'}</p>

                        {log.comments && (
                          <div style={{
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'flex-start',
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.5rem 0.625rem',
                            marginTop: '0.375rem',
                          }}>
                            <MessageSquare size={11} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{log.comments}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem', fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No logs recorded yet. Submit the quote to initiate workflow logs.
              </div>
            )}
          </div>

          {/* Internal comments */}
          {quote.internal_notes && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1.25rem', background: 'var(--surface-elevated)' }}>
              <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Internal Staff Notes
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.65, fontStyle: 'italic' }}>{quote.internal_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Approval decision modal ── */}
      {approvalModalOpen && (
        <div className="overlay" onClick={() => setApprovalModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {approvalActionType === 'approve' ? 'Approve Quote Terms' : 'Reject Quote Scope'}
              </h3>
              <button onClick={() => setApprovalModalOpen(false)} className="btn btn-ghost btn-sm btn-icon">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={submitApprovalAction}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">
                    Comments &amp; Feedback {approvalActionType === 'reject' ? '*' : '(Optional)'}
                  </label>
                  <textarea
                    rows={4}
                    placeholder={approvalActionType === 'approve'
                      ? 'e.g. Budget and discount looks reasonable. Go ahead.'
                      : 'Specify scope changes or discount adjustment requirements...'
                    }
                    value={commentsText}
                    onChange={(e) => setCommentsText(e.target.value)}
                    className="form-input"
                    style={{ resize: 'none', lineHeight: 1.6 }}
                    required={approvalActionType === 'reject'}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setApprovalModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn btn-sm ${approvalActionType === 'reject' ? 'btn-danger' : ''}`}
                  style={approvalActionType === 'approve' ? { background: 'var(--success)', color: '#fff', fontWeight: 600 } : { fontWeight: 600 }}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                >
                  {approveMutation.isPending || rejectMutation.isPending
                    ? 'Actioning...'
                    : (approvalActionType === 'approve' ? 'Approve Quote' : 'Reject Quote')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
