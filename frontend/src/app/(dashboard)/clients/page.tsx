'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Users, Plus, Search, ShieldAlert, X, Eye, Shield,
  Edit2, Trash2, AlertCircle,
} from 'lucide-react';
import { clientsApi, getApiErrorMessage } from '@/lib/api';
import type { ClientDirectoryRow } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/hooks/useToast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const CLIENTS_HOWTO = {
  overview: 'A client record is the company or person you do work for. Projects, invoices, and quotes are linked to a client, so every bill, payment, and project can be traced back to the right account. This page lists all clients; click a row to open the full client page with their contacts, projects, invoices, quotes, and communication history.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Click "Add Client" and enter the company, contact name, email, and an initial password — the email and password are their login for the client portal.',
        'Add a client before creating their first project or invoice, so those records can be linked to them.',
        'Click any row (or the eye button) to open the client\'s full page — billing details, contacts, projects, invoices, quotes, and communication logs all live there.',
        'Use the pencil button for a quick edit of name, email, phone, or status.',
      ],
    },
    {
      heading: 'Reading the table',
      items: [
        'Health Score starts at 100 and drops for overdue invoices, on-hold or cancelled projects, and unpaid balance — green is healthy, red needs attention.',
        'The Portal Access toggle controls whether the client can log into the client portal. Switch it off to block their login instantly.',
        '"Amount Billed", "Collected", and "Outstanding" are lifetime totals across all of the client\'s invoices, converted to INR.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Log every important call or meeting on the client\'s page (Communications tab) so teammates can see the full history.',
        'Keep the client\'s email address correct — it doubles as their portal login.',
        'Set clients you no longer work with to "Inactive" instead of deleting them — deleting is blocked anyway while projects or invoices reference them.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Creating duplicates with slightly different names — search the list first before adding a new client.',
        'Leaving the initial password weak or unchanged — set a proper one and ask the client to change it after first login.',
        'Expecting deleted clients to be gone forever — they move to the Recovery Bin, where a founder can restore them.',
      ],
    },
  ],
};

