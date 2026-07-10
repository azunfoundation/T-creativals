'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useModal } from '@/providers/ModalProvider';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/auth';
import { expenses as expensesApi, getApiErrorMessage } from '@/lib/api';
import type { Expense, ExpenseTimelineEntry } from '@/lib/api';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import {
  ArrowLeft, Printer, FileText, Edit2, Trash2, CheckCircle, XCircle,
  Copy, Download, Loader2, AlertCircle, Send, Banknote, Clock,
  Paperclip, ExternalLink, Building2, CreditCard, User as UserIcon
} from 'lucide-react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const EXPENSE_DETAIL_HOWTO = {
  overview: 'This voucher shows one expense end-to-end: what was spent, who submitted it, and where it stands in the approval workflow.',
  sections: [
    {
      heading: 'Taking action',
      items: [
        'Submit for Approval sends a Draft (or a fixed-up Rejected expense) to its approver.',
        'Approve/Reject are only shown to the expense\'s actual approver — the project\'s manager for project-linked expenses, or Finance/Director/Founder for overhead.',
        'Mark as Reimbursed records that the payout actually happened, after approval.',
      ],
    },
    {
      heading: 'Other actions',
      items: [
        'Duplicate creates a fresh draft copy — handy for a recurring cost like a monthly subscription.',
        'Print or Download PDF produce the same signed voucher layout.',
      ],
    },
  ],
};

interface Params {
  id: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  card: 'Credit/Debit Card',
  upi: 'UPI / Net Banking',
  cash: 'Cash Payment',
  cheque: 'Cheque Payment',
};

function getStatusBadge(status: Expense['status']): string {
  if (status === 'reimbursed') return 'badge-success';
  if (status === 'approved') return 'badge-info';
  if (status === 'submitted') return 'badge-warning';
  if (status === 'rejected') return 'badge-danger';
  return 'badge-muted';
}

function formatDateTime(date?: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
}

function describeTimelineEntry(log: ExpenseTimelineEntry): { title: string; color: string; detail?: string } {
  if (log.event === 'created') {
    return { title: 'Expense Logged', color: 'var(--text-muted)' };
  }
  if (log.event === 'deleted') {
    return { title: 'Expense Deleted', color: 'var(--danger)' };
  }
  if (log.event === 'restored') {
    return { title: 'Expense Restored', color: 'var(--info, var(--accent))' };
  }
  if (log.event === 'updated') {
    const newStatus = log.new_values?.status;
    if (newStatus === 'submitted') return { title: 'Submitted for Approval', color: 'var(--warning)' };
    if (newStatus === 'approved') return { title: 'Expense Approved', color: 'var(--success)' };
    if (newStatus === 'rejected') {
      return { title: 'Expense Rejected', color: 'var(--danger)', detail: log.new_values?.rejection_reason || undefined };
    }
    if (newStatus === 'reimbursed') return { title: 'Reimbursement Paid Out', color: 'var(--success)' };
    const changed = Object.keys(log.new_values || {}).filter(k => k !== 'updated_at');
    return {
      title: 'Details Updated',
      color: 'var(--accent)',
      detail: changed.length ? `Changed: ${changed.map(k => k.replace(/_/g, ' ')).join(', ')}` : undefined,
    };
  }
  return { title: log.event.replace(/_/g, ' '), color: 'var(--text-muted)' };
}

