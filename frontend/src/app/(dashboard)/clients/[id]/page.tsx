'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Mail, Phone, ArrowLeft, Edit2, Trash2, X, Shield, ShieldAlert,
  Users, MessageSquare, PlusCircle, AlertCircle, FolderKanban, FileText,
  FileCheck, Star, ExternalLink, Landmark, BadgePercent, Globe2,
} from 'lucide-react';
import {
  clientsApi, platformSettings, getApiErrorMessage,
  ClientDetail, ClientContact, ClientUpdatePayload,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/hooks/useToast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const CLIENT_DETAIL_HOWTO = {
  overview: 'This page is the full record of one client: who they are, how to bill them, every project, invoice, and quote linked to them, and the interaction history your team has logged. Data shown here is live — fix a wrong figure in the module it comes from (Invoices, Projects), and profile details via the Edit button.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'The header shows lifetime money figures: everything billed to this client, what they\'ve paid, and what\'s still outstanding.',
        'Use the tabs to move between billing details, contact persons, their projects, invoices, quotes, and the communication log.',
        'Click any project, invoice, or quote row to open that record.',
        'Use "Edit Client" to update their profile, billing address, tax number, and preferred currency.',
      ],
    },
    {
      heading: 'Contacts',
      items: [
        'Add every person you deal with at the client — accounts, marketing, ownership — with their role in the company.',
        'Mark one contact as Primary; that\'s who invoices and day-to-day communication default to.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Log calls and meetings in the Communications tab so any teammate can pick up the relationship.',
        'If you stop working with a client, set their status to Inactive from Edit — deleting is blocked while projects or invoices reference them.',
        'Keep the billing address and tax number current — they appear on invoices.',
      ],
    },
  ],
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: 'Planning', in_progress: 'In Progress', active: 'Active',
  on_hold: 'On Hold', completed: 'Completed', cancelled: 'Cancelled',
};

function statusBadgeColors(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'active': case 'in_progress': case 'sent': case 'approved':
      return { bg: 'var(--info-subtle, rgba(59,130,246,0.12))', fg: 'var(--info, #3b82f6)' };
    case 'paid': case 'completed': case 'converted':
      return { bg: 'var(--success-subtle)', fg: 'var(--success)' };
    case 'partially_paid': case 'pending': case 'on_hold': case 'planning': case 'draft':
      return { bg: 'var(--warning-subtle)', fg: 'var(--warning)' };
    case 'overdue': case 'cancelled': case 'rejected': case 'void': case 'suspended': case 'inactive':
      return { bg: 'var(--danger-subtle)', fg: 'var(--danger)' };
    default:
      return { bg: 'var(--surface-elevated)', fg: 'var(--text-secondary)' };
  }
}

function StatusBadge({ status }: { status: string }) {
  const { bg, fg } = statusBadgeColors(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '0.2rem 0.55rem',
      borderRadius: 999, fontSize: '0.625rem', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.05em', background: bg, color: fg,
    }}>
      {PROJECT_STATUS_LABELS[status] || status.replace(/_/g, ' ')}
    </span>
  );
}

