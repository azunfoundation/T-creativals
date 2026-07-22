'use client';

import { use, useState, useEffect } from 'react'; 
import { useToast } from '@/hooks/useToast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, Star, Phone, MessageSquareCode, Mail, FileText, 
  Users, Flag, UserCheck, Info, Check, Plus, Trash2, Edit2, 
  ExternalLink, Calendar, Globe
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  leads as leadsApi,
  users as usersApi,
  leadStages as stagesApi,
  services as servicesApi,
  clientsApi,
  Lead, LeadContact, LeadActivity, User, LeadStage, Service, ClientReportRow,
  getApiErrorMessage
} from '@/lib/api';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const CRM_LEAD_DETAIL_HOWTO = {
  overview: 'This page is one lead’s full record: its contacts, budget, and interested services on the left, a timeline of every interaction in the middle, and pipeline actions on the right. Use it to log calls and notes, schedule follow-ups, move the deal through stages, and finally convert the lead into a quote.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Check the left panel for the lead’s budget, priority, temperature, and contact people.',
        'Assign a Sales Executive and Sales Head so ownership is clear — reassignments are logged automatically.',
        'Tick the services the lead cares about under "Interested Services".',
      ],
    },
    {
      heading: 'Logging activity',
      items: [
        'Pick a tab (Call, WhatsApp, Meeting, Note, or Follow-up), type what happened, and click "Log Activity".',
        'A Follow-up also needs a due date — it then appears under "Pending Follow-ups" until you tick it complete.',
        'Everything you log shows in the Activity Timeline, newest first, with who logged it and when.',
      ],
    },
    {
      heading: 'Moving the deal forward',
      items: [
        'Change the "Deal Pipeline Stage" dropdown as the deal progresses — the stage change is logged for you.',
        'When the deal is agreed, click "Convert to Quote" to start building the quote.',
        'Converting can create a client account from the primary contact (they need an email) or link to an existing client.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Log activity right after each call or meeting, while the details are fresh.',
        'Schedule the next follow-up before you leave the page — that is what keeps deals moving.',
        'Keep the primary contact’s email filled in; it is required to create a client account at conversion.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Converting before the scope is agreed — conversion locks in the lead details and starts the quote process.',
        'Letting follow-ups pile up unticked — mark them complete so the list only shows real pending work.',
        'Deleting contacts down to zero — a lead must always keep at least one contact.',
      ],
    },
  ],
};

// ============================================================
// Activity Feed Helpers
// ============================================================

const ACTIVITY_CONFIG = {
  call:              { icon: Phone,              color: 'text-blue-400',       bg: 'rgba(59,130,246,0.1)' },
  whatsapp:          { icon: MessageSquareCode,  color: 'text-emerald-400',    bg: 'rgba(16,185,129,0.1)' },
  email:             { icon: Mail,               color: 'text-purple-400',     bg: 'rgba(168,85,247,0.1)' },
  note:              { icon: FileText,           color: 'text-yellow-400',     bg: 'rgba(234,179,8,0.1)' },
  meeting:           { icon: Users,              color: 'text-indigo-400',     bg: 'rgba(99,102,241,0.1)' },
  stage_change:      { icon: Flag,               color: 'text-amber-400',      bg: 'rgba(245,158,11,0.1)' },
  assignment_change: { icon: UserCheck,          color: 'text-gray-400',       bg: 'rgba(156,163,175,0.1)' },
  system_event:      { icon: Info,               color: 'text-cyan-400',       bg: 'rgba(6,182,212,0.1)' },
  lead_converted:    { icon: UserCheck,          color: 'text-emerald-400',    bg: 'rgba(16,185,129,0.1)' },
};

