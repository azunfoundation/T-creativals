'use client';

import { useState, useEffect } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useModal } from '@/providers/ModalProvider';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { invoices as invoicesApi, payments as paymentsApi, getApiErrorMessage } from '@/lib/api';
import type { Invoice, Payment } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { 
  Plus, Search, Receipt, ChevronLeft, ChevronRight, Eye, 
  Calendar, DollarSign, Check, X, Banknote, LayoutGrid, 
  List, Trash2, ArrowUpRight, ArrowDownLeft, CreditCard, Clock, AlertTriangle,
  Download, Filter, MoreVertical, FileText, TrendingUp, ChevronDown, ArrowRight
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { StatusBadge } from '@/components/ui/StatusBadge';

const INVOICES_HOWTO = {
  overview: 'An invoice is the official bill you send a client for agreed work or services. This page lists every invoice, shows how much has been collected, and lets you record payments as money comes in.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Click "Create Invoice" (top right) to build a new bill for a client.',
        'Every invoice moves through statuses: Draft → Pending Review → Pending Approval → Approved → Sent. Once money comes in it becomes Partially Paid, then Paid. If the due date passes unpaid, it shows Overdue.',
        'Use the search box to find an invoice by number, client name, or title, and the status dropdown to narrow the list.',
        'Switch to the "Collection Log History" tab to see every payment ever recorded, newest first.',
      ],
    },
    {
      heading: 'Recording payments',
      items: [
        'When a client pays, click "Record" on their invoice row and enter the amount, date, and payment method.',
        'You can record part of the amount — the invoice shows "Partially Paid" until the Balance Due reaches zero.',
        'A payment can never be larger than the invoice\'s outstanding balance.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Record payments the same day they arrive so the Outstanding and Overdue cards stay accurate.',
        'Always add the bank/UPI transaction reference when recording — it makes reconciliation much easier later.',
        'Check the Overdue Receivables card regularly and follow up with those clients.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Deleting an invoice instead of cancelling or voiding it — deletion removes the record permanently.',
        'Leaving invoices in Draft — a draft has not been reviewed or sent, so the client does not know they owe anything.',
        'Recording a payment against the wrong invoice — double-check the invoice number shown in the drawer header before submitting.',
      ],
    },
  ],
};

// The API may return currency as a string ('INR') or as an object {id, code, symbol, name}
function resolveCurrencyCode(currency: any): string {
  if (!currency) return 'INR';
  if (typeof currency === 'string') return currency;
  if (typeof currency === 'object') {
    return currency.code ?? currency.currency_code ?? currency.symbol ?? 'INR';
  }
  return 'INR';
}