type TabKey = 'overview' | 'contacts' | 'projects' | 'invoices' | 'quotes' | 'comms';

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = Number(params.id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const perms = user?.permissions || [];
  const canEdit = perms.includes('clients.edit');
  const canDelete = perms.includes('clients.delete');

  const [tab, setTab] = useState<TabKey>('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<ClientUpdatePayload>({});
  const [editError, setEditError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Contact form state
  const [contactForm, setContactForm] = useState<{ id: number | null; name: string; email: string; phone: string; designation: string; is_primary: boolean } | null>(null);
  const [contactToDelete, setContactToDelete] = useState<ClientContact | null>(null);

  // Communication form state
  const [newCommType, setNewCommType] = useState<'call' | 'email' | 'meeting' | 'other'>('call');
  const [newCommSubject, setNewCommSubject] = useState('');
  const [newCommContent, setNewCommContent] = useState('');
  const [newCommDate, setNewCommDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [commToDelete, setCommToDelete] = useState<number | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<ClientDetail>({
    queryKey: ['client_detail', clientId],
    queryFn: async () => {
      const res = await clientsApi.show(clientId);
      return res.data;
    },
    enabled: Number.isFinite(clientId),
  });

  const { data: settings } = useQuery({
    queryKey: ['platform_settings'],
    queryFn: async () => (await platformSettings.get()).data,
    enabled: showEditModal,
  });
  const activeCurrencies = (settings?.currencies || []).filter(c => c.is_active);

  const { data: communications = [], isLoading: isLoadingComms, isError: isCommsError } = useQuery({
    queryKey: ['client_communications', clientId],
    queryFn: async () => (await clientsApi.listCommunications(clientId)).data,
    enabled: Number.isFinite(clientId) && tab === 'comms',
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['client_detail', clientId] });
    queryClient.invalidateQueries({ queryKey: ['clients_directory'] });
  };

  const updateMutation = useMutation({
    mutationFn: (payload: ClientUpdatePayload) => clientsApi.update(clientId, payload),
    onSuccess: () => {
      invalidate();
      setShowEditModal(false);
      showToast('Client updated successfully', 'success');
    },
    onError: (err: any) => setEditError(getApiErrorMessage(err, 'Failed to update client.')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => clientsApi.delete(clientId),
    onSuccess: () => {
      showToast('Client deleted. A founder can restore them from the Recovery Bin.', 'success');
      router.push('/clients');
    },
    onError: (err: any) => {
      setShowDeleteConfirm(false);
      showToast(getApiErrorMessage(err, 'Failed to delete client'), 'error');
    },
  });

  const saveContactMutation = useMutation({
    mutationFn: async () => {
      if (!contactForm) throw new Error('No contact form');
      const payload = {
        name: contactForm.name,
        email: contactForm.email || undefined,
        phone: contactForm.phone || undefined,
        designation: contactForm.designation || undefined,
        is_primary: contactForm.is_primary,
      };
      return contactForm.id
        ? clientsApi.updateContact(clientId, contactForm.id, payload)
        : clientsApi.createContact(clientId, payload);
    },
    onSuccess: () => {
      invalidate();
      setContactForm(null);
      showToast('Contact saved', 'success');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to save contact'), 'error'),
  });

  const deleteContactMutation = useMutation({
    mutationFn: (contactId: number) => clientsApi.deleteContact(clientId, contactId),
    onSuccess: () => {
      invalidate();
      setContactToDelete(null);
      showToast('Contact removed', 'success');
    },
    onError: (err: any) => {
      setContactToDelete(null);
      showToast(getApiErrorMessage(err, 'Failed to remove contact'), 'error');
    },
  });

  const addCommMutation = useMutation({
    mutationFn: (payload: { type: string; subject: string; content?: string; communication_date: string }) =>
      clientsApi.createCommunication(clientId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_communications', clientId] });
      setNewCommSubject('');
      setNewCommContent('');
      showToast('Interaction logged', 'success');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to log interaction'), 'error'),
  });

  const deleteCommMutation = useMutation({
    mutationFn: (commId: number) => clientsApi.deleteCommunication(clientId, commId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_communications', clientId] });
      setCommToDelete(null);
      showToast('Log deleted', 'success');
    },
    onError: (err: any) => {
      setCommToDelete(null);
      showToast(getApiErrorMessage(err, 'Failed to delete log'), 'error');
    },
  });

  const openEdit = () => {
    if (!data) return;
    setEditForm({
      name: data.client.name,
      company_name: data.client.company_name || '',
      email: data.client.email,
      phone: data.client.phone || '',
      status: data.client.status,
      is_client_portal_user: data.client.is_client_portal_user,
      billing_address: data.client.billing_address || '',
      tax_number: data.client.tax_number || '',
      default_currency_id: data.client.default_currency?.id ?? null,
    });
    setEditError('');
    setShowEditModal(true);
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="animate-pulse" style={{ height: 120, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} />
        <div className="animate-pulse" style={{ height: 300, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }} />
      </div>
    );
  }

  if (isError || !data) {
    const status = (error as any)?.response?.status;
    return (
      <div style={{ maxWidth: 700, margin: '3rem auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
        <AlertCircle size={40} style={{ color: 'var(--danger)' }} />
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {status === 404 ? 'Client not found' : status === 403 ? 'You don\'t have permission to view clients' : 'Couldn\'t load this client'}
        </h2>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/clients" className="btn btn-secondary">Back to Clients</Link>
          {status !== 404 && status !== 403 && (
            <button onClick={() => refetch()} className="btn btn-primary">Retry</button>
          )}
        </div>
      </div>
    );
  }

  const { client, contacts, projects, invoices, quotes, totals, revenue_history: history, health } = data;
  const healthColor = health.score >= 80 ? 'var(--success)' : health.score >= 50 ? 'var(--warning)' : 'var(--danger)';
  const maxHistory = Math.max(...history.map(h => Math.max(h.billed, h.collected)), 1);

  const tabs: Array<{ key: TabKey; label: string; icon: React.ElementType; count?: number }> = [
    { key: 'overview', label: 'Overview', icon: Landmark },
    { key: 'contacts', label: 'Contacts', icon: Users, count: contacts.length },
    { key: 'projects', label: 'Projects', icon: FolderKanban, count: projects.total_count },
    { key: 'invoices', label: 'Invoices', icon: FileText, count: invoices.total_count },
    { key: 'quotes', label: 'Quotes', icon: FileCheck, count: quotes.total_count },
    { key: 'comms', label: 'Communications', icon: MessageSquare },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div>
        <Link href="/clients" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          <ArrowLeft size={14} /> All Clients
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
              <Building2 size={22} className="text-accent" />
              <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {client.company_name || client.name}
              </h1>
              <StatusBadge status={client.status} />
              {client.is_client_portal_user ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.625rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 999, background: 'var(--success-subtle)', color: 'var(--success)' }}>
                  <Shield size={10} /> PORTAL ON
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.625rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 999, background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <Shield size={10} /> PORTAL OFF
                </span>
              )}
              <HelpIcon title="Client record" content={{
                what: 'Everything about this client in one place: profile and billing details, their projects, invoices, quotes, and your team\'s interaction log.',
                why: 'The agency lifecycle links every record to a client — this page is where those links come together.',
                when: 'Money figures are lifetime totals across all their invoices, converted to INR.',
              }} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              {client.company_name && <span>{client.name}</span>}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={13} /> {client.email}</span>
              {client.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={13} /> {client.phone}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <HowToUseGuide moduleKey="clients-detail" title="How the Client Page Works" content={CLIENT_DETAIL_HOWTO} />
            {canEdit && (
              <button onClick={openEdit} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Edit2 size={14} /> Edit Client
              </button>
            )}
            {canDelete && (
              <button onClick={() => setShowDeleteConfirm(true)} className="btn btn-secondary text-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Money summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="kpi-card">
          <span className="kpi-label">Lifetime Billed <HelpIcon text="Total of every invoice ever issued to this client (approved, sent, paid, partially paid, or overdue), converted to INR." size={11} /></span>
          <span className="kpi-value">{formatCurrency(totals.total_billed)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Collected</span>
          <span className="kpi-value text-success">{formatCurrency(totals.total_paid)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Outstanding <HelpIcon text="Billed money this client hasn't paid yet, across all their invoices." size={11} /></span>
          <span className="kpi-value" style={{ color: totals.total_outstanding > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
            {formatCurrency(totals.total_outstanding)}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.75rem 1rem', whiteSpace: 'nowrap',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', background: 'none', border: 'none',
              borderBottomWidth: 2, borderBottomStyle: 'solid',
              borderBottomColor: tab === t.key ? 'var(--accent)' : 'transparent',
            }}
          >
            <t.icon size={14} />
            {t.label}
            {t.count !== undefined && (
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Billing & profile */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Landmark size={15} className="text-accent" /> Billing Details
              <HelpIcon text="These details appear on invoices for this client. Update them via Edit Client." size={12} />
            </h3>
            {[
              { label: 'Company', value: client.company_name || '—' },
              { label: 'Primary account holder', value: client.name },
              { label: 'Billing email', value: client.email },
              { label: 'Phone', value: client.phone || '—' },
              { label: 'Billing address', value: client.billing_address || 'Not set — add it via Edit Client so invoices carry it' },
              { label: 'Tax / GST number', value: client.tax_number || '—' },
              { label: 'Preferred currency', value: client.default_currency ? `${client.default_currency.code}${client.default_currency.name ? ' — ' + client.default_currency.name : ''}` : 'Not set (platform default is used)' },
              { label: 'Client since', value: client.created_at ? formatDate(client.created_at) : '—' },
              { label: 'Last portal login', value: client.last_login_at ? formatDate(client.last_login_at) : 'Never logged in' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px dashed var(--border)', paddingBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{row.label}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', whiteSpace: 'pre-wrap' }}>{row.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Health */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                  background: health.score >= 80 ? 'var(--success-subtle)' : health.score >= 50 ? 'var(--warning-subtle)' : 'var(--danger-subtle)',
                  border: `2px solid ${healthColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: '1.125rem', fontWeight: 800, color: healthColor }}>{health.score}</span>
                </div>
                <div>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Health Score
                    <HelpIcon text="Starts at 100 and loses 10 points per overdue invoice, 15 per on-hold project, 30 per cancelled project, and up to 20 for the share of billing still unpaid. The rows below show this client's actual deductions." size={12} />
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Relationship risk at a glance</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                  <span>Base score</span><span style={{ fontWeight: 600, color: 'var(--success)' }}>100</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                  <span>Overdue invoices ({health.components.overdue_invoices})</span>
                  <span style={{ fontWeight: 600, color: health.components.overdue_penalty > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>−{health.components.overdue_penalty}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                  <span>On-hold projects ({health.components.on_hold_projects})</span>
                  <span style={{ fontWeight: 600, color: health.components.on_hold_penalty > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>−{health.components.on_hold_penalty}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                  <span>Cancelled projects ({health.components.cancelled_projects})</span>
                  <span style={{ fontWeight: 600, color: health.components.cancelled_penalty > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>−{health.components.cancelled_penalty}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                  <span>Unpaid share of billing</span>
                  <span style={{ fontWeight: 600, color: health.components.outstanding_penalty > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>−{health.components.outstanding_penalty}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.25rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Final score</span>
                  <span style={{ fontWeight: 700, color: healthColor }}>{health.score} / 100</span>
                </div>
              </div>
            </div>

            {/* Revenue history */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' }}>
                <BadgePercent size={15} className="text-accent" /> Revenue History
                <HelpIcon text="The last 12 months of this client's account: dark bars are amounts invoiced in that month; green bars are payments actually received in that month." size={12} />
              </h3>
              {history.every(h => h.billed === 0 && h.collected === 0) ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No billing activity in the last 12 months.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110 }}>
                    {history.map(h => (
                      <div key={h.month_key} title={`${h.month_name}: billed ${formatCurrency(h.billed)}, collected ${formatCurrency(h.collected)}`}
                        style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, height: '100%' }}>
                        <div style={{ flex: 1, height: `${Math.max((h.billed / maxHistory) * 100, h.billed > 0 ? 4 : 0)}%`, background: 'var(--accent)', borderRadius: 2, opacity: 0.85 }} />
                        <div style={{ flex: 1, height: `${Math.max((h.collected / maxHistory) * 100, h.collected > 0 ? 4 : 0)}%`, background: 'var(--success)', borderRadius: 2, opacity: 0.85 }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    <span>{history[0]?.month_name}</span>
                    <span>{history[history.length - 1]?.month_name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 6, background: 'var(--accent)', borderRadius: 2, display: 'inline-block' }} /> Billed</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 6, background: 'var(--success)', borderRadius: 2, display: 'inline-block' }} /> Collected</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Contacts tab ── */}
      {tab === 'contacts' && (
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={15} className="text-accent" /> Contact People
              <HelpIcon text="Everyone you deal with at this client. The Primary contact is the default for invoices and communication." size={12} />
            </h3>
            {canEdit && (
              <button onClick={() => setContactForm({ id: null, name: '', email: '', phone: '', designation: '', is_primary: contacts.length === 0 })} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem' }}>
                <PlusCircle size={14} /> Add Contact
              </button>
            )}
          </div>

          {contacts.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
              No contacts recorded yet.
              {canEdit ? ' Use "Add Contact" to record who you deal with at this client.' : ''}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {contacts.map(c => (
                <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{c.name}</span>
                      {c.is_primary && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.575rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: 999, background: 'var(--accent-subtle, rgba(124,58,237,0.12))', color: 'var(--accent)' }}>
                          <Star size={9} /> PRIMARY
                        </span>
                      )}
                    </div>
                    {c.designation && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{c.designation}</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {c.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={11} /> {c.email}</span>}
                      {c.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {c.phone}</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-icon" title="Edit contact"
                        onClick={() => setContactForm({ id: c.id, name: c.name, email: c.email || '', phone: c.phone || '', designation: c.designation || '', is_primary: c.is_primary })}>
                        <Edit2 size={14} />
                      </button>
                      <button className="btn btn-icon text-danger" title="Remove contact" onClick={() => setContactToDelete(c)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Projects tab ── */}
      {tab === 'projects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {projects.total_count === 0 ? (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              <FolderKanban size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
              No projects yet for this client.{' '}
              {perms.includes('projects.create') && <Link href="/projects?new=true" style={{ color: 'var(--accent)', fontWeight: 600 }}>Create their first project</Link>}
            </div>
          ) : (
            ([
              { label: 'Active Projects', rows: projects.active },
              { label: 'Planning / On Hold', rows: projects.pipeline },
              { label: 'Closed Projects', rows: projects.closed },
            ] as const).map(group => group.rows.length > 0 && (
              <div key={group.label} className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>{group.label} ({group.rows.length})</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Project</th><th>Status</th><th>Progress</th><th>Timeline</th><th>Budget</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(p => (
                        <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/projects/${p.id}`)}>
                          <td>
                            <div className="font-semibold text-primary">{p.name}</div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{p.project_number}</div>
                          </td>
                          <td><StatusBadge status={p.status} /></td>
                          <td>{p.completion_percentage}%</td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {p.start_date ? formatDate(p.start_date) : '—'} → {p.end_date ? formatDate(p.end_date) : 'open'}
                          </td>
                          <td>{p.budget_amount ? formatCurrency(Number(p.budget_amount)) : '—'}</td>
                          <td><ExternalLink size={13} style={{ color: 'var(--text-muted)' }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Invoices tab ── */}
      {tab === 'invoices' && (
        <div className="card" style={{ padding: '1.25rem' }}>
          {invoices.total_count === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              <FileText size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
              No invoices yet for this client.{' '}
              {perms.includes('invoices.create') && <Link href="/invoices/create" style={{ color: 'var(--accent)', fontWeight: 600 }}>Create one</Link>}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr><th>Invoice</th><th>Status</th><th>Issued</th><th>Due</th><th>Total</th><th>Balance Due</th><th></th></tr>
                  </thead>
                  <tbody>
                    {invoices.items.map(inv => (
                      <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/invoices/${inv.id}`)}>
                        <td>
                          <div className="font-semibold text-primary">{inv.invoice_number}</div>
                          {inv.title && <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{inv.title}</div>}
                        </td>
                        <td><StatusBadge status={inv.status} /></td>
                        <td style={{ fontSize: '0.75rem' }}>{inv.issue_date ? formatDate(inv.issue_date) : '—'}</td>
                        <td style={{ fontSize: '0.75rem' }}>{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                        <td className="font-semibold">{formatCurrency(Number(inv.total_amount))}</td>
                        <td style={{ color: Number(inv.due_amount) > 0 ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 600 }}>
                          {Number(inv.due_amount) > 0 ? formatCurrency(Number(inv.due_amount)) : 'Cleared'}
                        </td>
                        <td><ExternalLink size={13} style={{ color: 'var(--text-muted)' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {invoices.total_count > invoices.items.length && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                  Showing the {invoices.items.length} most recent of {invoices.total_count} invoices — see the <Link href="/invoices" style={{ color: 'var(--accent)' }}>Invoices module</Link> for the rest.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Quotes tab ── */}
      {tab === 'quotes' && (
        <div className="card" style={{ padding: '1.25rem' }}>
          {quotes.total_count === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              <FileCheck size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
              No quotes yet for this client.{' '}
              {perms.includes('quotes.create') && <Link href="/quotes/create" style={{ color: 'var(--accent)', fontWeight: 600 }}>Create one</Link>}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr><th>Quote</th><th>Status</th><th>Created</th><th>Valid Until</th><th>Total</th><th></th></tr>
                  </thead>
                  <tbody>
                    {quotes.items.map(q => (
                      <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/quotes/${q.id}`)}>
                        <td className="font-semibold text-primary">{q.quote_number}</td>
                        <td><StatusBadge status={q.status} /></td>
                        <td style={{ fontSize: '0.75rem' }}>{formatDate(q.created_at)}</td>
                        <td style={{ fontSize: '0.75rem' }}>{q.valid_until ? formatDate(q.valid_until) : '—'}</td>
                        <td className="font-semibold">{formatCurrency(Number(q.total_amount))}</td>
                        <td><ExternalLink size={13} style={{ color: 'var(--text-muted)' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {quotes.total_count > quotes.items.length && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                  Showing the {quotes.items.length} most recent of {quotes.total_count} quotes.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Communications tab ── */}
      {tab === 'comms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PlusCircle size={16} className="text-accent" /> Log New Interaction
              <HelpIcon text="Record calls, emails, and meetings so teammates can see the full relationship history." size={12} />
            </h4>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!newCommSubject.trim()) return;
              addCommMutation.mutate({ type: newCommType, subject: newCommSubject, content: newCommContent, communication_date: newCommDate });
            }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</label>
                  <select value={newCommType} onChange={(e) => setNewCommType(e.target.value as any)} className="form-input" style={{ height: 36, padding: '0 0.5rem', fontSize: '0.825rem' }}>
                    <option value="call">Call Log</option>
                    <option value="email">Email Follow-up</option>
                    <option value="meeting">Meeting Note</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Date & Time</label>
                  <input type="datetime-local" value={newCommDate} onChange={(e) => setNewCommDate(e.target.value)} className="form-input" style={{ height: 36, padding: '0 0.5rem', fontSize: '0.825rem' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Subject *</label>
                <input type="text" required placeholder="e.g. Discussed contract extension details" value={newCommSubject} onChange={(e) => setNewCommSubject(e.target.value)} className="form-input" style={{ height: 36, padding: '0 0.5rem', fontSize: '0.825rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Summary / Notes</label>
                <textarea placeholder="Key discussion points, next steps..." value={newCommContent} onChange={(e) => setNewCommContent(e.target.value)} className="form-input" style={{ minHeight: 80, padding: '0.5rem', fontSize: '0.825rem', resize: 'vertical' }} />
              </div>
              <button type="submit" disabled={addCommMutation.isPending || !newCommSubject.trim()} className="btn btn-primary" style={{ alignSelf: 'flex-end', height: 36, fontSize: '0.825rem' }}>
                {addCommMutation.isPending ? 'Logging...' : 'Save Interaction'}
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Timeline Activity</h4>
            {isLoadingComms ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>Loading interaction timeline...</div>
            ) : isCommsError ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--danger)', fontSize: '0.825rem' }}>
                Couldn't load the communication history. Refresh to try again.
              </div>
            ) : communications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                No interaction history recorded for this client yet — log the first one above.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {communications.map((comm) => {
                  const CommIcon = comm.type === 'call' ? Phone : comm.type === 'email' ? Mail : comm.type === 'meeting' ? Users : MessageSquare;
                  return (
                    <div key={comm.id} style={{ display: 'flex', gap: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--surface-elevated)', color: 'var(--accent)',
                      }}>
                        <CommIcon size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                              {comm.type} — {new Date(comm.communication_date).toLocaleString()}
                            </span>
                            <h5 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{comm.subject}</h5>
                          </div>
                          {(canEdit || comm.recorded_by === user?.id) && (
                            <button onClick={() => setCommToDelete(comm.id)} className="btn btn-icon text-danger" style={{ padding: '0.25rem' }} title="Delete Log">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        {comm.content && (
                          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.5rem', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{comm.content}</p>
                        )}
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Logged by: {comm.recorder?.name || 'Unknown User'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Client modal ── */}
      {showEditModal && (
        <div className="overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2"><Edit2 className="text-accent" size={18} /> Edit Client</h3>
              <button onClick={() => setShowEditModal(false)} className="btn btn-icon"><X size={18} /></button>
            </div>
            <div className="modal-body">
              {editError && (
                <div style={{ padding: '0.75rem', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                  <span>{editError}</span>
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editForm); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Company Name">
                    <input type="text" value={editForm.company_name || ''} onChange={(e) => setEditForm(f => ({ ...f, company_name: e.target.value }))} className="form-input" placeholder="e.g. Acme Corp" />
                  </Field>
                  <Field label="Account Holder Name *">
                    <input type="text" required value={editForm.name || ''} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="form-input" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Email *" help="Also the client's portal login.">
                    <input type="email" required value={editForm.email || ''} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} className="form-input" />
                  </Field>
                  <Field label="Phone">
                    <input type="text" value={editForm.phone || ''} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} className="form-input" />
                  </Field>
                </div>
                <Field label="Billing Address" help="Printed on invoices for this client.">
                  <textarea value={editForm.billing_address || ''} onChange={(e) => setEditForm(f => ({ ...f, billing_address: e.target.value }))} className="form-input" style={{ minHeight: 70, resize: 'vertical' }} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Tax / GST Number">
                    <input type="text" value={editForm.tax_number || ''} onChange={(e) => setEditForm(f => ({ ...f, tax_number: e.target.value }))} className="form-input" />
                  </Field>
                  <Field label="Preferred Currency" help="The default currency suggested when billing this client.">
                    <select
                      value={editForm.default_currency_id ?? ''}
                      onChange={(e) => setEditForm(f => ({ ...f, default_currency_id: e.target.value ? Number(e.target.value) : null }))}
                      className="form-input"
                    >
                      <option value="">Platform default</option>
                      {activeCurrencies.map(c => (
                        <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Status" help="Active = current client. Inactive = no longer working together (keeps history — prefer this over deleting). Suspended = temporarily blocked.">
                    <select value={editForm.status || 'active'} onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value as any }))} className="form-input">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </Field>
                  <Field label="Portal Access" help="Whether this client can log into the client portal with their email.">
                    <select
                      value={editForm.is_client_portal_user ? '1' : '0'}
                      onChange={(e) => setEditForm(f => ({ ...f, is_client_portal_user: e.target.value === '1' }))}
                      className="form-input"
                    >
                      <option value="1">Enabled</option>
                      <option value="0">Blocked</option>
                    </select>
                  </Field>
                </div>
                <div className="modal-footer" style={{ padding: '1rem 0 0 0', borderTop: '1px solid var(--border)' }}>
                  <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary">
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Contact modal ── */}
      {contactForm && (
        <div className="overlay" onClick={() => setContactForm(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2">
                <Users className="text-accent" size={18} /> {contactForm.id ? 'Edit Contact' : 'Add Contact'}
              </h3>
              <button onClick={() => setContactForm(null)} className="btn btn-icon"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={(e) => { e.preventDefault(); if (contactForm.name.trim()) saveContactMutation.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <Field label="Name *">
                  <input type="text" required value={contactForm.name} onChange={(e) => setContactForm(f => f && ({ ...f, name: e.target.value }))} className="form-input" />
                </Field>
                <Field label="Role / Designation">
                  <input type="text" placeholder="e.g. Marketing Head" value={contactForm.designation} onChange={(e) => setContactForm(f => f && ({ ...f, designation: e.target.value }))} className="form-input" />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Email">
                    <input type="email" value={contactForm.email} onChange={(e) => setContactForm(f => f && ({ ...f, email: e.target.value }))} className="form-input" />
                  </Field>
                  <Field label="Phone">
                    <input type="text" value={contactForm.phone} onChange={(e) => setContactForm(f => f && ({ ...f, phone: e.target.value }))} className="form-input" />
                  </Field>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={contactForm.is_primary} onChange={(e) => setContactForm(f => f && ({ ...f, is_primary: e.target.checked }))} />
                  Primary contact
                  <HelpIcon text="The default person for invoices and communication. Marking this contact primary un-marks any other." size={11} />
                </label>
                <div className="modal-footer" style={{ padding: '1rem 0 0 0', borderTop: '1px solid var(--border)' }}>
                  <button type="button" onClick={() => setContactForm(null)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={saveContactMutation.isPending || !contactForm.name.trim()} className="btn btn-primary">
                    {saveContactMutation.isPending ? 'Saving...' : 'Save Contact'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirmations */}
      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete Client"
          message={`Move "${client.company_name || client.name}" to the Recovery Bin? Deleting is blocked while projects or invoices still reference them — in that case, set their status to Inactive instead. A founder can restore deleted clients from Settings → Backups & Recovery.`}
          confirmLabel="Delete Client"
          cancelLabel="Cancel"
          danger={true}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {contactToDelete && (
        <ConfirmModal
          title="Remove Contact"
          message={`Remove "${contactToDelete.name}" from this client's contact list? This only deletes the contact entry, nothing else.`}
          confirmLabel="Remove Contact"
          cancelLabel="Cancel"
          danger={true}
          onConfirm={() => deleteContactMutation.mutate(contactToDelete.id)}
          onCancel={() => setContactToDelete(null)}
        />
      )}
      {commToDelete !== null && (
        <ConfirmModal
          title="Delete Log"
          message="Delete this communication log entry? This cannot be undone."
          confirmLabel="Delete Log"
          cancelLabel="Cancel"
          danger={true}
          onConfirm={() => deleteCommMutation.mutate(commToDelete)}
          onCancel={() => setCommToDelete(null)}
        />
      )}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {help && <HelpIcon text={help} size={11} />}
      </label>
      {children}
    </div>
  );
}
