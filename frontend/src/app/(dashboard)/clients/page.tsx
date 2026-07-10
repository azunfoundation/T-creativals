'use client';

import { useState, useEffect } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useModal } from '@/providers/ModalProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building2, Users, CreditCard, Banknote, Plus, Search, 
  ExternalLink, Mail, Phone, Trash2, ShieldAlert, X, Eye, Shield,
  Edit2, MessageSquare, Calendar, Activity, Check, AlertCircle, PlusCircle
} from 'lucide-react';
import { reports as reportsApi, users as usersApi, roles as rolesApi, clientsApi, getApiErrorMessage } from '@/lib/api';
import type { ClientReportRow, User, Role, ClientCommunication } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useToast } from '@/hooks/useToast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const CLIENTS_HOWTO = {
  overview: 'A client record is the company or person you do work for. Projects and invoices are linked to a client, so every bill, payment, and project can be traced back to the right account. This page lists all clients with their projects, billing totals, health score, and portal access.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Click "Invite Client User" and enter the client\'s name, email, and an initial password — the email and password are their login for the client portal.',
        'Add a client before creating their first project or invoice, so those records can be linked to them.',
        'Use the eye button on a row to open full details, and the pencil button to edit name, email, phone, or status.',
        'In the details panel, use the "Communication Logs" tab to record calls, emails, and meetings with the client.',
      ],
    },
    {
      heading: 'Reading the table',
      items: [
        'Health Score starts at 100 and drops for overdue invoices, on-hold or cancelled projects, and unpaid balance — green is healthy, red needs attention.',
        'The Portal Access toggle controls whether the client can log into the client portal. Switch it off to block their login instantly.',
        '"Amount Billed" is everything invoiced to the client, "Amount Collected" is what they have paid, and "Outstanding Balance" is the gap still owed.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Log every important call or meeting in Communication Logs so teammates can see the full history.',
        'Keep the client\'s email address correct — it doubles as their portal login.',
        'Set clients you no longer work with to "Inactive" instead of deleting them, so their billing history stays intact.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Deleting a client to "clean up" — deletion is permanent and also removes their communication logs.',
        'Creating duplicates with slightly different names — search the list first before inviting a new client.',
        'Leaving the default initial password unchanged — set a proper one and ask the client to change it after first login.',
      ],
    },
  ],
};

