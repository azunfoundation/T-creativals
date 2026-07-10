'use client';

import { useState } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { quotes as quotesApi } from '@/lib/api';
import type { Quote } from '@/lib/api';
import { Plus, Search, FileText, ChevronLeft, ChevronRight, Eye, Calendar, DollarSign, Check, X, ShieldAlert, Edit2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const QUOTES_HOWTO = {
  overview: 'A Quote is a priced proposal you send to a lead or client before any work starts — it lists the services, quantities, discounts, and taxes, and adds up to the amount you are asking them to approve. Once a client says yes, the quote becomes the basis for an invoice and, later, a project.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Click "Create Quote" to open the quote builder and save your proposal as a Draft.',
        'A Draft must go through internal review: open it and click "Submit for Approval" so a Founder or Sales Head can approve the pricing.',
        'Once Approved, email the quote to the client from its detail page, then convert it to an invoice when they accept.',
        'Use the search box (quote #, client, or title) and the status dropdown to find a specific quote in the list.',
      ],
    },
    {
      heading: 'Status lifecycle',
      items: [
        'Draft — still being written; only Draft and Rejected quotes can be edited.',
        'Pending Approval — waiting for a Founder or Sales Head to sign off internally.',
        'Approved / Sent — pricing signed off; Sent means it has been emailed to the client.',
        'Accepted / Rejected — the client agreed, or an approver sent it back with comments for rework.',
        'Expired / Converted — the "Valid Until" date passed, or the quote was turned into an invoice.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Set a realistic "Valid Until" date — quotes past that date show as Expired and should be re-issued, not resent.',
        'Keep quote titles descriptive (e.g. "Website Redesign & SEO Campaign") so they are easy to find later.',
        'Convert an accepted quote to an invoice promptly so billing matches what the client agreed to.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Emailing a quote to the client before it has been approved internally.',
        'Editing prices verbally with the client but never updating the quote — the invoice is built from the quote, so keep it accurate.',
        'Letting quotes sit until they expire instead of following up while they are still valid.',
      ],
    },
  ],
};

// ── Fallback Mock Data ──────────────────────────────────────────
const MOCK_QUOTES: Quote[] = [
  {
    id: 1,
    quote_number: 'QT-2026-0001',
    lead_id: 1,
    lead: { id: 1, company_name: 'Apex Designs', budget: 100000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '', updated_at: '' },
    title: 'Website Redesign & SEO Campaign',
    currency: 'INR',
    valid_until: '2026-07-15',
    status: 'pending_approval',
    subtotal: 180000,
    discount_amount: 15000,
    tax_amount: 29700,
    total_amount: 194700,
    items: [],
    created_at: '2026-06-10',
    updated_at: '2026-06-10',
  },
  {
    id: 2,
    quote_number: 'QT-2026-0002',
    lead_id: 2,
    lead: { id: 2, company_name: 'NovaTech Corp', budget: 500000, priority: 'high', temperature: 'hot', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '', updated_at: '' },
    title: 'Mobile App Custom Development',
    currency: 'INR',
    valid_until: '2026-06-30',
    status: 'approved',
    subtotal: 300000,
    discount_amount: 0,
    tax_amount: 54000,
    total_amount: 354000,
    items: [],
    created_at: '2026-06-08',
    updated_at: '2026-06-09',
  },
  {
    id: 3,
    quote_number: 'QT-2026-0003',
    lead_id: 3,
    lead: { id: 3, company_name: 'GreenLife Retail', budget: 80000, priority: 'low', temperature: 'cold', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '', updated_at: '' },
    title: 'Brand Identity Collateral Pack',
    currency: 'INR',
    valid_until: '2026-05-20',
    status: 'expired',
    subtotal: 90000,
    discount_amount: 10000,
    tax_amount: 14400,
    total_amount: 94400,
    items: [],
    created_at: '2026-05-01',
    updated_at: '2026-05-01',
  },
  {
    id: 4,
    quote_number: 'QT-2026-0004',
    lead_id: 4,
    lead: { id: 4, company_name: 'EduPath Learning', budget: 120000, priority: 'medium', temperature: 'warm', contacts: [], activities: [], stage_id: 1, source_id: 1, created_at: '', updated_at: '' },
    title: 'Digital Marketing & Content Copywriting',
    currency: 'INR',
    valid_until: '2026-07-10',
    status: 'draft',
    subtotal: 110000,
    discount_amount: 5000,
    tax_amount: 18900,
    total_amount: 123900,
    items: [],
    created_at: '2026-06-11',
    updated_at: '2026-06-11',
  }
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All Quotes' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'converted', label: 'Converted' },
];