export default function ClientsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const perms = user?.permissions || [];
  const canCreate = perms.includes('clients.create');
  const canEdit = perms.includes('clients.edit');
  const canDelete = perms.includes('clients.delete');
  const canViewFinancials = perms.includes('reports.view_financial');

  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', company_name: '', email: '', password: '', phone: '' });
  const [inviteError, setInviteError] = useState('');

  const [editClient, setEditClient] = useState<ClientDirectoryRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', status: 'active' as 'active' | 'inactive' | 'suspended' });
  const [editError, setEditError] = useState('');

  const [clientToDelete, setClientToDelete] = useState<ClientDirectoryRow | null>(null);

  // The Clients module's own endpoint (clients.view) — the reports endpoint
  // this page previously used requires reports.* permissions that sales
  // roles don't hold.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clients_directory'],
    queryFn: async () => (await clientsApi.list()).data,
  });

  const inviteMutation = useMutation({
    mutationFn: () => clientsApi.create({
      name: inviteForm.name,
      company_name: inviteForm.company_name || undefined,
      email: inviteForm.email,
      password: inviteForm.password,
      phone: inviteForm.phone || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients_directory'] });
      setShowInviteModal(false);
      setInviteForm({ name: '', company_name: '', email: '', password: '', phone: '' });
      setInviteError('');
      showToast('Client added — a welcome email with their portal login is on its way', 'success');
    },
    onError: (err: any) => setInviteError(getApiErrorMessage(err, 'Failed to add client.')),
  });

  const portalMutation = useMutation({
    mutationFn: ({ clientId, is_client_portal_user }: { clientId: number; is_client_portal_user: boolean }) =>
      clientsApi.update(clientId, { is_client_portal_user }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients_directory'] });
      showToast('Portal access updated', 'success');
    },
    onError: (err: any) => showToast(getApiErrorMessage(err, 'Failed to update portal access'), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editClient) throw new Error('No client selected');
      return clientsApi.update(editClient.client_id, editForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients_directory'] });
      setEditClient(null);
      showToast('Client updated successfully', 'success');
    },
    onError: (err: any) => setEditError(getApiErrorMessage(err, 'Failed to update client.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (clientId: number) => clientsApi.delete(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients_directory'] });
      setClientToDelete(null);
      showToast('Client moved to the Recovery Bin', 'success');
    },
    onError: (err: any) => {
      setClientToDelete(null);
      showToast(getApiErrorMessage(err, 'Failed to delete client'), 'error');
    },
  });

  const clients = data?.breakdown || [];
  const summary = data?.summary || { total_clients: 0, total_active: 0, total_billed: 0, total_collected: 0, total_outstanding: 0 };

  const filteredClients = clients.filter(c =>
    c.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.company_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.client_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openEdit = (c: ClientDirectoryRow) => {
    setEditClient(c);
    setEditForm({ name: c.client_name, email: c.client_email, phone: c.phone || '', status: c.status });
    setEditError('');
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 className="text-accent" size={24} />
            Client Registry
            <HelpIcon title="Clients" content={{
              what: 'The list of companies and people you do work for. Each row is one client account; click it to open their full page.',
              why: 'Projects, invoices, and quotes are linked to a client, so keeping this list accurate keeps billing and reporting accurate too.',
              when: 'Add a client here before creating their first project or invoice.',
            }} />
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Manage your client accounts, view project statistics, and track billing history.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <HowToUseGuide moduleKey="clients" title="How Clients Work" content={CLIENTS_HOWTO} />
          {canCreate && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Plus size={16} /> Add Client
            </button>
          )}
        </div>
      </div>

      {isError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)',
          borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8125rem', flexShrink: 0
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} />
            Couldn't load the client directory. Check your connection and try again.
          </span>
          <button onClick={() => refetch()} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}>Retry</button>
        </div>
      )}

      {/* Stats Cards */}
      <div className={canViewFinancials ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" : "grid grid-cols-1 gap-4"}>
        <div className="kpi-card">
          <span className="kpi-label">Total Clients</span>
          <span className="kpi-value">{summary.total_clients}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <Users size={12} /> {summary.total_active} with running projects
          </div>
        </div>

        {canViewFinancials && (
          <>
            <div className="kpi-card">
              <span className="kpi-label">Total Billed <HelpIcon text="Lifetime total of every invoice issued to any client, converted to INR." size={11} /></span>
              <span className="kpi-value">{formatCurrency(summary.total_billed)}</span>
              <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                All-time, all clients
              </div>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Collected Amount</span>
              <span className="kpi-value text-success">{formatCurrency(summary.total_collected)}</span>
              <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Collection Rate: <span className="text-success font-bold">{summary.total_billed > 0 ? Math.round((summary.total_collected / summary.total_billed) * 100) : 0}%</span>
              </div>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Outstanding Balance</span>
              <span className="kpi-value text-warning">{formatCurrency(summary.total_outstanding)}</span>
              <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Unpaid across all clients
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by company, name, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '2.25rem', width: '100%' }}
          />
        </div>
      </div>

      {/* Directory Table */}
      <div className="data-table-wrap" style={{ overflowX: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', animation: 'pulse 1.5s infinite' }}>Loading Client Directory...</div>
        ) : filteredClients.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <Building2 style={{ width: '3rem', height: '3rem', color: 'var(--border)' }} />
            {clients.length === 0 ? (
              <>
                <h3 className="font-semibold text-primary">No Clients Yet</h3>
                <p style={{ fontSize: '0.75rem' }}>Clients are the accounts your projects and invoices link to.</p>
                {canCreate && (
                  <button onClick={() => setShowInviteModal(true)} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                    <Plus size={14} /> Add your first client
                  </button>
                )}
              </>
            ) : (
              <>
                <h3 className="font-semibold text-primary">No clients match your search</h3>
                <button onClick={() => setSearchQuery('')} className="btn btn-secondary" style={{ marginTop: '0.5rem' }}>
                  Clear Search
                </button>
              </>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client Organization</th>
                <th>Active / Total Projects</th>
                <th>Health Score <HelpIcon text="Starts at 100 and drops for overdue invoices (-10 each), on-hold projects (-15 each), cancelled projects (-30 each), and a high unpaid balance. Open the client's page for their exact breakdown." size={12} /></th>
                <th>Portal Access <HelpIcon text="Whether this client can log into the client portal. Click the toggle to allow or block their login instantly." size={12} /></th>
                {canViewFinancials && (
                  <>
                    <th>Amount Billed <HelpIcon text="Lifetime billing across all this client's invoices, converted to INR." size={11} /></th>
                    <th>Collected</th>
                    <th>Outstanding</th>
                  </>
                )}
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => (
                <tr key={c.client_id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/clients/${c.client_id}`)}>
                  <td>
                    <div className="font-semibold text-primary">{c.company_name || c.client_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {c.company_name ? `${c.client_name} · ` : ''}{c.client_email}
                    </div>
                  </td>
                  <td>
                    <span className="text-primary font-bold">{c.active_projects}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>/ {c.total_projects} Total</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: c.health_score >= 80 ? 'var(--success)' : c.health_score >= 50 ? 'var(--warning)' : 'var(--danger)',
                        }}
                      />
                      <span style={{ fontWeight: 600, color: c.health_score >= 80 ? 'var(--success)' : c.health_score >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                        {c.health_score}
                      </span>
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {canEdit ? (
                      <button
                        onClick={() => portalMutation.mutate({ clientId: c.client_id, is_client_portal_user: !c.is_client_portal_user })}
                        disabled={portalMutation.isPending}
                        title={c.is_client_portal_user ? 'Portal login enabled — click to block' : 'Portal login blocked — click to allow'}
                        style={{
                          position: 'relative', width: '40px', height: '22px', borderRadius: '11px',
                          background: c.is_client_portal_user ? 'var(--success)' : 'var(--border)',
                          border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                          display: 'flex', alignItems: 'center', padding: '2px',
                        }}
                      >
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                          transform: c.is_client_portal_user ? 'translateX(18px)' : 'translateX(0px)',
                          transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                      </button>
                    ) : (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6875rem', fontWeight: 600,
                        color: c.is_client_portal_user ? 'var(--success)' : 'var(--text-muted)',
                      }}>
                        <Shield size={11} /> {c.is_client_portal_user ? 'Enabled' : 'Blocked'}
                      </span>
                    )}
                  </td>
                  {canViewFinancials && (
                    <>
                      <td className="font-bold text-primary">{formatCurrency(c.total_billed)}</td>
                      <td className="font-semibold text-success">{formatCurrency(c.total_paid || 0)}</td>
                      <td className="font-semibold">
                        {c.total_outstanding > 0 ? (
                          <span className="text-warning">{formatCurrency(c.total_outstanding)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>— Cleared</span>
                        )}
                      </td>
                    </>
                  )}
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => router.push(`/clients/${c.client_id}`)}
                        className="btn btn-icon"
                        title="Open client page"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}
                      >
                        <Eye size={16} />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => openEdit(c)}
                          className="btn btn-icon"
                          title="Quick edit"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setClientToDelete(c)}
                          className="btn btn-icon text-danger"
                          title="Delete client"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Client Modal */}
      {showInviteModal && (
        <div className="overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2">
                <Shield className="text-accent" size={20} />
                Add Client
              </h3>
              <button onClick={() => setShowInviteModal(false)} className="btn btn-icon">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {inviteError && (
                <div style={{ padding: '0.75rem', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                  <span>{inviteError}</span>
                </div>
              )}

              <form onSubmit={(e) => {
                e.preventDefault();
                if (!inviteForm.name.trim() || !inviteForm.email.trim() || !inviteForm.password) {
                  setInviteError('Name, email, and an initial password are required.');
                  return;
                }
                inviteMutation.mutate();
              }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Company Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Stark Enterprises"
                    value={inviteForm.company_name}
                    onChange={(e) => setInviteForm(f => ({ ...f, company_name: e.target.value }))}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Contact Person / Account Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tony Stark"
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm(f => ({ ...f, name: e.target.value }))}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Client Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. client@domain.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Initial Password *
                    <HelpIcon text="At least 8 characters. The client uses this (with their email) for their first portal login — a welcome email is sent automatically. Ask them to change it after logging in." size={12} />
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={inviteForm.password}
                    onChange={(e) => setInviteForm(f => ({ ...f, password: e.target.value }))}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 99999 88888"
                    value={inviteForm.phone}
                    onChange={(e) => setInviteForm(f => ({ ...f, phone: e.target.value }))}
                    className="form-input"
                  />
                </div>

                <div className="modal-footer" style={{ padding: '1.25rem 0 0 0', borderTop: '1px solid var(--border)', marginTop: '1rem' }}>
                  <button type="button" onClick={() => setShowInviteModal(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={inviteMutation.isPending} className="btn btn-primary">
                    {inviteMutation.isPending ? 'Adding...' : 'Add Client'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Quick Edit Modal */}
      {editClient && (
        <div className="overlay" onClick={() => setEditClient(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2">
                <Edit2 className="text-accent" size={20} />
                Quick Edit: {editClient.company_name || editClient.client_name}
              </h3>
              <button onClick={() => setEditClient(null)} className="btn btn-icon">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {editError && (
                <div style={{ padding: '0.75rem', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={(e) => {
                e.preventDefault();
                if (!editForm.name.trim() || !editForm.email.trim()) {
                  setEditError('Name and Email are required.');
                  return;
                }
                updateMutation.mutate();
              }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Account Name *</label>
                  <input type="text" required value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="form-input" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email *</label>
                  <input type="email" required value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} className="form-input" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</label>
                  <input type="text" value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} className="form-input" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Status
                    <HelpIcon text="Active = a current client. Inactive = no longer working together (keeps their history — prefer this over deleting). Suspended = temporarily blocked from the account." size={12} />
                  </label>
                  <select value={editForm.status} onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value as any }))} className="form-input">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                  Billing address, tax number, currency, and contacts live on the{' '}
                  <button type="button" onClick={() => router.push(`/clients/${editClient.client_id}`)} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    full client page
                  </button>.
                </p>

                <div className="modal-footer" style={{ padding: '1.25rem 0 0 0', borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => setEditClient(null)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary">
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Client Confirmation Modal */}
      {clientToDelete && (
        <ConfirmModal
          title="Delete Client"
          message={`Move "${clientToDelete.company_name || clientToDelete.client_name}" to the Recovery Bin? Deleting is blocked while projects or invoices still reference them — in that case set their status to Inactive instead. A founder can restore deleted clients from Settings → Backups & Recovery.`}
          confirmLabel="Delete Client"
          cancelLabel="Cancel"
          danger={true}
          onConfirm={() => deleteMutation.mutate(clientToDelete.client_id)}
          onCancel={() => setClientToDelete(null)}
        />
      )}
    </div>
  );
}