export default function ClientsPage() {
  const { confirm, prompt } = useModal();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('password');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteError, setInviteError] = useState('');

  // View details state
  const [selectedClient, setSelectedClient] = useState<ClientReportRow | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'comms'>('overview');

  // Edit client state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive' | 'suspended'>('active');
  const [editPortalAccess, setEditPortalAccess] = useState(false);
  const [editRoleId, setEditRoleId] = useState<number | null>(null);
  const [editError, setEditError] = useState('');

  // Delete confirmation state
  const [clientToDelete, setClientToDelete] = useState<ClientReportRow | null>(null);

  // Communication logs states
  const [newCommType, setNewCommType] = useState<'call' | 'email' | 'meeting' | 'other'>('call');
  const [newCommSubject, setNewCommSubject] = useState('');
  const [newCommContent, setNewCommContent] = useState('');
  const [newCommDate, setNewCommDate] = useState(() => new Date().toISOString().slice(0, 16));

  // Fetch client directory details using reports API
  const { data: reportData, isLoading, isError: isReportsError, refetch } = useQuery({
    queryKey: ['reports_clients'],
    queryFn: async () => {
      const res = await reportsApi.getClients();
      return res.data;
    }
  });

  const { data: roles = [], isError: isRolesError } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await rolesApi.list();
      return res.data as Role[];
    }
  });

  const loadError = isReportsError || isRolesError;

  // Fetch single user details to check/assign roles
  const { data: userDetails } = useQuery({
    queryKey: ['user_details', selectedClient?.client_id],
    queryFn: async () => {
      if (!selectedClient) return null;
      const res = await usersApi.show(selectedClient.client_id);
      // The global axios interceptor already unwraps response.data.data -> response.data
      // when there's no pagination meta, so res.data is already the flat User object
      // (the declared `{ data: User }` return type reflects the pre-interceptor shape).
      return res.data as unknown as User;
    },
    enabled: !!selectedClient && showEditModal,
  });

  // Automatically update the edit role ID state when details load
  useEffect(() => {
    if (userDetails && showEditModal) {
      setEditRoleId(userDetails.roles?.[0]?.id || null);
    }
  }, [userDetails, showEditModal]);

  // Fetch communication logs for selected client
  const { data: communications = [], refetch: refetchCommunications, isLoading: isLoadingComms } = useQuery({
    queryKey: ['client_communications', selectedClient?.client_id],
    queryFn: async () => {
      if (!selectedClient) return [];
      const res = await clientsApi.listCommunications(selectedClient.client_id);
      return res.data;
    },
    enabled: !!selectedClient && showDetailsModal && detailTab === 'comms',
  });

  // Invite client mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: any) => {
      const clientRole = roles.find(r => r.name === 'client');
      const role_ids = clientRole ? [clientRole.id] : [];
      
      return usersApi.create({
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone || undefined,
        status: 'active',
        role_ids,
        department_ids: [],
        is_client_portal_user: true
      });
    },
    onSuccess: () => {
      refetch();
      setShowInviteModal(false);
      setInviteName('');
      setInviteEmail('');
      setInvitePhone('');
      setInviteError('');
      showToast('Client invited successfully', 'success');
    },
    onError: (err: any) => {
      const msg = getApiErrorMessage(err, 'Failed to invite client user.');
      setInviteError(msg);
    }
  });

  // Portal access inline toggle mutation
  const portalMutation = useMutation({
    mutationFn: async ({ clientId, is_client_portal_user }: { clientId: number; is_client_portal_user: boolean }) => {
      return usersApi.update(clientId, { is_client_portal_user });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports_clients'] });
      showToast('Portal access updated successfully', 'success');
      if (selectedClient) {
        setSelectedClient(prev => prev ? { ...prev, is_client_portal_user: !prev.is_client_portal_user } : null);
      }
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to update portal access'), 'error');
    }
  });

  // Update client mutation
  const updateClientMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!selectedClient) throw new Error('No client selected');
      return usersApi.update(selectedClient.client_id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports_clients'] });
      setShowEditModal(false);
      showToast('Client details updated successfully', 'success');
    },
    onError: (err: any) => {
      setEditError(getApiErrorMessage(err, 'Failed to update client details.'));
    }
  });

  // Delete client mutation
  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: number) => {
      return usersApi.delete(clientId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports_clients'] });
      setClientToDelete(null);
      setShowDetailsModal(false);
      showToast('Client deleted successfully', 'success');
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to delete client'), 'error');
      setClientToDelete(null);
    }
  });

  // Add communication log mutation
  const addCommMutation = useMutation({
    mutationFn: async (data: { type: string; subject: string; content?: string; communication_date: string }) => {
      if (!selectedClient) throw new Error('No client selected');
      return clientsApi.createCommunication(selectedClient.client_id, data);
    },
    onSuccess: () => {
      refetchCommunications();
      setNewCommSubject('');
      setNewCommContent('');
      setNewCommDate(new Date().toISOString().slice(0, 16));
      showToast('Communication log added successfully', 'success');
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to add communication log'), 'error');
    }
  });

  // Delete communication log mutation
  const deleteCommMutation = useMutation({
    mutationFn: async (commId: number) => {
      if (!selectedClient) throw new Error('No client selected');
      return clientsApi.deleteCommunication(selectedClient.client_id, commId);
    },
    onSuccess: () => {
      refetchCommunications();
      showToast('Communication log deleted successfully', 'success');
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to delete communication log'), 'error');
    }
  });

  const clients = reportData?.breakdown || [];
  const summary = reportData?.summary || { total_clients: 0, total_active: 0, total_billed: 0 };

  const totalOutstanding = clients.reduce((sum, c) => sum + (c.total_outstanding || 0), 0);
  const totalPaid = clients.reduce((sum, c) => sum + (c.total_paid || 0), 0);

  const filteredClients = clients.filter(c => 
    c.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.client_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError('Name and Email are required.');
      return;
    }
    inviteMutation.mutate({
      name: inviteName,
      email: inviteEmail,
      password: invitePassword,
      phone: invitePhone
    });
  };

  const handleViewDetails = (c: ClientReportRow) => {
    setSelectedClient(c);
    setDetailTab('overview');
    setShowDetailsModal(true);
  };

  const handleEditClient = (c: ClientReportRow) => {
    setSelectedClient(c);
    setEditName(c.client_name);
    setEditEmail(c.client_email);
    setEditPhone(c.phone || '');
    setEditStatus(c.status);
    setEditPortalAccess(c.is_client_portal_user);
    setEditRoleId(null);
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editEmail.trim()) {
      setEditError('Name and Email are required.');
      return;
    }
    updateClientMutation.mutate({
      name: editName,
      email: editEmail,
      phone: editPhone || undefined,
      status: editStatus,
      is_client_portal_user: editPortalAccess,
      role_ids: editRoleId ? [editRoleId] : undefined,
    });
  };

  const handleDeleteClick = (c: ClientReportRow) => {
    setClientToDelete(c);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 className="text-accent" size={24} />
            Client Registry
            <HelpIcon title="Clients" content={{
              what: 'The list of companies and people you do work for. Each row is one client account with their projects, billing totals, and portal access.',
              why: 'Projects and invoices are linked to a client, so keeping this list accurate keeps billing and reporting accurate too.',
              when: 'Add a client here (via "Invite Client User") before creating their first project or invoice.',
            }} />
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Manage your client accounts, view project statistics, and track billing history.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <HowToUseGuide moduleKey="clients" title="How Clients Work" content={CLIENTS_HOWTO} />
          <button
            onClick={() => setShowInviteModal(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={16} /> Invite Client User
          </button>
        </div>
      </div>

      {loadError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)',
          borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8125rem', flexShrink: 0
        }}>
          <AlertCircle size={16} />
          Couldn't load client directory data. Check your connection and refresh the page.
        </div>
      )}

      {/* Stats Cards */}
      <div className="kpi-grid kpi-grid-4">
        <div className="kpi-card">
          <span className="kpi-label">Total Clients</span>
          <span className="kpi-value">{summary.total_clients}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <Users size={12} /> {summary.total_active} active project accounts
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Total Billed</span>
          <span className="kpi-value">{formatCurrency(summary.total_billed)}</span>
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            All project invoice records
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Collected Amount</span>
          <span className="kpi-value text-success">{formatCurrency(totalPaid)}</span>
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Collection Rate: <span className="text-success font-bold">{summary.total_billed > 0 ? Math.round((totalPaid / summary.total_billed) * 100) : 0}%</span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Outstanding Balance</span>
          <span className="kpi-value text-warning">{formatCurrency(totalOutstanding)}</span>
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Unpaid aging receivables
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by client name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '2.25rem', width: '100%' }}
          />
        </div>
      </div>

      {/* Directory Table */}
      <div className="data-table-wrap">
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', animation: 'pulse 1.5s infinite' }}>Loading Client Directory...</div>
        ) : filteredClients.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Building2 style={{ margin: '0 auto', width: '3rem', height: '3rem', color: 'var(--border)' }} />
            <h3 className="font-semibold text-primary">No Clients Found</h3>
            <p style={{ fontSize: '0.75rem' }}>Try adjusting your query or invite a client account.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client Organization</th>
                <th>Active / Total Projects</th>
                <th>Health Score <HelpIcon text="Starts at 100 and drops for overdue invoices (-10 each), on-hold projects (-15 each), cancelled projects (-30 each), and a high unpaid balance. Green = healthy, red = needs attention." size={12} /></th>
                <th>Portal Access <HelpIcon text="Whether this client can log into the client portal. Click the toggle to allow or block their login instantly." size={12} /></th>
                <th>Amount Billed</th>
                <th>Amount Collected</th>
                <th>Outstanding Balance</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => (
                <tr key={c.client_id}>
                  <td>
                    <div className="font-semibold text-primary">{c.client_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{c.client_email}</div>
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
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        portalMutation.mutate({ clientId: c.client_id, is_client_portal_user: !c.is_client_portal_user });
                      }}
                      disabled={portalMutation.isPending}
                      style={{
                        position: 'relative',
                        width: '40px',
                        height: '22px',
                        borderRadius: '11px',
                        background: c.is_client_portal_user ? 'var(--success)' : 'var(--border)',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '2px',
                      }}
                    >
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: '#fff',
                          transform: c.is_client_portal_user ? 'translateX(18px)' : 'translateX(0px)',
                          transition: 'transform 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                      />
                    </button>
                  </td>
                  <td className="font-bold text-primary">{formatCurrency(c.total_billed)}</td>
                  <td className="font-semibold text-success">{formatCurrency(c.total_paid || 0)}</td>
                  <td className="font-semibold">
                    {c.total_outstanding > 0 ? (
                      <span className="text-warning">{formatCurrency(c.total_outstanding)}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>— Cleared</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleViewDetails(c)}
                        className="btn btn-icon"
                        title="View Details"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleEditClient(c)}
                        className="btn btn-icon"
                        title="Edit Client"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(c)}
                        className="btn btn-icon text-danger"
                        title="Delete Client"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Client Modal */}
      {showInviteModal && (
        <div className="overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2">
                <Shield className="text-accent" size={20} />
                Invite Client User
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

              <form onSubmit={handleInviteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Client / Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Stark Enterprises"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Client Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. client@domain.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Initial Password *
                    <HelpIcon text="The temporary password the client uses for their first portal login (with their email). Share it with them securely and ask them to change it after logging in." size={12} />
                  </label>
                  <input
                    type="password"
                    required
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 99999 88888"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="modal-footer" style={{ padding: '1.25rem 0 0 0', borderTop: '1px solid var(--border)', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteMutation.isPending}
                    className="btn btn-primary"
                  >
                    {inviteMutation.isPending ? 'Inviting...' : 'Invite Client'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditModal && selectedClient && (
        <div className="overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2">
                <Edit2 className="text-accent" size={20} />
                Edit Client: {selectedClient.client_name}
              </h3>
              <button onClick={() => setShowEditModal(false)} className="btn btn-icon">
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

              <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Client Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email *</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Status
                    <HelpIcon text="Active = a current client. Inactive = no longer working together (keeps their history — prefer this over deleting). Suspended = temporarily blocked from the account." size={12} />
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="form-input"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Role Assignment
                    <HelpIcon text="Controls what this user can see and do in the system. Client accounts should normally keep the 'Client' role — only change this if you know why." size={12} />
                  </label>
                  <select
                    value={editRoleId || ''}
                    onChange={(e) => setEditRoleId(Number(e.target.value) || null)}
                    className="form-input"
                  >
                    <option value="">Select Role...</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.display_name || r.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginTop: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Client Portal Access</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Allow this client to login to the portal.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditPortalAccess(!editPortalAccess)}
                    style={{
                      position: 'relative',
                      width: '40px',
                      height: '22px',
                      borderRadius: '11px',
                      background: editPortalAccess ? 'var(--success)' : 'var(--border)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '2px',
                    }}
                  >
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: '#fff',
                        transform: editPortalAccess ? 'translateX(18px)' : 'translateX(0px)',
                        transition: 'transform 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                    />
                  </button>
                </div>

                <div className="modal-footer" style={{ padding: '1.25rem 0 0 0', borderTop: '1px solid var(--border)', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateClientMutation.isPending}
                    className="btn btn-primary"
                  >
                    {updateClientMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Details Slide-Over */}
      {showDetailsModal && selectedClient && (
        <div 
          className="overlay" 
          onClick={() => setShowDetailsModal(false)}
          style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'stretch' }}
        >
          <div 
            style={{
              width: '650px',
              maxWidth: '100%',
              background: 'var(--surface-elevated)',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInRight 0.25s ease-out',
              boxShadow: 'var(--shadow-lg)',
              height: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ 
                  display: 'inline-block', 
                  padding: '0.25rem 0.5rem', 
                  borderRadius: 'var(--radius-sm)', 
                  fontSize: '0.675rem', 
                  fontWeight: 700, 
                  textTransform: 'uppercase',
                  background: selectedClient.status === 'active' ? 'var(--success-subtle)' : 'var(--danger-subtle)',
                  color: selectedClient.status === 'active' ? 'var(--success)' : 'var(--danger)',
                  marginBottom: '0.5rem'
                }}>
                  {selectedClient.status}
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedClient.client_name}</h2>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Mail size={14} /> {selectedClient.client_email}</span>
                  {selectedClient.phone && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Phone size={14} /> {selectedClient.phone}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="btn btn-icon">
                <X size={20} />
              </button>
            </div>

            {/* Quick Metrics Grid */}
            <div style={{ padding: '1.25rem 1.5rem', background: 'var(--background)', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Projects</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedClient.active_projects} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ {selectedClient.total_projects} total</span>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Collected / Billed</span>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success)' }}>
                  {formatCurrency(selectedClient.total_paid)} <span style={{ fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ {formatCurrency(selectedClient.total_billed)}</span>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Outstanding</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: selectedClient.total_outstanding > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                  {formatCurrency(selectedClient.total_outstanding)}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={() => setDetailTab('overview')}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: detailTab === 'overview' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: detailTab === 'overview' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Overview & Metrics
              </button>
              <button
                onClick={() => setDetailTab('comms')}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: detailTab === 'comms' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: detailTab === 'comms' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                <MessageSquare size={16} /> Communication Logs
              </button>
            </div>

            {/* Tab Contents */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {detailTab === 'overview' ? (
                <>
                  {/* Health Score Panel */}
                  <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg)', background: 'var(--background)', border: '1px solid var(--border)', display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: selectedClient.health_score >= 80 ? 'var(--success-subtle)' : selectedClient.health_score >= 50 ? 'var(--warning-subtle)' : 'var(--danger-subtle)',
                      border: `2px solid ${selectedClient.health_score >= 80 ? 'var(--success)' : selectedClient.health_score >= 50 ? 'var(--warning)' : 'var(--danger)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: selectedClient.health_score >= 80 ? 'var(--success)' : selectedClient.health_score >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                        {selectedClient.health_score}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>Client Health Score</h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Dynamically calculated based on overdue invoices, on-hold or cancelled projects, and outstanding balance ratio.
                      </p>
                      
                      {/* Breakdown description */}
                      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                          <span>Base Score</span>
                          <span style={{ fontWeight: 600, color: 'var(--success)' }}>100 pts</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                          <span>Overdue Invoices (-10 pts each)</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Applicable</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                          <span>On-Hold Projects (-15 pts each)</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Applicable</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                          <span>Cancelled Projects (-30 pts each)</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Applicable</span>
                        </div>
                        {selectedClient.total_billed > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem' }}>
                            <span>Outstanding Ratio Deduction</span>
                            <span style={{ fontWeight: 600, color: 'var(--danger)' }}>
                              -{Math.round((selectedClient.total_outstanding / selectedClient.total_billed) * 20)} pts
                            </span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.25rem', fontSize: '0.825rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Final Health Score</span>
                          <span style={{ fontWeight: 700, color: selectedClient.health_score >= 80 ? 'var(--success)' : selectedClient.health_score >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                            {selectedClient.health_score} / 100
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Portal Access Control */}
                  <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg)', background: 'var(--background)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Shield size={16} className="text-accent" /> Client Portal Login Access
                      </h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Allow this client user to log into the Creativals OS Client Portal.
                      </p>
                    </div>
                    <button
                      onClick={() => portalMutation.mutate({ clientId: selectedClient.client_id, is_client_portal_user: !selectedClient.is_client_portal_user })}
                      disabled={portalMutation.isPending}
                      style={{
                        position: 'relative',
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        background: selectedClient.is_client_portal_user ? 'var(--success)' : 'var(--border)',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '2px',
                      }}
                    >
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: '#fff',
                          transform: selectedClient.is_client_portal_user ? 'translateX(20px)' : 'translateX(0px)',
                          transition: 'transform 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                      />
                    </button>
                  </div>

                  {/* Dates & Quick Stats */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>Account History</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ padding: '0.75rem 1rem', background: 'var(--background)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Last Invoice Date</span>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                          {selectedClient.last_invoice_date ? new Date(selectedClient.last_invoice_date).toLocaleDateString() : 'No invoices yet'}
                        </div>
                      </div>
                      <div style={{ padding: '0.75rem 1rem', background: 'var(--background)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Last Payment Date</span>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                          {selectedClient.last_payment_date ? new Date(selectedClient.last_payment_date).toLocaleDateString() : 'No payments yet'}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Communications History Tab */}
                  
                  {/* Add New Log Form */}
                  <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg)', background: 'var(--background)', border: '1px solid var(--border)' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <PlusCircle size={16} className="text-accent" /> Log New Interaction
                    </h4>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!newCommSubject.trim()) return;
                      addCommMutation.mutate({
                        type: newCommType,
                        subject: newCommSubject,
                        content: newCommContent,
                        communication_date: newCommDate,
                      });
                    }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</label>
                          <select
                            value={newCommType}
                            onChange={(e) => setNewCommType(e.target.value as any)}
                            className="form-input"
                            style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.825rem' }}
                          >
                            <option value="call">Call Log</option>
                            <option value="email">Email Follow-up</option>
                            <option value="meeting">Meeting Note</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Date & Time</label>
                          <input
                            type="datetime-local"
                            value={newCommDate}
                            onChange={(e) => setNewCommDate(e.target.value)}
                            className="form-input"
                            style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.825rem' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Subject *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Discussed contract extension details"
                          value={newCommSubject}
                          onChange={(e) => setNewCommSubject(e.target.value)}
                          className="form-input"
                          style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.825rem' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Summary / Notes</label>
                        <textarea
                          placeholder="Write key discussion points, next steps..."
                          value={newCommContent}
                          onChange={(e) => setNewCommContent(e.target.value)}
                          className="form-input"
                          style={{ minHeight: '80px', padding: '0.5rem', fontSize: '0.825rem', resize: 'vertical' }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={addCommMutation.isPending || !newCommSubject.trim()}
                        className="btn btn-primary"
                        style={{ alignSelf: 'flex-end', height: '36px', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1rem', fontSize: '0.825rem' }}
                      >
                        {addCommMutation.isPending ? 'Logging...' : 'Save Interaction'}
                      </button>
                    </form>
                  </div>

                  {/* History Timeline */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>Timeline Activity</h4>
                    
                    {isLoadingComms ? (
                      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>Loading interaction timeline...</div>
                    ) : communications.length === 0 ? (
                      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem', background: 'var(--background)', borderRadius: 'var(--radius-md)', border: '1px dotted var(--border)' }}>
                        No interaction history recorded for this client.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {communications.map((comm) => {
                          const CommIcon = comm.type === 'call' ? Phone : comm.type === 'email' ? Mail : comm.type === 'meeting' ? Users : MessageSquare;
                          return (
                            <div key={comm.id} style={{ display: 'flex', gap: '0.75rem', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: comm.type === 'call' ? 'rgba(59, 130, 246, 0.1)' : comm.type === 'email' ? 'rgba(16, 185, 129, 0.1)' : comm.type === 'meeting' ? 'rgba(124, 58, 237, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                color: comm.type === 'call' ? 'var(--info)' : comm.type === 'email' ? 'var(--success)' : comm.type === 'meeting' ? 'var(--accent)' : 'var(--text-secondary)'
                              }}>
                                <CommIcon size={16} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                                      {comm.type} — {new Date(comm.communication_date).toLocaleString()}
                                    </span>
                                    <h5 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{comm.subject}</h5>
                                  </div>
                                  <button
                                    onClick={async () => {
                                      if (await confirm({ message: 'Are you sure you want to delete this log?', variant: 'danger' })) {
                                        deleteCommMutation.mutate(comm.id);
                                      }
                                    }}
                                    className="btn btn-icon text-danger"
                                    style={{ padding: '0.25rem' }}
                                    title="Delete Log"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                                {comm.content && (
                                  <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.5rem', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                                    {comm.content}
                                  </p>
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
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Client Confirmation Modal */}
      {clientToDelete && (
        <ConfirmModal
          title="Delete Client"
          message={`Are you sure you want to delete client "${clientToDelete.client_name}"? This action will permanently remove the client and their communication logs. It cannot be undone.`}
          confirmLabel="Delete Client"
          cancelLabel="Cancel"
          danger={true}
          onConfirm={() => deleteClientMutation.mutate(clientToDelete.client_id)}
          onCancel={() => setClientToDelete(null)}
        />
      )}
    </div>
  );
}