// ============================================================
// Main Component
// ============================================================

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { showToast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Unwrap parameters
  const resolvedParams = use(params);
  const leadId = parseInt(resolvedParams.id, 10);

  // UI state
  const [activeTab, setActiveTab] = useState<'call' | 'whatsapp' | 'meeting' | 'note' | 'followup'>('call');
  const [activityText, setActivityText] = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [quoteName, setQuoteName] = useState('');
  const [quoteValidity, setQuoteValidity] = useState('');
  const [clientMode, setClientMode] = useState<'new' | 'existing'>('new');
  const [selectedClientId, setSelectedClientId] = useState<number | ''>('');

  // Contacts editing states
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [editContactForm, setEditContactForm] = useState<Partial<LeadContact>>({});
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContactForm, setNewContactForm] = useState<Partial<LeadContact>>({
    name: '', designation: '', email: '', phone: '', whatsapp: '', notes: '', is_primary: false
  });

  // ============================================================
  // Queries
  // ============================================================

  const { data: lead, isLoading, isError } = useQuery<Lead>({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      // Never substitute a fake lead — editing/logging against a mock entity
      // silently loses real work. Let the error state render instead.
      const res = await leadsApi.get(leadId);
      // Axios interceptor unwraps {data: {...}} → res.data for non-paginated
      const d = (res as any).data;
      if (!d) throw new Error('Lead not found.');
      return d;
    }
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        const res = await usersApi.list({ per_page: 100 });
        return (res as any).data?.data ?? (res as any).data ?? [];
      } catch {
        return [];
      }
    }
  });

  const { data: stages = [] } = useQuery<LeadStage[]>({
    queryKey: ['leadStages'],
    queryFn: async () => {
      try {
        const res = await stagesApi.list();
        const d = (res as any).data;
        return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []);
      } catch {
        return [];
      }
    }
  });

  const { data: catalogServices = [] } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => {
      try {
        const res = await servicesApi.list();
        const d = (res as any).data;
        return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []);
      } catch {
        return [];
      }
    }
  });

  // Sourced from the Clients module endpoint (clients.view) — the reports
  // endpoint used before requires reports.* permissions that sales execs
  // don't hold, so the "use existing client" dropdown was silently empty
  // for them (the catch masked the 403 as no clients).
  const { data: existingClients = [], isError: isClientsError } = useQuery<ClientReportRow[]>({
    queryKey: ['clients_directory', 'convert-picker'],
    queryFn: async () => {
      const res = await clientsApi.list();
      return res.data?.breakdown ?? [];
    },
    enabled: showConvertModal,
  });

  // Initialize Quote Conversion fields
  useEffect(() => {
    if (lead) {
      setQuoteName(`${lead.company_name} - Brand & Web Strategy Quote`);
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 30);
      setQuoteValidity(defaultDate.toISOString().split('T')[0]);
    }
  }, [lead]);

  // ============================================================
  // Mutations
  // ============================================================

  const updateLeadMutation = useMutation({
    mutationFn: (data: any) => leadsApi.update(leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  const logActivityMutation = useMutation({
    mutationFn: (data: any) => leadsApi.logActivity(leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      setActivityText('');
      setFollowupDate('');
    }
  });

  const completeFollowupMutation = useMutation({
    mutationFn: (followupId: number) => leadsApi.completeFollowup(leadId, followupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to mark follow-up as complete.'), 'info');
    }
  });

  const convertLeadMutation = useMutation({
    mutationFn: (data: any) => leadsApi.convert(leadId, data),
    onSuccess: (res) => {
      setShowConvertModal(false);
      // The API returns {message, quote_id, quote_number}
      // Axios interceptor unwraps .data.data when present; for non-envelope responses it leaves as-is
      const payload = (res as any).data;
      const quoteId = payload?.quote_id ?? payload?.data?.quote_id;
      if (quoteId) {
        router.push(`/quotes/${quoteId}`);
      } else {
        router.push('/quotes');
      }
    },
    onError: (err: any) => {
      const msg = getApiErrorMessage(err, 'Failed to convert lead. Please try again.');
      showToast(`Error: ${msg}`, 'info');
    }
  });

  if (isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '0.75rem' }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Couldn&apos;t load this lead</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          It may have been deleted, or the server is unreachable.
        </div>
        <Link href="/crm" className="btn btn-secondary" style={{ marginTop: '0.5rem' }}>
          Back to CRM
        </Link>
      </div>
    );
  }

  if (isLoading || !lead) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '50vh' }}>
        <div style={{ color: 'var(--text-muted)' }}>Loading lead details...</div>
      </div>
    );
  }

  // ============================================================
  // Process Timeline & Follow-ups
  // ============================================================

  // Activities sorted in reverse chronological order
  const sortedActivities = [...lead.activities].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Pending follow-ups lists
  const pendingFollowups = (lead.followups || []).filter((f) => !f.is_completed);

  const primaryContact = lead.contacts.find((c) => c.is_primary) || lead.contacts[0];
  const canCreateNewClient = !!primaryContact?.email;

  // ============================================================
  // Contact Actions
  // ============================================================

  const handleTogglePrimary = (contactId: number) => {
    const updatedContacts = lead.contacts.map((c) => ({
      ...c,
      is_primary: c.id === contactId
    }));
    updateLeadMutation.mutate({ contacts: updatedContacts });
  };

  const handleEditContactClick = (contact: LeadContact) => {
    setEditingContactId(contact.id);
    setEditContactForm(contact);
  };

  const handleSaveContactEdit = () => {
    if (!editContactForm.name) return;
    const updatedContacts = lead.contacts.map((c) => 
      c.id === editingContactId ? { ...c, ...editContactForm } : c
    );
    updateLeadMutation.mutate({ contacts: updatedContacts });
    setEditingContactId(null);
  };

  const handleDeleteContact = (contactId: number) => {
    if (lead.contacts.length <= 1) {
      showToast('Must have at least one contact.', 'info');
      return;
    }
    const updatedContacts = lead.contacts.filter((c) => c.id !== contactId);
    // Ensure one contact is primary
    if (!updatedContacts.some((c) => c.is_primary)) {
      updatedContacts[0].is_primary = true;
    }
    updateLeadMutation.mutate({ contacts: updatedContacts });
  };

  const handleAddContact = () => {
    if (!newContactForm.name) return;
    
    const newContact: LeadContact = {
      id: Date.now(), // Local temporary ID for mock
      lead_id: leadId,
      name: newContactForm.name,
      designation: newContactForm.designation || '',
      email: newContactForm.email || '',
      phone: newContactForm.phone || '',
      whatsapp: newContactForm.whatsapp || '',
      notes: newContactForm.notes || '',
      is_primary: !!newContactForm.is_primary
    };

    let updatedContacts = [...lead.contacts];
    if (newContact.is_primary) {
      updatedContacts = updatedContacts.map((c) => ({ ...c, is_primary: false }));
    }
    updatedContacts.push(newContact);

    updateLeadMutation.mutate({ contacts: updatedContacts });
    setIsAddingContact(false);
    setNewContactForm({ name: '', designation: '', email: '', phone: '', whatsapp: '', notes: '', is_primary: false });
  };

  // ============================================================
  // Services Update
  // ============================================================

  const handleServiceChange = (serviceId: number, checked: boolean) => {
    let ids = [...(lead.interested_service_ids || [])];
    if (checked) {
      ids.push(serviceId);
    } else {
      ids = ids.filter((id) => id !== serviceId);
    }
    updateLeadMutation.mutate({ interested_service_ids: ids });
  };

  // ============================================================
  // Activity Logging
  // ============================================================

  const handleLogActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityText.trim()) return;

    if (activeTab === 'followup') {
      logActivityMutation.mutate({
        type: 'meeting',
        description: `Scheduled Follow-up: ${activityText}`,
        due_at: followupDate || new Date(Date.now() + 86400000).toISOString(),
      });
    } else {
      logActivityMutation.mutate({
        type: activeTab,
        description: activityText,
      });
    }
  };

  const handleCompleteFollowup = (followupId: number) => {
    completeFollowupMutation.mutate(followupId);
  };

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto' }}>
      
      {/* ── Breadcrumb Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <Link href="/crm" className="btn btn-secondary btn-icon" style={{ borderRadius: '50%', padding: '0.375rem' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leads / Details</span>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1px' }}>
            {lead.company_name}
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: stages.find(s => s.id === lead.stage_id)?.color || 'var(--accent)' }} />
            <HelpIcon title="Lead Detail" content={{
              what: 'The full record for this one lead: contacts and details on the left, the activity timeline in the middle, and pipeline actions on the right.',
              why: 'Anyone on the team can open this page and instantly see the whole history of the deal and what happens next.',
              when: 'Come here after every call, message, or meeting with this lead to log it and schedule the next follow-up.',
            }} />
          </h1>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <HowToUseGuide moduleKey="crm-lead-detail" title="How the Lead Page Works" content={CRM_LEAD_DETAIL_HOWTO} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* ============================================================
            LEFT PANEL: Profile & Contacts (lg:col-span-3)
            ============================================================ */}
        <div className="xl:col-span-3 flex flex-col gap-5">
          
          {/* Metadata Card */}
          <div className="card">
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.875rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              Lead Meta List
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Website</div>
                {lead.website_url ? (
                  <a href={lead.website_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '3px' }} className="hover:underline">
                    {lead.website_url.replace('https://', '').replace('http://', '')}
                    <ExternalLink size={10} />
                  </a>
                ) : (
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>—</span>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Timezone</div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Globe size={12} /> {lead.timezone || 'Asia/Kolkata'}
                </span>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Priority</div>
                <span className="badge badge-accent" style={{ marginTop: '2px' }}>{lead.priority}</span>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Temperature
                  <HelpIcon text="How ready this lead is to buy. Cold: just exploring. Warm: interested. Hot: close to a decision." />
                </div>
                <span className={`badge ${lead.temperature === 'hot' ? 'badge-danger' : lead.temperature === 'warm' ? 'badge-warning' : 'badge-info'}`} style={{ marginTop: '2px' }}>
                  {lead.temperature}
                </span>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Monthly Budget
                  <HelpIcon text="The lead's estimated monthly spend, entered when the lead was created. An estimate, not a commitment." />
                </div>
                <span style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace' }}>
                  {formatCurrency(Number((lead as any).estimated_monthly_budget ?? (lead as any).budget ?? 0) || 0)}
                </span>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expected Start Date</div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Calendar size={12} /> {lead.expected_start_date ? formatDate(lead.expected_start_date) : '—'}
                </span>
              </div>
            </div>

            {/* Assignments Section */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }} className="flex flex-col gap-3">
              <div className="form-group">
                <label className="form-label">Sales Executive</label>
                <select
                  value={lead.sales_exec_id || ''}
                  onChange={(e) => {
                    const execId = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    const execName = e.target.value ? users.find(u => u.id === execId)?.name : 'Unassigned';
                    updateLeadMutation.mutate({ sales_exec_id: execId });
                    logActivityMutation.mutate({
                      type: 'assignment_change',
                      description: `Reassigned Sales Executive to: ${execName}`,
                    });
                  }}
                  className="form-input"
                  style={{ height: '34px', fontSize: '0.8125rem', padding: '0 0.5rem' }}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Sales Head</label>
                <select
                  value={lead.sales_head_id || ''}
                  onChange={(e) => {
                    const headId = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    const headName = e.target.value ? users.find(u => u.id === headId)?.name : 'Unassigned';
                    updateLeadMutation.mutate({ sales_head_id: headId });
                    logActivityMutation.mutate({
                      type: 'assignment_change',
                      description: `Reassigned Sales Head to: ${headName}`,
                    });
                  }}
                  className="form-input"
                  style={{ height: '34px', fontSize: '0.8125rem', padding: '0 0.5rem' }}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Interested Services Checklist */}
          <div className="card">
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.875rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Interested Services
              <HelpIcon text="Tick the services this lead wants. It saves instantly and helps the team prepare the right quote." />
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {catalogServices.length === 0 ? (
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No services in the catalog yet.</span>
              ) : catalogServices.map((service) => {
                const isChecked = (lead.interested_service_ids || []).includes(service.id);
                return (
                  <label key={service.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => handleServiceChange(service.id, e.target.checked)}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    {service.name}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Contacts Section */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Contacts
                <HelpIcon text="People at the lead's company. The starred contact is primary — their email is used to create the client account when you convert this lead." />
              </h2>
              <button
                onClick={() => setIsAddingContact(!isAddingContact)}
                style={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}
              >
                <Plus size={12} /> Add
              </button>
            </div>

            {/* ADD INLINE FORM */}
            {isAddingContact && (
              <div style={{ padding: '0.75rem', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>New Contact</div>
                <input
                  type="text"
                  placeholder="Name *"
                  value={newContactForm.name}
                  onChange={(e) => setNewContactForm({ ...newContactForm, name: e.target.value })}
                  className="form-input"
                  style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                />
                <input
                  type="text"
                  placeholder="Designation"
                  value={newContactForm.designation}
                  onChange={(e) => setNewContactForm({ ...newContactForm, designation: e.target.value })}
                  className="form-input"
                  style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newContactForm.email}
                  onChange={(e) => setNewContactForm({ ...newContactForm, email: e.target.value })}
                  className="form-input"
                  style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={newContactForm.phone}
                  onChange={(e) => setNewContactForm({ ...newContactForm, phone: e.target.value })}
                  className="form-input"
                  style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                />
                <input
                  type="text"
                  placeholder="WhatsApp"
                  value={newContactForm.whatsapp}
                  onChange={(e) => setNewContactForm({ ...newContactForm, whatsapp: e.target.value })}
                  className="form-input"
                  style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newContactForm.is_primary}
                    onChange={(e) => setNewContactForm({ ...newContactForm, is_primary: e.target.checked })}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  Mark Primary
                </label>
                <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                  <button onClick={() => setIsAddingContact(false)} className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Cancel</button>
                  <button onClick={handleAddContact} className="btn btn-primary btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Save</button>
                </div>
              </div>
            )}

            {/* CONTACTS LIST */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {lead.contacts.map((contact) => {
                const isEditing = editingContactId === contact.id;
                return (
                  <div 
                    key={contact.id} 
                    style={{ 
                      padding: '0.75rem', 
                      borderRadius: 'var(--radius-md)', 
                      background: 'var(--surface-elevated)', 
                      border: contact.is_primary ? '1px solid var(--accent)' : '1px solid var(--border)',
                      position: 'relative'
                    }}
                  >
                    {isEditing ? (
                      /* EDITING CONTACT INLINE FORM */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <input
                          type="text"
                          value={editContactForm.name || ''}
                          onChange={(e) => setEditContactForm({ ...editContactForm, name: e.target.value })}
                          className="form-input"
                          style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                          placeholder="Name"
                        />
                        <input
                          type="text"
                          value={editContactForm.designation || ''}
                          onChange={(e) => setEditContactForm({ ...editContactForm, designation: e.target.value })}
                          className="form-input"
                          style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                          placeholder="Designation"
                        />
                        <input
                          type="email"
                          value={editContactForm.email || ''}
                          onChange={(e) => setEditContactForm({ ...editContactForm, email: e.target.value })}
                          className="form-input"
                          style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                          placeholder="Email"
                        />
                        <input
                          type="text"
                          value={editContactForm.phone || ''}
                          onChange={(e) => setEditContactForm({ ...editContactForm, phone: e.target.value })}
                          className="form-input"
                          style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                          placeholder="Phone"
                        />
                        <input
                          type="text"
                          value={editContactForm.whatsapp || ''}
                          onChange={(e) => setEditContactForm({ ...editContactForm, whatsapp: e.target.value })}
                          className="form-input"
                          style={{ height: '28px', fontSize: '0.75rem', background: 'var(--surface)' }}
                          placeholder="WhatsApp"
                        />
                        <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                          <button onClick={() => setEditingContactId(null)} className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Cancel</button>
                          <button onClick={handleSaveContactEdit} className="btn btn-primary btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Save</button>
                        </div>
                      </div>
                    ) : (
                      /* RENDER CONTACT DETAIL */
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            {contact.name}
                            {contact.is_primary && (
                              <span title="Primary contact">
                                <Star size={11} fill="var(--warning)" color="var(--warning)" />
                              </span>
                            )}
                          </span>
                          
                          <div style={{ display: 'flex', gap: '3px' }}>
                            {!contact.is_primary && (
                              <button 
                                onClick={() => handleTogglePrimary(contact.id)}
                                style={{ color: 'var(--text-muted)' }} 
                                className="hover:text-warning"
                                title="Make primary"
                              >
                                <Star size={11} />
                              </button>
                            )}
                            <button onClick={() => handleEditContactClick(contact)} style={{ color: 'var(--text-muted)' }} className="hover:text-primary" title="Edit inline">
                              <Edit2 size={11} />
                            </button>
                            <button onClick={() => handleDeleteContact(contact.id)} style={{ color: 'var(--text-muted)' }} className="hover:text-danger" title="Delete contact">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>

                        {contact.designation && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{contact.designation}</div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.375rem' }}>
                          {contact.email && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Mail size={10} style={{ color: 'var(--text-muted)' }} />
                              <a href={`mailto:${contact.email}`} className="hover:text-accent truncate" style={{ maxWidth: '160px' }}>{contact.email}</a>
                            </div>
                          )}
                          {contact.phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Phone size={10} style={{ color: 'var(--text-muted)' }} />
                              <span>{contact.phone}</span>
                            </div>
                          )}
                          {contact.whatsapp && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <MessageSquareCode size={10} style={{ color: 'var(--success)' }} />
                              <span>{contact.whatsapp}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ============================================================
            CENTER PANEL: Activity Timeline (lg:col-span-6)
            ============================================================ */}
        <div className="xl:col-span-6 flex flex-col gap-6">
          
          {/* Quick Logger Form */}
          <div className="card">
            {/* Tabs Header */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto' }}>
              {(['call', 'whatsapp', 'meeting', 'note', 'followup'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ textTransform: 'capitalize' }}
                >
                  {tab === 'followup' ? 'Follow-up' : tab}
                </button>
              ))}
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <HelpIcon text="Pick the type of interaction, describe what happened, and click Log Activity. Follow-up also needs a due date and lands in Pending Follow-ups." />
              </span>
            </div>

            {/* Tabs Body Form */}
            <form onSubmit={handleLogActivity} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div className="form-group">
                <textarea
                  required
                  rows={3}
                  value={activityText}
                  onChange={(e) => setActivityText(e.target.value)}
                  placeholder={
                    activeTab === 'call' ? 'Log notes from phone call...' :
                    activeTab === 'whatsapp' ? 'Paste WhatsApp message text or summary...' :
                    activeTab === 'meeting' ? 'Write summary of meeting agreements...' :
                    activeTab === 'followup' ? 'What needs to be done next?...' :
                    'Type a general internal note...'
                  }
                  className="form-input"
                  style={{ resize: 'none', fontSize: '0.875rem' }}
                />
              </div>

              {activeTab === 'followup' && (
                <div className="form-group">
                  <label className="form-label">Due Date for Follow-up *</label>
                  <input
                    required
                    type="datetime-local"
                    value={followupDate}
                    onChange={(e) => setFollowupDate(e.target.value)}
                    className="form-input"
                    style={{ fontSize: '0.875rem' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={logActivityMutation.isPending}
                  className="btn btn-primary"
                  style={{ padding: '0.375rem 1rem', fontSize: '0.8125rem' }}
                >
                  {logActivityMutation.isPending ? 'Logging...' : 'Log Activity'}
                </button>
              </div>
            </form>
          </div>

          {/* Timeline Feed */}
          <div className="card">
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Activity Timeline
              <HelpIcon text="Every call, note, meeting, stage change, and reassignment on this lead — newest first. Stage and assignment changes are added automatically." />
            </h2>

            {sortedActivities.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No activity has been logged yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative', paddingLeft: '1rem', borderLeft: '1px solid var(--border)' }}>
                {sortedActivities.map((act) => {
                  const config = ACTIVITY_CONFIG[act.type] || ACTIVITY_CONFIG.system_event;
                  const Icon = config.icon;
                  return (
                    <div key={act.id} style={{ position: 'relative' }}>
                      
                      {/* Timeline node icon */}
                      <div 
                        style={{ 
                          position: 'absolute', left: '-1.5rem', top: '2px', 
                          width: '18px', height: '18px', borderRadius: '50%',
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'currentColor' }} className={config.color} />
                      </div>

                      {/* Timeline content body */}
                      <div style={{ paddingLeft: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Icon size={12} className={config.color} />
                            {act.type.replace('_', ' ')}
                          </span>
                          {act.user && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              by {act.user.name}
                            </span>
                          )}
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {formatRelativeTime(act.created_at)}
                          </span>
                        </div>

                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                          {act.description}
                        </p>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ============================================================
            RIGHT PANEL: Actions & Follow-ups (lg:col-span-3)
            ============================================================ */}
        <div className="xl:col-span-3 flex flex-col gap-6">
          
          {/* Main Actions */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Pipeline Actions
              <HelpIcon title="Pipeline Actions" content={{
                what: 'Move this lead to another pipeline stage, or convert it into a quote once the deal is agreed.',
                when: 'Change the stage after each real step forward. Convert only when the client has agreed to move ahead — a lead can be converted once.',
                steps: ['Pick the new stage in the dropdown — the change is logged in the timeline.', 'Click "Convert to Quote" when the deal is ready.', 'Choose to create a client from the primary contact or link an existing client, then confirm.'],
              }} />
            </h2>
            
            {/* Current Stage */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Deal Pipeline Stage
                <HelpIcon text="Changing this moves the lead's card on the CRM Kanban board and logs a stage-change entry in the timeline." />
              </label>
              <select
                value={lead?.stage_id ?? ''}
                onChange={(e) => {
                  const targetStageId = parseInt(e.target.value, 10);
                  const stageName = stages.find(s => s.id === targetStageId)?.name || 'Unknown';
                  updateLeadMutation.mutate({ stage_id: targetStageId });
                  logActivityMutation.mutate({
                    type: 'stage_change',
                    description: `Moved stage to: ${stageName}`,
                  });
                }}
                className="form-input font-medium"
                style={{ height: '38px', fontSize: '0.875rem' }}
              >
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Convert to Quote Trigger */}
            {lead.is_converted ? (
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span>This lead has already been converted to a quote.</span>
                {lead.converted_client_id && (
                  <Link href={`/clients/${lead.converted_client_id}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    Open the client account created from this lead →
                  </Link>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowConvertModal(true)}
                className="btn btn-primary w-full"
                style={{ padding: '0.625rem' }}
              >
                <UserCheck size={16} /> Convert to Quote
              </button>
            )}
          </div>

          {/* Follow-up Widget */}
          <div className="card">
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.875rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Pending Follow-ups
              <HelpIcon text="Follow-ups you schedule from the Follow-up tab appear here with their due date. Tick the box once you've done one." />
            </h2>

            {pendingFollowups.length === 0 ? (
              <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                No pending follow-ups scheduled.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pendingFollowups.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      padding: '0.625rem',
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex', gap: '8px', alignItems: 'flex-start'
                    }}
                  >
                    <button
                      onClick={() => handleCompleteFollowup(f.id)}
                      disabled={completeFollowupMutation.isPending}
                      style={{
                        marginTop: '2px', width: 14, height: 14, border: '1px solid var(--text-muted)',
                        borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--success)'
                      }}
                      className="hover:border-green-500"
                      title="Mark complete"
                    >
                      <Check size={10} style={{ opacity: 0 }} className="hover:opacity-100" />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                        {f.description.replace('Follow-up scheduled: ', '')}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--warning)', fontSize: '0.6875rem', marginTop: '4px' }}>
                        <Calendar size={10} />
                        <span>{f.scheduled_at ? formatDate(f.scheduled_at) : ''}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ============================================================
          CONVERT TO QUOTE MODAL (DIALOG)
          ============================================================ */}
      {showConvertModal && (
        <div className="overlay animate-fade-in" style={{ zIndex: 100 }}>
          <div className="modal animate-slide-up" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserCheck size={18} style={{ color: 'var(--accent)' }} />
                Convert Lead to Quote
              </span>
              <button onClick={() => setShowConvertModal(false)} className="btn btn-ghost btn-icon" style={{ borderRadius: '50%', padding: '4px' }}>
                ✕
              </button>
            </div>
            
            <form
              onSubmit={(e) => {
                e.preventDefault();
                convertLeadMutation.mutate({
                  // Backend expects 'quote_title', not 'quote_name'
                  quote_title: quoteName,
                  valid_until: quoteValidity,
                  client_id: clientMode === 'existing' && selectedClientId ? Number(selectedClientId) : undefined,
                });
              }}
            >
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  This will freeze the lead parameter specifications and initiate the agency quote building process.
                </p>

                <div className="form-group">
                  <label className="form-label">Quote Blueprint Name *</label>
                  <input
                    required
                    type="text"
                    value={quoteName}
                    onChange={(e) => setQuoteName(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Validity Period Date *</label>
                  <input
                    required
                    type="date"
                    value={quoteValidity}
                    onChange={(e) => setQuoteValidity(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Client Account</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setClientMode('new')}
                      className={`btn btn-sm ${clientMode === 'new' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      Create from contact
                    </button>
                    <button
                      type="button"
                      onClick={() => setClientMode('existing')}
                      className={`btn btn-sm ${clientMode === 'existing' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      Use existing client
                    </button>
                  </div>

                  {clientMode === 'new' ? (
                    canCreateNewClient ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        A client account will be created for <strong>{primaryContact?.name}</strong> ({primaryContact?.email}) and linked to this quote.
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>
                        The primary contact has no email address. Add one, or switch to &quot;Use existing client&quot;, before converting.
                      </p>
                    )
                  ) : (
                    <select
                      required
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : '')}
                      className="form-input"
                    >
                      <option value="">Select a client...</option>
                      {existingClients.map((c) => (
                        <option key={c.client_id} value={c.client_id}>{c.client_name} ({c.client_email})</option>
                      ))}
                    </select>
                  )}
                  {isClientsError && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.375rem' }}>
                      Couldn't load the client list — close and reopen this dialog to retry.
                    </p>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowConvertModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={convertLeadMutation.isPending || (clientMode === 'new' ? !canCreateNewClient : !selectedClientId)}
                  className="btn btn-primary"
                >
                  {convertLeadMutation.isPending ? 'Generating...' : 'Initiate Quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