// Cross-origin receipt files may block a blob fetch — fall back to opening in a new tab.
async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function ExpenseDetailPage({ params }: { params: Promise<Params> }) {
  const { confirm, prompt } = useModal();
  const { showToast } = useToast();
  const resolvedParams = use(params);
  const expenseId = Number(resolvedParams.id);

  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuthStore();

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Fetch expense details
  const { data: expense, isLoading } = useQuery<Expense | null>({
    queryKey: ['expense-detail', expenseId],
    queryFn: async () => {
      const res = await expensesApi.getExpense(expenseId);
      const e = res.data as any;
      return {
        ...e,
        amount: parseFloat(e.amount) || 0,
        tax_amount: e.tax_amount != null ? parseFloat(e.tax_amount) || 0 : undefined,
        is_billable: e.is_billable === true || e.is_billable === 1 || String(e.is_billable) === 'true',
      } as Expense;
    },
    retry: false,
  });

  // Fetch audit timeline (non-blocking — page still renders if it fails)
  const { data: timeline = [] } = useQuery<ExpenseTimelineEntry[]>({
    queryKey: ['expense-timeline', expenseId],
    queryFn: async () => {
      try {
        const res = await expensesApi.getExpenseTimeline(expenseId);
        return res.data?.data ?? [];
      } catch {
        return [];
      }
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expense-detail', expenseId] });
    queryClient.invalidateQueries({ queryKey: ['expense-timeline', expenseId] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  const submitMutation = useMutation({
    mutationFn: () => expensesApi.submitExpense(expenseId),
    onSuccess: () => { invalidate(); showToast('Expense submitted for approval.', 'success'); },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to submit expense.'), 'error'),
  });

  const approveMutation = useMutation({
    mutationFn: () => expensesApi.approveExpense(expenseId),
    onSuccess: () => { invalidate(); showToast('Expense approved.', 'success'); },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to approve expense.'), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason?: string) => expensesApi.rejectExpense(expenseId, reason),
    onSuccess: () => { invalidate(); showToast('Expense rejected.', 'success'); },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to reject expense.'), 'error'),
  });

  const reimburseMutation = useMutation({
    mutationFn: () => expensesApi.reimburseExpense(expenseId),
    onSuccess: () => { invalidate(); showToast('Expense marked as reimbursed.', 'success'); },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to mark expense as reimbursed.'), 'error'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="max-w-[1400px] mx-auto p-6 text-center space-y-4">
        <AlertCircle size={48} className="text-red-500 mx-auto" />
        <h2 className="text-xl font-bold text-zinc-200">Expense Not Found</h2>
        <p className="text-sm text-zinc-400">The expense you are looking for does not exist, has been deleted, or you do not have permission to view it.</p>
        <Link href="/expenses" className="btn btn-secondary inline-block">Back to Expenses</Link>
      </div>
    );
  }

  // ── Permission flags (backend Gates are the real enforcement; these just hide dead
  // buttons). Read from the user's real granted permissions — matching ExpensePolicy's
  // `expenses.view_all`/`expenses.approve` checks — rather than guessing by role name,
  // so e.g. a Director sees the same actions the backend will actually authorize.
  const canViewAll = !!user?.permissions?.includes('expenses.view_all');
  const canApproveAny = !!user?.permissions?.includes('expenses.approve');
  const isOwner = expense.submitted_by === user?.id;
  const isProjectManager = !!expense.project && expense.project.manager_id === user?.id;

  const canEdit = canViewAll || (isOwner && (expense.status === 'draft' || expense.status === 'rejected'));
  const canSubmit = (canViewAll || isOwner) && (expense.status === 'draft' || expense.status === 'rejected');
  const canApprove = (canApproveAny || isProjectManager) && expense.status === 'submitted';
  const canReimburse = (canApproveAny || isProjectManager) && expense.status === 'approved';
  const canDelete = canViewAll || (isOwner && expense.status === 'draft');

  const taxAmount = expense.tax_amount ?? 0;
  const totalAmount = expense.amount + taxAmount;
  const currency = expense.currency || 'INR';

  const allFiles: { title: string; url: string }[] = [
    ...(expense.receipt_url ? [{ title: `Receipt - ${expense.expense_number}`, url: expense.receipt_url }] : []),
    ...(expense.attachments || []).map(a => ({ title: a.title, url: a.url })),
  ];

  const handlePrint = () => window.print();

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await expensesApi.downloadExpensePdf(expenseId);
      const url = window.URL.createObjectURL(new Blob([res.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${expense.expense_number || 'expense'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Failed to download PDF.'), 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const res = await expensesApi.createExpense({
        title: `${expense.title} (Copy)`,
        description: expense.description || null,
        category_id: expense.category_id,
        project_id: expense.project_id || null,
        vendor_id: expense.vendor_id || null,
        amount: expense.amount,
        tax_amount: expense.tax_amount ?? null,
        currency_id: expense.currency_id,
        expense_date: new Date().toISOString().split('T')[0],
        receipt_url: expense.receipt_url || null,
        payment_method: expense.payment_method || null,
        is_billable: expense.is_billable,
        notes: expense.notes || null,
        attachments: (expense.attachments || []).map(a => ({ title: a.title, url: a.url, type: a.type || null })),
      });
      const newId = (res.data as any)?.id;
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      showToast('Expense duplicated as a new draft.', 'success');
      if (newId) router.push(`/expenses/${newId}`);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Failed to duplicate expense.'), 'error');
    } finally {
      setDuplicating(false);
    }
  };

  const handleDelete = async () => {
    if (await confirm({ message: 'Are you sure you want to delete this expense? This action cannot be undone.', variant: 'danger' })) {
      try {
        await expensesApi.deleteExpense(expenseId);
        queryClient.invalidateQueries({ queryKey: ['expenses'] });
        showToast('Expense deleted.', 'success');
        router.push('/expenses');
      } catch (err) {
        showToast(getApiErrorMessage(err, 'Failed to delete expense.'), 'error');
      }
    }
  };

  const handleReject = async () => {
    const reason = await prompt({ message: 'Enter the reason for rejecting this expense:' });
    if (reason === null) return;
    rejectMutation.mutate(reason || undefined);
  };

  const handleDownloadAllAttachments = async () => {
    for (const file of allFiles) {
      const ext = file.url.split('.').pop()?.split('?')[0] || 'file';
      await downloadFile(file.url, `${file.title.replace(/[^a-z0-9-_ ]/gi, '')}.${ext}`);
    }
  };

  const detailRows: { label: string; value: React.ReactNode }[] = [
    { label: 'Submitted By', value: expense.submitter?.name || '—' },
    { label: 'Category', value: expense.category?.name || 'Uncategorized' },
    { label: 'Vendor', value: expense.vendor?.name || '—' },
    { label: 'Project', value: expense.project?.name || 'General Overheads' },
    { label: 'Payment Method', value: expense.payment_method ? PAYMENT_METHOD_LABELS[expense.payment_method] || expense.payment_method : '—' },
    { label: 'Currency', value: typeof currency === 'object' ? `${currency.code}${currency.name ? ` — ${currency.name}` : ''}` : currency },
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Print styles: show only the voucher paper */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
            background: transparent !important;
          }
          #printable-expense-paper, #printable-expense-paper * {
            visibility: visible;
          }
          #printable-expense-paper {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: #ffffff !important;
            color: #111827 !important;
            box-shadow: none !important;
            border: none !important;
            padding: 24px !important;
            margin: 0 !important;
          }
          #printable-expense-paper h4 {
            color: #000000 !important;
          }
        }
      `}</style>

      {/* Header controls (Hidden on print) */}
      <div className="print:hidden" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link href="/expenses" className="btn btn-secondary btn-icon" style={{ padding: '0.5rem' }}>
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              Expense Details: <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{expense.expense_number}</span>
              <span className={`badge ${getStatusBadge(expense.status)}`} style={{ textTransform: 'uppercase' }}>{expense.status}</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{expense.title}</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <HowToUseGuide moduleKey="expense_detail" title="How This Expense Page Works" content={EXPENSE_DETAIL_HOWTO} />

          {canEdit && (
            <Link href={`/expenses?edit=${expense.id}`} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Edit2 size={14} /> Edit
            </Link>
          )}

          {canSubmit && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            >
              {submitMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {expense.status === 'rejected' ? 'Resubmit for Approval' : 'Submit for Approval'}
            </button>
          )}

          {canApprove && (
            <>
              <button
                onClick={async () => { if (await confirm({ message: `Approve expense ${expense.expense_number} for ${formatCurrency(totalAmount, currency)}?` })) approveMutation.mutate(); }}
                disabled={approveMutation.isPending}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: 'var(--success)', borderColor: 'var(--success)' }}
              >
                {approveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Approve
              </button>
              <button
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                className="btn btn-danger"
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
              >
                {rejectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Reject
              </button>
            </>
          )}

          {canReimburse && (
            <button
              onClick={async () => { if (await confirm({ message: `Mark ${formatCurrency(totalAmount, currency)} as reimbursed to ${expense.submitter?.name || 'the submitter'}?` })) reimburseMutation.mutate(); }}
              disabled={reimburseMutation.isPending}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            >
              {reimburseMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
              Mark Reimbursed
            </button>
          )}

          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            {duplicating ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
            Duplicate
          </button>

          <button onClick={handlePrint} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Printer size={14} /> Print
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Download PDF
          </button>

          {canDelete && (
            <button onClick={handleDelete} className="btn btn-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Main Grid Content */}
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* Left Column: Printable Expense Voucher */}
        <div style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div
            id="printable-expense-paper"
            className="card"
            style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem', boxShadow: 'var(--shadow-lg)' }}
          >
            {/* Voucher header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, var(--accent), #4f46e5)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
                    <CreditCard style={{ color: '#ffffff', width: '18px', height: '18px' }} />
                  </div>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Creativals Agency</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.125rem', lineHeight: 1.5 }}>
                  <p>7th Floor, DLF Cyber City, Phase 3</p>
                  <p>Gurugram, Haryana - 122002</p>
                  <p>GSTIN: 06AAFCC1483L1ZS</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>EXPENSE VOUCHER</span>
                <span style={{ fontSize: '1.125rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{expense.expense_number}</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.125rem', marginTop: '0.25rem' }}>
                  <p><strong>Expense Date:</strong> {formatDate(expense.expense_date)}</p>
                  <p><strong>Logged On:</strong> {formatDate(expense.created_at || expense.expense_date)}</p>
                  <p><strong>Status:</strong> <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>{expense.status}</span></p>
                </div>
              </div>
            </div>

            {/* Title & description */}
            <div style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
              <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Expense Subject</span>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{expense.title}</p>
              {expense.description && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{expense.description}</p>
              )}
            </div>

            {/* Detail grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {detailRows.map(row => (
                <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{row.label}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{row.value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Billable Status</span>
                <span>
                  <span className={`badge ${expense.is_billable ? 'badge-accent' : 'badge-muted'}`}>
                    {expense.is_billable ? 'Billable to Client' : 'Internal Overhead'}
                  </span>
                </span>
              </div>
              {expense.approver && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    {expense.status === 'rejected' ? 'Rejected By' : 'Approved By'}
                  </span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{expense.approver.name}</span>
                </div>
              )}
            </div>

            {/* Amount summary + notes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', paddingTop: '0.5rem', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {expense.notes && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Memo Notes</span>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line', background: 'var(--surface-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                      {expense.notes}
                    </p>
                  </div>
                )}
                {expense.rejection_reason && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--danger)', letterSpacing: '0.05em' }}>Rejection Reason</span>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--danger)', lineHeight: 1.5, whiteSpace: 'pre-line', background: 'var(--danger-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', fontStyle: 'italic' }}>
                      {expense.rejection_reason}
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textAlign: 'right' }}>Amount Summary</span>
                <div style={{ background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.6875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Base Amount:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(expense.amount, currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Tax / GST:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(taxAmount, currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <span>Total Claim:</span>
                    <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{formatCurrency(totalAmount, currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Signature seals */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', borderTop: '1px solid var(--border)', paddingTop: '2rem', textAlign: 'center', fontSize: '0.625rem', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                <p>Submitted By</p>
                <div style={{ borderBottom: '1px solid var(--border)', width: '50%', margin: '0 auto' }}></div>
                <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{expense.submitter?.name || 'Employee'}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                <p>Approved By (Finance / PM)</p>
                <div style={{ borderBottom: '1px solid var(--border)', width: '50%', margin: '0 auto' }}></div>
                <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{expense.approver?.name || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: workflow, attachments, audit timeline */}
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="print:hidden">

          {/* Approval Workflow Panel */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Clock className="text-accent" size={14} />
              Approval Workflow
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Current Status:</span>
                <span className={`badge ${getStatusBadge(expense.status)} ${expense.status === 'submitted' ? 'animate-pulse' : ''}`} style={{ textTransform: 'uppercase' }}>
                  {expense.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Approver Routing
                  <HelpIcon text="Finance, Directors, and the Founder can approve any expense. A project-linked expense can also be approved by that project's manager." />
                </span>
                <span className={`badge ${expense.project_id ? 'badge-accent' : 'badge-info'}`}>
                  {expense.project_id ? 'Project Manager (PM)' : 'Finance / Founders'}
                </span>
              </div>

              {expense.status === 'draft' && (
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  This expense is in draft mode. Submit it to route the claim to the approvals desk.
                </p>
              )}
              {expense.status === 'submitted' && (
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Awaiting review by {expense.project?.name ? `the project manager of ${expense.project.name}` : 'Finance / Founders'}.
                </p>
              )}
              {expense.status === 'approved' && (
                <div style={{ padding: '0.75rem', background: 'var(--success-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.6875rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.375rem', fontWeight: 600 }}>
                  <CheckCircle size={14} className="flex-shrink-0" />
                  <span>Approved{expense.approver ? ` by ${expense.approver.name}` : ''} — awaiting reimbursement payout.</span>
                </div>
              )}
              {expense.status === 'reimbursed' && (
                <div style={{ padding: '0.75rem', background: 'var(--success-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.6875rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.375rem', fontWeight: 600 }}>
                  <Banknote size={14} className="flex-shrink-0" />
                  <span>Reimbursement completed{expense.approver ? ` (approved by ${expense.approver.name})` : ''}.</span>
                </div>
              )}
              {expense.status === 'rejected' && (
                <div style={{ padding: '0.75rem', background: 'var(--danger-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.6875rem', color: 'var(--danger)' }}>
                  <p style={{ fontWeight: 700 }}>Rejection Feedback:</p>
                  <p style={{ marginTop: '0.25rem', fontStyle: 'italic', lineHeight: 1.5 }}>
                    "{expense.rejection_reason || 'No reason provided.'}"
                  </p>
                </div>
              )}

              {/* Contextual actions inside workflow card */}
              {canSubmit && (
                <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="btn btn-primary" style={{ width: '100%', fontSize: '0.75rem' }}>
                  {expense.status === 'rejected' ? 'Resubmit for Approval' : 'Submit for Approval'}
                </button>
              )}
              {canApprove && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button onClick={handleReject} disabled={rejectMutation.isPending} className="btn btn-secondary" style={{ fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger-subtle)' }}>
                    Reject
                  </button>
                  <button
                    onClick={async () => { if (await confirm({ message: `Approve expense ${expense.expense_number} for ${formatCurrency(totalAmount, currency)}?` })) approveMutation.mutate(); }}
                    disabled={approveMutation.isPending}
                    className="btn btn-primary"
                    style={{ fontSize: '0.75rem' }}
                  >
                    Approve
                  </button>
                </div>
              )}
              {canReimburse && (
                <button
                  onClick={async () => { if (await confirm({ message: `Mark ${formatCurrency(totalAmount, currency)} as reimbursed to ${expense.submitter?.name || 'the submitter'}?` })) reimburseMutation.mutate(); }}
                  disabled={reimburseMutation.isPending}
                  className="btn btn-primary"
                  style={{ width: '100%', fontSize: '0.75rem' }}
                >
                  Mark as Reimbursed
                </button>
              )}
            </div>
          </div>

          {/* Submitter card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <UserIcon size={14} className="text-accent" /> Submitter
            </h3>
            <div className="flex items-center gap-2">
              <div className="avatar avatar-sm">{getInitials(expense.submitter?.name || '')}</div>
              <div>
                <div className="font-semibold text-xs">{expense.submitter?.name || 'Member'}</div>
                {expense.submitter?.email && <div className="text-secondary" style={{ fontSize: '0.65rem' }}>{expense.submitter.email}</div>}
              </div>
            </div>
            {expense.vendor && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                <Building2 size={14} style={{ color: 'var(--text-muted)', marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{expense.vendor.name}</div>
                  {expense.vendor.email && <div className="text-secondary" style={{ fontSize: '0.65rem' }}>{expense.vendor.email}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Receipt & Attachments */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Paperclip size={14} className="text-accent" /> Receipts & Attachments
              </span>
              {allFiles.length > 0 && (
                <button onClick={handleDownloadAllAttachments} className="text-accent hover:underline" style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Download size={11} /> Download All
                </button>
              )}
            </h3>

            {allFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No receipts or attachments uploaded for this expense.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {allFiles.map((file, idx) => (
                  <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--surface-elevated)' }}>
                    {isImageUrl(file.url) && (
                      <a href={file.url} target="_blank" rel="noreferrer" title="Open full size">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={file.url} alt={file.title} style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', display: 'block', borderBottom: '1px solid var(--border)' }} />
                      </a>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.5rem 0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                        <FileText size={14} style={{ color: '#34A853', flexShrink: 0 }} />
                        <span className="text-xs font-semibold truncate" title={file.title}>{file.title}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                        <a href={file.url} target="_blank" rel="noreferrer" className="hover:text-primary p-1" style={{ color: 'var(--text-secondary)', display: 'inline-flex' }} title="Open in new tab">
                          <ExternalLink size={13} />
                        </a>
                        <button
                          onClick={() => { const ext = file.url.split('.').pop()?.split('?')[0] || 'file'; downloadFile(file.url, `${file.title.replace(/[^a-z0-9-_ ]/gi, '')}.${ext}`); }}
                          className="hover:text-primary p-1"
                          style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}
                          title="Download"
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit Timeline */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              Audit Timeline
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', paddingLeft: '1.25rem' }}>
              <div style={{ position: 'absolute', left: '4px', top: '8px', bottom: '8px', width: '1px', background: 'var(--border)' }} />

              {timeline.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', position: 'relative', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  <div style={{ position: 'absolute', left: '-1.5rem', top: '2px', width: '9px', height: '9px', borderRadius: '50%', background: 'var(--border)', border: '2px solid var(--surface)' }} />
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontStyle: 'normal' }}>Expense Logged</p>
                  <p style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>{formatDateTime(expense.created_at)}</p>
                </div>
              ) : (
                timeline.map((log) => {
                  const entry = describeTimelineEntry(log);
                  return (
                    <div key={log.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', position: 'relative', fontSize: '0.75rem' }}>
                      <div style={{ position: 'absolute', left: '-1.5rem', top: '2px', width: '9px', height: '9px', borderRadius: '50%', background: entry.color, border: '2px solid var(--surface)' }} />
                      <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.title}</p>
                      <p style={{ fontSize: '0.625rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                        By <span style={{ fontWeight: 600 }}>{log.user?.name || 'System'}</span>
                      </p>
                      {entry.detail && (
                        <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.25rem', background: 'var(--surface-elevated)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                          {entry.detail}
                        </p>
                      )}
                      <p style={{ fontSize: '0.5625rem', color: 'var(--text-muted)', marginTop: '0.125rem', fontFamily: 'monospace' }}>
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