const INVOICE_STATUSES: Array<{ value: Invoice['status']; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'void', label: 'Void' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function InvoicesDashboard() {
  const { confirm, prompt } = useModal();
  const queryClient = useQueryClient();

  // Workspace state & sticky project context
  const { getPagePreference, setPagePreference, isLoaded: workspaceLoaded } = useWorkspace();
  const [isInitialized, setIsInitialized] = useState(false);

  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices');
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Hydrate workspace preferences
  useEffect(() => {
    if (!workspaceLoaded || isInitialized) return;
    const saved = getPagePreference<any>('invoices', null);
    if (saved) {
      if (saved.activeTab) setActiveTab(saved.activeTab);
      if (saved.viewMode) setViewMode(saved.viewMode);
      if (saved.searchQuery != null) setSearchQuery(String(saved.searchQuery));
      if (saved.statusFilter != null) setStatusFilter(String(saved.statusFilter));
    }
    setIsInitialized(true);
  }, [workspaceLoaded, isInitialized, getPagePreference]);

  // Persist workspace preferences
  useEffect(() => {
    if (!isInitialized) return;
    setPagePreference('invoices', {
      activeTab,
      viewMode,
      searchQuery,
      statusFilter,
    });
  }, [
    isInitialized,
    activeTab,
    viewMode,
    searchQuery,
    statusFilter,
    setPagePreference,
  ]);
  
  // Record Payment drawer states
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'card' | 'upi' | 'cash' | 'cheque'>('bank_transfer');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentError, setPaymentError] = useState('');

  const { showToast } = useToast();

  // Fetch Invoices from the real API — source of truth, no localStorage shadow.
  const { data, refetch, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['invoices_dashboard'],
    queryFn: async () => {
      const res = await invoicesApi.list({ per_page: 200 });
      const apiInvoices = res.data?.data || [];

      const paymentsList: Payment[] = [];
      apiInvoices.forEach(inv => {
        if (inv.payments) {
          inv.payments.forEach(p => {
            paymentsList.push({ ...p, invoice: inv });
          });
        }
      });
      paymentsList.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());

      return { invoices: apiInvoices, payments: paymentsList };
    },
  });

  const allInvoices = data?.invoices || [];
  const allPayments = data?.payments || [];

  // Filtered invoices
  const filteredInvoices = allInvoices.filter((inv) => {
    const clientName = inv.client?.name || '';
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.title.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate Metrics
  const totalInvoiced = allInvoices
    .filter(inv => inv.status !== 'cancelled' && inv.status !== 'void')
    .reduce((sum, inv) => sum + inv.total_amount, 0);

  const totalCollected = allInvoices
    .filter(inv => inv.status !== 'cancelled' && inv.status !== 'void')
    .reduce((sum, inv) => sum + inv.paid_amount, 0);

  const totalOutstanding = allInvoices
    .filter(inv => inv.status !== 'cancelled' && inv.status !== 'void' && inv.status !== 'paid')
    .reduce((sum, inv) => sum + inv.due_amount, 0);

  const totalOverdue = allInvoices
    .filter(inv => inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.due_amount, 0);

  // Trigger Record Payment
  const openPaymentDrawer = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(invoice.due_amount);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('bank_transfer');
    setPaymentRef('');
    setPaymentNotes('');
    setPaymentError('');
    setPaymentDrawerOpen(true);
  };

  const closePaymentDrawer = () => {
    setPaymentDrawerOpen(false);
    setSelectedInvoice(null);
  };

  const recordPaymentMutation = useMutation({
    mutationFn: (vars: { invoiceId: number; data: any }) => paymentsApi.create(vars.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices_dashboard'] });
      closePaymentDrawer();
    },
    onError: (err: any) => {
      setPaymentError(getApiErrorMessage(err, 'Failed to record payment.'));
    }
  });

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    if (paymentAmount <= 0) {
      setPaymentError('Payment amount must be greater than zero.');
      return;
    }

    if (paymentAmount > selectedInvoice.due_amount) {
      setPaymentError(`Payment amount cannot exceed outstanding balance of ${formatCurrency(selectedInvoice.due_amount, selectedInvoice.currency)}`);
      return;
    }

    recordPaymentMutation.mutate({
      invoiceId: selectedInvoice.id,
      data: {
        invoice_id: selectedInvoice.id,
        amount: Number(paymentAmount),
        payment_method: paymentMethod,
        transaction_reference: paymentRef || undefined,
        payment_date: paymentDate,
        notes: paymentNotes || undefined,
      }
    });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => invoicesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices_dashboard'] });
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to delete invoice.'), 'error');
    }
  });

  const handleDeleteInvoice = async (id: number) => {
    if (await confirm({ message: 'Are you sure you want to delete this invoice?', variant: 'danger' })) {
      deleteMutation.mutate(id);
    }
  };

  // Status badges come from the shared map (components/ui/StatusBadge).
  const getStatusBadge = (status: Invoice['status']) => <StatusBadge kind="invoice" status={status} />;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ── Top Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Receipt className="text-accent" size={24} />
            Invoices & Billing
            <HelpIcon title="Invoices" content={{
              what: 'An invoice is the official bill you send a client for agreed work. This page lists all invoices and the payments recorded against them.',
              why: 'It is the single place to see what has been billed, what has been collected, and which clients still owe money.',
              when: 'Create an invoice once work or a milestone is agreed — usually by converting an approved quote. Record a payment here whenever a client pays.',
            }} />
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Issue client invoices, track collection schedules, record transactions, and analyze aging receivables.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <HowToUseGuide moduleKey="invoices" title="How to Use" content={INVOICES_HOWTO} />
          <Link href="/invoices/create" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> Create Invoice
          </Link>
        </div>
      </div>

      {/* ── Stats Summary Cards ── */}
      <div className="kpi-grid kpi-grid-4">
        <div className="kpi-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="kpi-label" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                TOTAL INVOICED
              </span>
              <span className="kpi-value" style={{ display: 'block', marginTop: '0.25rem', marginBottom: '0.25rem' }}>{formatCurrency(totalInvoiced)}</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{allInvoices.filter(i => !['void', 'cancelled'].includes(i.status)).length}</span> Active Invoices
              </div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '50%', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex' }}>
              <FileText size={20} />
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              View schedules <ArrowRight size={12} />
            </button>
          </div>
        </div>

        <div className="kpi-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="kpi-label" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                PAYMENTS COLLECTED
              </span>
              <span className="kpi-value" style={{ display: 'block', marginTop: '0.25rem', marginBottom: '0.25rem' }}>{formatCurrency(totalCollected)}</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Collection Rate: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0}%</span>
              </div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '50%', background: 'var(--success-subtle)', color: 'var(--success)', display: 'flex' }}>
              <Banknote size={20} />
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              View payments <ArrowRight size={12} />
            </button>
          </div>
        </div>

        <div className="kpi-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="kpi-label" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                OUTSTANDING BALANCE
              </span>
              <span className="kpi-value" style={{ display: 'block', marginTop: '0.25rem', marginBottom: '0.25rem' }}>{formatCurrency(totalOutstanding)}</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Pending user logs & collections
              </div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '50%', background: 'var(--warning-subtle)', color: 'var(--warning)', display: 'flex' }}>
              <ArrowUpRight size={20} />
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{ color: 'var(--warning)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              View outstanding <ArrowRight size={12} />
            </button>
          </div>
        </div>

        <div className="kpi-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="kpi-label" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                OVERDUE RECEIVABLES
              </span>
              <span className="kpi-value text-danger" style={{ display: 'block', marginTop: '0.25rem', marginBottom: '0.25rem' }}>{formatCurrency(totalOverdue)}</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Needs follow up action
              </div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '50%', background: 'var(--danger-subtle)', color: 'var(--danger)', display: 'flex' }}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              View overdue <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs Navigation & Filters ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', paddingTop: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <button
            onClick={() => setActiveTab('invoices')}
            style={{
              paddingBottom: '0.75rem',
              marginBottom: '-0.75rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              borderBottom: '2px solid',
              borderColor: activeTab === 'invoices' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'invoices' ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'all var(--transition-fast)'
            }}
          >
            Invoices List
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            style={{
              paddingBottom: '0.75rem',
              marginBottom: '-0.75rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              borderBottom: '2px solid',
              borderColor: activeTab === 'payments' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'payments' ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'all var(--transition-fast)'
            }}
          >
            Collection Log History
          </button>
        </div>

        {activeTab === 'invoices' && (
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button onClick={() => setViewMode('table')} className={`btn btn-icon ${viewMode === 'table' ? 'btn-secondary' : 'btn-ghost'}`} style={{ color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              <List size={18} />
            </button>
            <button onClick={() => setViewMode('board')} className={`btn btn-icon ${viewMode === 'board' ? 'btn-secondary' : 'btn-ghost'}`} style={{ color: viewMode === 'board' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              <LayoutGrid size={18} />
            </button>
          </div>
        )}
      </div>

      {activeTab === 'invoices' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Filters Row */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by invoice #, client, or title..."
                value={searchQuery ?? ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem', borderRadius: '9999px', fontSize: '0.875rem', backgroundColor: 'var(--surface-elevated)' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.25rem 0.75rem', backgroundColor: 'var(--surface)', gap: '0.5rem', cursor: 'pointer', height: '36px' }}>
                <Calendar size={14} className="text-muted" />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>All Time</span>
                <ChevronDown size={14} className="text-muted" style={{ marginLeft: '0.25rem' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.125rem 0.5rem', backgroundColor: 'var(--surface)', height: '36px' }}>
                <select
                  value={statusFilter ?? ''}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.875rem', fontWeight: 500, padding: '0.25rem', width: '130px', cursor: 'pointer', appearance: 'none' }}
                >
                  <option value="all">All Invoices</option>
                  {INVOICE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="text-muted" />
              </div>

              <button className="btn btn-secondary btn-icon" style={{ borderRadius: 'var(--radius-md)', height: '36px', width: '36px' }}>
                <Filter size={16} />
              </button>
            </div>
          </div>

          {/* Table View */}
          {viewMode === 'table' && (
            isLoadingInvoices ? (
              <div className="data-table-wrap">
                <SkeletonTable rows={5} cols={6} />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <EmptyState
                title="No invoices found"
                description="Try adjusting filters or search query, or create a brand new billing layout."
                action={
                  <Link href="/invoices/create" className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
                    Create First Invoice
                  </Link>
                }
              />
            ) : (
              <div className="data-table-wrap" style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: 'var(--surface-elevated)', borderBottom: '1px solid var(--border)' }}>
                      <tr>
                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Invoice #</th>
                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Client Name</th>
                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Invoice Title</th>
                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Amount</th>
                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                          Balance Due <HelpIcon text="Total amount minus payments recorded so far. Shows '— Paid' when nothing is owed." />
                        </th>
                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Due Date</th>
                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((inv) => {
                        const isOverdue = inv.status === 'overdue' || (inv.due_amount > 0 && new Date(inv.due_date) < new Date());
                        const isPaid = inv.status === 'paid' || inv.due_amount <= 0;
                        const statusColor = isPaid ? 'var(--success)' : isOverdue ? 'var(--danger)' : inv.status === 'sent' ? 'var(--accent)' : 'var(--info)';
                        const subtitle = inv.items?.[0]?.service?.name || inv.items?.[0]?.description || 'Services';
                        
                        return (
                          <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface)', transition: 'background 0.2s', position: 'relative' }}>
                            <td style={{ padding: '1rem', position: 'relative' }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', backgroundColor: statusColor }}></div>
                              <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600 }}>
                                {inv.invoice_number}
                              </span>
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{inv.client?.name || 'N/A'}</div>
                              {inv.client?.email && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{inv.client.email}</div>}
                            </td>
                            <td style={{ padding: '1rem', maxWidth: '240px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.title}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
                            </td>
                            <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                              {formatCurrency(inv.total_amount, inv.currency)}
                            </td>
                            <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>
                              {isPaid ? (
                                <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>— Paid</span>
                              ) : (
                                <span style={{ color: 'var(--warning)' }}>{formatCurrency(inv.due_amount, inv.currency)}</span>
                              )}
                            </td>
                            <td style={{ padding: '1rem', fontSize: '0.8125rem', color: isOverdue ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: isOverdue ? 600 : 400 }}>
                              {formatDate(inv.due_date)}
                            </td>
                            <td style={{ padding: '1rem' }}>
                              {getStatusBadge(inv.status)}
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                                <Link
                                  href={`/invoices/${inv.id}`}
                                  className="btn btn-ghost btn-sm btn-icon"
                                  title="View Details"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  <Eye size={16} />
                                </Link>
                                {!isPaid && inv.status !== 'cancelled' && inv.status !== 'void' ? (
                                  <button
                                    onClick={() => openPaymentDrawer(inv)}
                                    className="btn btn-primary btn-sm"
                                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600 }}
                                  >
                                    Record
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-ghost btn-sm btn-icon"
                                    title="Download Invoice"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    <Download size={16} />
                                  </button>
                                )}
                                <button
                                  className="btn btn-ghost btn-sm btn-icon"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  <MoreVertical size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* Board View */}
          {viewMode === 'board' && (
            <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
              {INVOICE_STATUSES.map((col) => {
                const columnInvoices = filteredInvoices.filter(inv => inv.status === col.value);
                return (
                  <div key={col.value} className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: '220px', maxHeight: '70vh', padding: '1rem', gap: '0.75rem' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase' }}>{col.label}</span>
                      <span style={{ fontSize: '0.6875rem', background: 'var(--surface-elevated)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '9999px', fontWeight: 700 }}>
                        {columnInvoices.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', minHeight: '150px' }}>
                      {columnInvoices.length === 0 ? (
                        <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Empty Column
                        </div>
                      ) : (
                        columnInvoices.map((inv) => {
                          const completionRate = inv.total_amount > 0 ? (inv.paid_amount / inv.total_amount) * 100 : 0;
                          return (
                            <div 
                              key={inv.id}
                              className="card"
                              style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem', cursor: 'pointer', position: 'relative' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.6875rem', color: 'var(--accent)', fontWeight: 700 }}>{inv.invoice_number}</span>
                                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{formatDate(inv.due_date)}</span>
                              </div>
                              
                              <div>
                                <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.client?.name || 'N/A'}</h4>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{inv.title}</p>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem', paddingTop: '4px' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(inv.total_amount, inv.currency)}</span>
                                {inv.due_amount > 0 ? (
                                  <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{formatCurrency(inv.due_amount, inv.currency)} due</span>
                                ) : (
                                  <span style={{ color: 'var(--success)', fontWeight: 700 }}>Paid</span>
                                )}
                              </div>

                              {/* Progress bar */}
                              <div style={{ width: '100%', backgroundColor: 'var(--border-subtle)', height: '4px', borderRadius: '9999px', overflow: 'hidden' }}>
                                <div 
                                  style={{ backgroundColor: 'var(--success)', height: '100%', width: `${Math.min(100, completionRate)}%`, transition: 'width var(--transition-base)' }}
                                />
                              </div>

                              {/* Hover actions */}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.375rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                                <Link 
                                  href={`/invoices/${inv.id}`}
                                  className="btn btn-ghost btn-sm btn-icon"
                                  title="View Details"
                                >
                                  <Eye size={12} />
                                </Link>
                                {inv.due_amount > 0 && inv.status !== 'cancelled' && inv.status !== 'void' && (
                                  <button
                                    onClick={() => openPaymentDrawer(inv)}
                                    className="btn btn-primary btn-sm"
                                    style={{ padding: '0.125rem 0.5rem', fontSize: '0.6875rem' }}
                                  >
                                    Pay
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Stats Footer */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--surface)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flex: 1, minWidth: '180px' }}>
              <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--danger-subtle)', color: 'var(--danger)', display: 'flex' }}>
                <Calendar size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{allInvoices.filter(i => i.status === 'overdue' || (i.due_amount > 0 && new Date(i.due_date) < new Date())).length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Overdue Invoices</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--surface)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flex: 1, minWidth: '180px' }}>
              <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--warning-subtle)', color: 'var(--warning)', display: 'flex' }}>
                <Clock size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{allInvoices.filter(i => i.due_amount > 0 && new Date(i.due_date) > new Date() && new Date(i.due_date).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000).length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Due This Week</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--surface)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flex: 1, minWidth: '180px' }}>
              <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex' }}>
                <Receipt size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{allInvoices.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Total Invoices</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--surface)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flex: 1, minWidth: '180px' }}>
              <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--danger-subtle)', color: 'var(--danger)', display: 'flex' }}>
                <FileText size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{formatCurrency(totalOutstanding)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Total Outstanding</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--surface)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flex: 1, minWidth: '180px' }}>
              <div style={{ padding: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--success-subtle)', color: 'var(--success)', display: 'flex' }}>
                <TrendingUp size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{formatCurrency(totalCollected)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Collected This Month</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Payments Log ── */}
      {activeTab === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CreditCard className="text-accent" size={18} />
              Recent Collection Log Transactions
            </h2>
          </div>

          {allPayments.length === 0 ? (
            <div className="empty-state">
              <CreditCard size={48} className="empty-state-icon" />
              <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>No recorded payments</p>
              <p style={{ fontSize: '0.875rem' }}>
                Any transactions logged through the "Record Payment" drawer will appear here in chronological order.
              </p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Payment Receipt</th>
                      <th>Invoice #</th>
                      <th>Client</th>
                      <th>Payment Method</th>
                      <th>Txn Reference</th>
                      <th>Paid Date</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPayments.map((pay) => (
                      <tr key={pay.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                          {pay.payment_number}
                        </td>
                        <td>
                          {pay.invoice ? (
                            <Link href={`/invoices/${pay.invoice_id}`} style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                              {pay.invoice.invoice_number}
                            </Link>
                          ) : (
                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Invoice #{pay.invoice_id}</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{pay.invoice?.client?.name || 'N/A'}</span>
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                          {pay.payment_method.replace('_', ' ')}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {pay.transaction_reference || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>— None</span>}
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                          {formatDate(pay.payment_date)}
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--success)' }}>
                          {formatCurrency(pay.amount, pay.invoice?.currency || 'INR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Record Payment Drawer (Sliding Overlay) ── */}
      {paymentDrawerOpen && selectedInvoice && (
        <>
          {/* Backdrop */}
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 50, transition: 'opacity var(--transition-base)' }}
            onClick={closePaymentDrawer}
          />
          {/* Drawer content */}
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '420px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', animation: 'slideInRight var(--transition-slow)' }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-elevated)' }}>
              <div>
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 600 }}>Record Client Payment</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Log collection transaction for <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{selectedInvoice.invoice_number}</span>
                </p>
              </div>
              <button 
                onClick={closePaymentDrawer}
                className="btn btn-icon btn-secondary"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleRecordPayment} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {paymentError && (
                <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', gap: '0.5rem' }}>
                  <AlertTriangle style={{ width: '1rem', height: '1rem', flexShrink: 0 }} />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.75rem', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Billing</span>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(selectedInvoice.total_amount, selectedInvoice.currency)}</p>
                </div>
                <div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Outstanding</span>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--warning)' }}>{formatCurrency(selectedInvoice.due_amount, selectedInvoice.currency)}</p>
                </div>
              </div>

              {/* Amount Input */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Amount to Record ({resolveCurrencyCode(selectedInvoice.currency)})
                  <HelpIcon text="You can record a partial amount — the invoice stays 'Partially Paid' until the full balance is cleared. It cannot exceed the Outstanding figure above." />
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600 }}>
                    {resolveCurrencyCode(selectedInvoice.currency)}
                  </div>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    max={selectedInvoice.due_amount}
                    value={paymentAmount || ''}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    className="form-input"
                    style={{ paddingLeft: '3.5rem' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentAmount(selectedInvoice.due_amount)}
                  style={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, alignSelf: 'flex-start', marginTop: '2px', cursor: 'pointer' }}
                >
                  Pay outstanding balance
                </button>
              </div>

              {/* Payment Date */}
              <div className="form-group">
                <label className="form-label">Payment Date</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="form-input"
                />
              </div>

              {/* Payment Method */}
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="form-input"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="upi">UPI / Net Banking</option>
                  <option value="card">Credit/Debit Card</option>
                  <option value="cash">Cash Payment</option>
                  <option value="cheque">Cheque Payment</option>
                </select>
              </div>

              {/* Reference */}
              <div className="form-group">
                <label className="form-label">Transaction Reference # (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. UTR / URN number, Cheque #, Txn ID"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="form-input"
                />
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">Internal Notes / Description (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="Memo of transaction, received-by information, bank clearance detail"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="form-input"
                  style={{ resize: 'none' }}
                />
              </div>

              <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: 'auto' }}>
                <button
                  type="button"
                  onClick={closePaymentDrawer}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Submit Payment
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