export default function QuotesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Quotes
  const { data, isLoading } = useQuery({
    queryKey: ['quotes', page, statusFilter, searchQuery],
    queryFn: async () => {
      try {
        const res = await quotesApi.list({
          page,
          per_page: 10,
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: searchQuery || undefined,
        });
        return res.data;
      } catch {
        // Fallback filter
        let filtered = [...MOCK_QUOTES];
        if (statusFilter !== 'all') {
          filtered = filtered.filter(q => q.status === statusFilter);
        }
        if (searchQuery) {
          filtered = filtered.filter(q =>
            q.quote_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            q.lead?.company_name.toLowerCase().includes(searchQuery.toLowerCase())
          );
        }
        return {
          data: filtered,
          meta: { current_page: 1, last_page: 1, per_page: 10, total: filtered.length }
        };
      }
    }
  });

  const quotesList = data?.data || [];
  const meta = data?.meta || { current_page: 1, last_page: 1, per_page: 10, total: 0 };

  // Helper: Status badge colors
  const getStatusBadge = (status: Quote['status']) => {
    const badges: Record<Quote['status'], { label: string; className: string }> = {
      draft: { label: 'Draft', className: 'badge-muted' },
      pending_approval: { label: 'Pending Approval', className: 'badge-warning' },
      approved: { label: 'Approved', className: 'badge-success' },
      sent: { label: 'Sent', className: 'badge-info' },
      accepted: { label: 'Accepted', className: 'badge-accent' },
      rejected: { label: 'Rejected', className: 'badge-danger' },
      expired: { label: 'Expired', className: 'badge-muted' },
      converted: { label: 'Converted', className: 'badge-success' },
    };

    const config = badges[status] || { label: status, className: 'badge-muted' };

    return (
      <span className={`badge ${config.className}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText className="text-accent" size={24} />
            Quotations
            <HelpIcon title="Quotations" content={{
              what: 'A quote is a priced proposal listing services, discounts, and taxes that you send to a lead or client for approval.',
              why: 'It locks in scope and pricing in writing before work begins, and becomes the basis for the invoice once the client accepts.',
              when: 'Create one whenever a lead or client asks for pricing — get it approved internally, email it, then convert it to an invoice on acceptance.',
            }} />
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Create, build, track approvals, and manage client-facing product and pricing estimates.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <HowToUseGuide moduleKey="quotes" title="How Quotes Work" content={QUOTES_HOWTO} />
          <Link href="/quotes/create" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> Create Quote
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by quote #, client, or title..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="form-input"
            style={{ paddingLeft: '2.25rem', width: '100%' }}
          />
        </div>

        {/* Status Selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <HelpIcon text="Filter by where the quote is in its lifecycle: Draft → Pending Approval → Approved → Sent → Accepted/Rejected. Expired means its validity date passed; Converted means it became an invoice." />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="form-input"
            style={{ width: '180px' }}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Data Table */}
      {isLoading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      ) : quotesList.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} className="empty-state-icon" />
          <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>No quotes found</p>
          <p style={{ fontSize: '0.875rem' }}>
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search criteria or filters to see results.'
              : 'Create your first proposal layout and draft it directly inside our quotation builder.'}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <Link href="/quotes/create" className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
               Draft Quote Now
            </Link>
          )}
        </div>
      ) : (
        <div className="data-table-wrap">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quote Number</th>
                  <th>Lead / Client Name</th>
                  <th>Quote Title</th>
                  <th>Total Amount (INR) <HelpIcon text="Final amount the client is asked to approve: line items minus discounts, plus GST, minus any coupon." /></th>
                  <th>Valid Until <HelpIcon text="The quote's expiry date. After this date it shows as Expired and should be re-issued rather than sent again." /></th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotesList.map((quote) => (
                  <tr key={quote.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                      {quote.quote_number}
                    </td>
                    <td>
                      {quote.lead ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{quote.lead.company_name}</span>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                            Lead #{quote.lead.id}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No Lead Assigned</span>
                      )}
                    </td>
                    <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {quote.title}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatCurrency(quote.total_amount, quote.currency)}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {formatDate(quote.valid_until)}
                    </td>
                    <td>
                      {getStatusBadge(quote.status)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.375rem' }}>
                        <Link
                          id={`view-quote-${quote.id}`}
                          href={`/quotes/${quote.id}`}
                          className="btn btn-ghost btn-sm btn-icon"
                          title="View Details"
                        >
                          <Eye size={14} />
                        </Link>
                        {(quote.status === 'draft' || quote.status === 'rejected') && (
                          <Link
                            id={`edit-quote-${quote.id}`}
                            href={`/quotes/create?id=${quote.id}`}
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Edit Quote"
                          >
                            <Edit2 size={14} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && meta.last_page > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '1rem',
          padding: '0 0.25rem'
        }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Showing page <strong style={{ color: 'var(--text-primary)' }}>{meta.current_page}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{meta.last_page}</strong>
          </span>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-secondary btn-sm"
            >
              <ChevronLeft size={14} />
            </button>
            {[...Array(meta.last_page)].map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className="btn btn-sm"
                style={{
                  background: meta.current_page === i + 1 ? 'var(--accent)' : 'var(--surface-elevated)',
                  color: meta.current_page === i + 1 ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
              disabled={page === meta.last_page}
              className="btn btn-secondary btn-sm"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

