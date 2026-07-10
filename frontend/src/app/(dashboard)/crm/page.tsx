'use client';

import { useState, useEffect } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useModal } from '@/providers/ModalProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Search, LayoutGrid, List, Filter, X, 
  MapPin, Calendar, DollarSign, UserCheck, Flame, 
  ArrowUpDown, ExternalLink, Globe, Check, Eye, Trash2
} from 'lucide-react';
import Link from 'next/link';
import {
  leads as leadsApi,
  leadStages as stagesApi,
  leadSources as sourcesApi,
  users as usersApi,
  services as servicesApi,
  Lead, LeadStage, LeadSource, User, Service
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const CRM_HOWTO = {
  overview: 'The CRM tracks every potential client (a "lead") from first contact until they become a paying client. Leads move left-to-right through pipeline stages on the Kanban board, and when a deal is agreed you convert the lead into a quote from its detail page.',
  sections: [
    {
      heading: 'Leads vs clients',
      items: [
        'A lead is a company you are still trying to win — it lives here in the CRM.',
        'A client is a company that has agreed to work with you — clients have quotes, invoices, and projects.',
        'A lead becomes a client when you open it and click "Convert to Quote" — do this once the deal is agreed.',
      ],
    },
    {
      heading: 'Getting started',
      items: [
        'Click "Add Lead" and fill in the company, budget, source, and a primary contact.',
        'Assign a Sales Executive so someone clearly owns the follow-up.',
        'Click a lead card to open its detail page, where you log calls, notes, and follow-ups.',
      ],
    },
    {
      heading: 'Working the pipeline',
      items: [
        'In Kanban view, drag a lead card into the next stage column as the deal progresses.',
        'Use the filters to narrow by stage, source, sales exec, priority, temperature, or budget.',
        'Switch to List View for a sortable table of all leads.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Log every call, WhatsApp message, and meeting on the lead’s detail page so the whole team sees the history.',
        'Schedule a follow-up after every conversation — leads go cold when nobody follows up.',
        'Keep the temperature (cold/warm/hot) up to date so hot deals get attention first.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Leaving leads sitting in the first stage for weeks — move them forward or mark them Lost.',
        'Skipping the budget or source when creating a lead, which makes the pipeline KPIs unreliable.',
        'Deleting a dead lead instead of moving it to the Lost stage — deleting erases its history.',
      ],
    },
  ],
};

// ============================================================
// Static option lists
// ============================================================

const TIMEZONES = [
  'Asia/Kolkata',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Singapore',
  'Asia/Dubai'
];

// ============================================================
// Helper: safely get budget from lead (handles both field names)
// ============================================================
function getLeadBudget(lead: Lead): number {
  const raw = (lead as any).estimated_monthly_budget ?? (lead as any).budget ?? 0;
  const num = Number(raw);
  return isNaN(num) ? 0 : num;
}

// ============================================================
// Page Component
// ============================================================

export default function LeadsPage() {
  const { confirm, prompt } = useModal();
  const queryClient = useQueryClient();

  // Layout and view states
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === 'true') {
        setShowCreateModal(true);
        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      }
    }
  }, []);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [execFilter, setExecFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [tempFilter, setTempFilter] = useState('');
  const [budgetRangeFilter, setBudgetRangeFilter] = useState('');

  // Drag and drop states
  const [draggedLeadId, setDraggedLeadId] = useState<number | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);

  // Sorting state for List view
  const [sortField, setSortField] = useState<string>('company_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // ============================================================
  // Queries
  // ============================================================

  const { data: stages = [] } = useQuery<LeadStage[]>({
    queryKey: ['leadStages'],
    queryFn: async () => {
      try {
        const res = await stagesApi.list();
        // Handle both {data: [...]} and direct array responses
        const d = (res as any).data;
        return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []);
      } catch {
        return [];
      }
    }
  });

  const { data: sources = [] } = useQuery<LeadSource[]>({
    queryKey: ['leadSources'],
    queryFn: async () => {
      try {
        const res = await sourcesApi.list();
        const d = (res as any).data;
        return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []);
      } catch {
        return [];
      }
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

  const { data: leads = [], isLoading, isError: leadsLoadError } = useQuery<Lead[]>({
    queryKey: ['leads'],
    queryFn: async () => {
      const res = await leadsApi.list({ per_page: 500 });
      // The axios interceptor keeps the envelope for paginated responses
      // so res.data.data is the array of leads
      const d = (res as any).data;
      if (Array.isArray(d?.data)) return d.data;
      if (Array.isArray(d)) return d;
      return [];
    }
  });

  // ============================================================
  // Mutations
  // ============================================================

  const updateStageMutation = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: number; stageId: number }) => 
      leadsApi.updateStage(leadId, stageId, 'Stage updated via Kanban Drag & Drop'),
    onMutate: async ({ leadId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ['leads'] });
      const previousLeads = queryClient.getQueryData<Lead[]>(['leads']);
      if (previousLeads) {
        queryClient.setQueryData<Lead[]>(
          ['leads'],
          previousLeads.map((lead) => (lead.id === leadId ? { ...lead, stage_id: stageId } : lead))
        );
      }
      return { previousLeads };
    },
    onError: (_err, _newTodo, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(['leads'], context.previousLeads);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  const createLeadMutation = useMutation({
    mutationFn: (data: any) => leadsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowCreateModal(false);
    }
  });

  const deleteLeadMutation = useMutation({
    mutationFn: (id: number) => leadsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  // ============================================================
  // Handlers and Filtering
  // ============================================================

  const handleDragStart = (leadId: number) => {
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, stageId: number) => {
    e.preventDefault();
    setDragOverStageId(stageId);
  };

  const handleDrop = (stageId: number) => {
    if (draggedLeadId !== null) {
      updateStageMutation.mutate({ leadId: draggedLeadId, stageId });
    }
    setDraggedLeadId(null);
    setDragOverStageId(null);
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Resolve Stage/Source/Sales names for UI
  // The API returns stage_id and source_id as top-level numbers
  const getStageObj = (stageId?: number | null) => stages.find((s) => s.id === stageId);
  const getSourceObj = (sourceId?: number | null) => sources.find((s) => s.id === sourceId);
  const getUserObj = (userId?: number | null) => users.find((u) => u.id === userId);

  const enrichedLeads = leads.map((lead) => ({
    ...lead,
    // Normalise: the resource now returns both stage/lead_stage; use whichever is present
    _stageObj: (lead as any).stage ?? (lead as any).lead_stage ?? getStageObj(lead.stage_id),
    _sourceObj: (lead as any).source ?? (lead as any).lead_source ?? getSourceObj((lead as any).source_id ?? (lead as any).lead_source_id),
    _salesExec: (lead as any).sales_exec ?? getUserObj(lead.sales_exec_id),
    _salesHead: (lead as any).sales_head ?? getUserObj(lead.sales_head_id),
    _budget: getLeadBudget(lead),
  }));

  // Filtering leads
  const filteredLeads = enrichedLeads.filter((lead) => {
    // Search match
    if (searchQuery) {
      const companyMatch = lead.company_name.toLowerCase().includes(searchQuery.toLowerCase());
      const contactMatch = (lead.contacts ?? []).some((c: any) => c.name?.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!companyMatch && !contactMatch) return false;
    }

    const leadStageId = lead.stage_id ?? (lead as any)._stageObj?.id;
    const leadSourceId = (lead as any).source_id ?? (lead as any).lead_source_id ?? (lead as any)._sourceObj?.id;

    // Filter match
    if (stageFilter && leadStageId !== parseInt(stageFilter)) return false;
    if (sourceFilter && leadSourceId !== parseInt(sourceFilter)) return false;
    if (execFilter && lead.sales_exec_id !== parseInt(execFilter)) return false;
    if (priorityFilter && lead.priority !== priorityFilter) return false;
    if (tempFilter && lead.temperature !== tempFilter) return false;

    // Budget Filter
    if (budgetRangeFilter) {
      const val = lead._budget;
      if (budgetRangeFilter === 'under_1l' && val >= 100000) return false;
      if (budgetRangeFilter === '1l_5l' && (val < 100000 || val > 500000)) return false;
      if (budgetRangeFilter === '5l_15l' && (val < 500000 || val > 1500000)) return false;
      if (budgetRangeFilter === 'over_15l' && val < 1500000) return false;
    }

    return true;
  });

  // Sorting
  const sortedLeads = [...filteredLeads].sort((a, b) => {
    const valA = sortField === 'budget' ? a._budget : (a as any)[sortField];
    const valB = sortField === 'budget' ? b._budget : (b as any)[sortField];

    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;

    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortOrder === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }
    
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }

    return 0;
  });

  // ============================================================
  // KPI Calculations
  // ============================================================

  const totalLeads = leads.length;

  // Use stage slug-based matching — the resource now returns slug in the stage object
  const getLeadStageSlug = (lead: Lead): string => {
    const stageObj = (lead as any).stage ?? (lead as any).lead_stage ?? getStageObj(lead.stage_id);
    return stageObj?.slug ?? '';
  };

  const newCount = leads.filter((l) => {
    const slug = getLeadStageSlug(l);
    return slug === 'fresh-lead' || slug === 'new';
  }).length;
  const warmCount = leads.filter((l) => l.temperature === 'warm').length;
  const hotCount = leads.filter((l) => l.temperature === 'hot').length;
  const wonCount = leads.filter((l) => getLeadStageSlug(l) === 'won').length;
  const lostCount = leads.filter((l) => getLeadStageSlug(l) === 'lost').length;
  const conversionRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;
  const wonBudgets = leads
    .filter((l) => getLeadStageSlug(l) === 'won')
    .reduce((sum, l) => sum + getLeadBudget(l), 0);
  const avgValue = wonCount > 0 ? Math.round(wonBudgets / wonCount) : 0;

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto' }}>
      
      {/* ── KPI Panels ── */}
      <div className="kpi-grid kpi-grid-6" style={{ marginBottom: '1.5rem', gap: '0.75rem' }}>
        <div className="kpi-card">
          <span className="kpi-label">New Leads</span>
          <div className="kpi-value">{newCount}</div>
          <span className="kpi-trend flat">In Pipeline</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Warm Temperature</span>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>{warmCount}</div>
          <span className="kpi-trend flat">Nurturing</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Hot Temperature</span>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{hotCount}</div>
          <span className="kpi-trend flat">High Priority</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Won Deals</span>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{wonCount}</div>
          <span className="kpi-trend up">+{wonCount} converted</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Lost Leads</span>
          <div className="kpi-value" style={{ color: 'var(--text-muted)' }}>{lostCount}</div>
          <span className="kpi-trend down">Inactive</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Conv. Rate / Avg Value
            <HelpIcon text="Conversion rate = leads in the Won stage ÷ all leads. Avg value = the average budget of those won leads." />
          </span>
          <div className="kpi-value" style={{ fontSize: '1.25rem' }}>
            {conversionRate}% / <span style={{ color: 'var(--success)', fontSize: '1.125rem' }}>{formatCurrency(avgValue)}</span>
          </div>
          <span className="kpi-trend flat">Pipeline Health</span>
        </div>
      </div>

      {/* ── Action Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            CRM Pipeline
            <HelpIcon title="CRM Pipeline" content={{
              what: 'One board for every potential client (lead) — each column is a stage of the sales process, from first contact to Won or Lost.',
              why: 'It shows the whole team which deals are moving, which are stuck, and who owns each one.',
              when: 'Add a lead the moment a company shows interest; drag its card to the next stage after every real step forward.',
              steps: ['Click "Add Lead" to record a new company.', 'Drag the card between stage columns as the deal progresses.', 'Open a card to log calls, notes, and follow-ups, or to convert it to a quote.'],
            }} />
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '2px' }}>
            Manage client acquisitions, track deals, and convert proposals.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <HowToUseGuide moduleKey="crm" title="How the CRM Works" content={CRM_HOWTO} />

          {/* View Toggle */}
          <div style={{ background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', padding: '3px', display: 'flex', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('kanban')}
              className="btn btn-sm"
              style={{
                background: viewMode === 'kanban' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'kanban' ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '0.375rem 0.625rem',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <LayoutGrid size={14} style={{ marginRight: '4px' }} />
              Kanban
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="btn btn-sm"
              style={{
                background: viewMode === 'list' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '0.375rem 0.625rem',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <List size={14} style={{ marginRight: '4px' }} />
              List View
            </button>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            <Plus size={16} /> Add Lead
          </button>
        </div>
      </div>

      {/* ── Advanced Filters Panel ── */}
      <div className="card-elevated" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search company, contact name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '2.25rem', height: '38px', fontSize: '0.875rem' }}
            />
          </div>

          <Filter size={15} style={{ color: 'var(--text-muted)' }} />

          {/* Stage Filter */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="form-input"
            style={{ width: '130px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <HelpIcon text="Stage = how far the lead is in the sales process. Each Kanban column is one stage." />

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="form-input"
            style={{ width: '130px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Executive Filter */}
          <select
            value={execFilter}
            onChange={(e) => setExecFilter(e.target.value)}
            className="form-input"
            style={{ width: '140px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Sales Execs</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="form-input"
            style={{ width: '120px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>

          {/* Temp Filter */}
          <select
            value={tempFilter}
            onChange={(e) => setTempFilter(e.target.value)}
            className="form-input"
            style={{ width: '120px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Temps</option>
            <option value="cold">Cold</option>
            <option value="warm">Warm</option>
            <option value="hot">Hot</option>
          </select>
          <HelpIcon text="Temperature = how ready the lead is to buy. Cold: just exploring. Warm: interested. Hot: close to a decision." />

          {/* Budget Range Filter */}
          <select
            value={budgetRangeFilter}
            onChange={(e) => setBudgetRangeFilter(e.target.value)}
            className="form-input"
            style={{ width: '150px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">Any Budget</option>
            <option value="under_1l">Under ₹1,00,000</option>
            <option value="1l_5l">₹1,00,000 - ₹5,00,000</option>
            <option value="5l_15l">₹5,00,000 - ₹15,00,000</option>
            <option value="over_15l">Over ₹15,00,000</option>
          </select>

          {/* Reset button */}
          {(searchQuery || stageFilter || sourceFilter || execFilter || priorityFilter || tempFilter || budgetRangeFilter) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStageFilter('');
                setSourceFilter('');
                setExecFilter('');
                setPriorityFilter('');
                setTempFilter('');
                setBudgetRangeFilter('');
              }}
              style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', padding: '0.5rem' }}
            >
              <X size={12} /> Clear
            </button>
          )}

        </div>
      </div>

      {/* ── Content View ── */}
      {leadsLoadError && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Couldn&apos;t load leads. The server may be unreachable — try refreshing the page.
        </div>
      )}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', padding: '2rem' }}>
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="animate-pulse" style={{ height: 260, background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        
        // ============================================================
        // KANBAN VIEW
        // ============================================================
        
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '1rem', minHeight: 'calc(100vh - 360px)', alignItems: 'flex-start' }}>
          {stages.sort((a,b) => a.sort_order - b.sort_order).map((stage) => {
            // Match using stage_id from the lead (now reliably returned from API)
            const stageLeads = filteredLeads.filter((l) => {
              const lid = l.stage_id ?? (l as any)._stageObj?.id;
              return lid === stage.id;
            });
            const isOver = dragOverStageId === stage.id;
            return (
              <div
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={() => handleDrop(stage.id)}
                onDragLeave={() => setDragOverStageId(null)}
                style={{
                  width: '280px',
                  minWidth: '280px',
                  background: isOver ? 'var(--surface-hover)' : 'var(--surface)',
                  border: isOver ? '2px dashed var(--accent)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 'calc(100vh - 320px)',
                  transition: 'background var(--transition-fast), border var(--transition-fast)'
                }}
              >
                {/* Stage Header */}
                <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{stage.name}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: '9999px', padding: '1px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {stageLeads.length}
                  </span>
                </div>

                {/* Stage Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {stageLeads.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      No leads in this stage
                    </div>
                  ) : (
                    stageLeads.map((lead) => {
                      const contacts = lead.contacts ?? [];
                      const primaryContact = contacts.find((c: any) => c.is_primary) ?? contacts[0];
                      let tempColor = 'badge-muted';
                      if (lead.temperature === 'warm') tempColor = 'badge-warning';
                      if (lead.temperature === 'hot') tempColor = 'badge-danger';
                      if (lead.temperature === 'cold') tempColor = 'badge-info';

                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={() => handleDragStart(lead.id)}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.875rem',
                            cursor: 'grab'
                          }}
                          onDragEnd={() => setDraggedLeadId(null)}
                          className="crm-kanban-card"
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                            <Link href={`/crm/${lead.id}`} style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }} className="hover:text-accent flex items-center gap-1">
                              {lead.company_name}
                              <ExternalLink size={10} style={{ opacity: 0.5 }} />
                            </Link>
                            <span className={`badge ${tempColor}`} style={{ fontSize: '0.625rem', padding: '1px 5px' }}>
                              {lead.temperature}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.625rem' }}>
                            Contact: {(primaryContact as any)?.name || '—'}
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '0.75rem', alignItems: 'center' }}>
                            <span className="badge badge-accent" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>{lead.priority}</span>
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                              {formatCurrency(lead._budget)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              <Calendar size={11} /> {lead.expected_start_date ? formatDate(lead.expected_start_date as string) : 'No date'}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              <UserCheck size={11} /> {lead._salesExec?.name?.split(' ')[0] ?? 'Unassigned'}
                            </span>
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
      ) : (

        // ============================================================
        // DATATABLE LIST VIEW
        // ============================================================
        
        <div className="data-table-wrap">
          {sortedLeads.length === 0 ? (
            <div className="empty-state" style={{ padding: '4rem 2rem' }}>
              <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>No matching leads found</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Try adjusting your filters or search terms.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('company_name')} style={{ cursor: 'pointer' }}>
                    Company Name <ArrowUpDown size={12} style={{ display: 'inline', marginLeft: '4px' }} />
                  </th>
                  <th>Primary Contact</th>
                  <th onClick={() => toggleSort('temperature')} style={{ cursor: 'pointer' }}>
                    Temp <ArrowUpDown size={12} style={{ display: 'inline', marginLeft: '4px' }} />
                  </th>
                  <th onClick={() => toggleSort('priority')} style={{ cursor: 'pointer' }}>
                    Priority <ArrowUpDown size={12} style={{ display: 'inline', marginLeft: '4px' }} />
                  </th>
                  <th onClick={() => toggleSort('budget')} style={{ cursor: 'pointer' }}>
                    Budget <ArrowUpDown size={12} style={{ display: 'inline', marginLeft: '4px' }} />
                  </th>
                  <th>Expected Start</th>
                  <th>Stage</th>
                  <th>Source</th>
                  <th>Assigned Sales Exec</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedLeads.map((lead) => {
                  const contacts = lead.contacts ?? [];
                  const primaryContact = contacts.find((c: any) => c.is_primary) ?? contacts[0];
                  let tempClass = 'badge-muted';
                  if (lead.temperature === 'hot') tempClass = 'badge-danger';
                  if (lead.temperature === 'warm') tempClass = 'badge-warning';
                  if (lead.temperature === 'cold') tempClass = 'badge-info';

                  return (
                    <tr key={lead.id}>
                      <td style={{ fontWeight: 600 }}>
                        <Link href={`/crm/${lead.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }} className="hover:text-accent">
                          {lead.company_name}
                          {lead.website_url && (
                            <span onClick={(e) => { e.stopPropagation(); window.open(lead.website_url, '_blank'); }} style={{ color: 'var(--text-muted)' }} className="hover:text-primary">
                              <Globe size={11} />
                            </span>
                          )}
                        </Link>
                      </td>
                      <td>
                        <div>
                          <div style={{ fontSize: '0.875rem' }}>{(primaryContact as any)?.name || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(primaryContact as any)?.email || '—'}</div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${tempClass}`}>{lead.temperature}</span>
                      </td>
                      <td>
                        <span className="badge badge-accent">{lead.priority}</span>
                      </td>
                      <td style={{ fontWeight: 500, fontFamily: 'monospace' }}>
                        {formatCurrency(lead._budget)}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {lead.expected_start_date ? formatDate(lead.expected_start_date as string) : '—'}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: lead._stageObj?.color, display: 'inline-block' }} />
                          {lead._stageObj?.name || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {lead._sourceObj?.name || '—'}
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>
                        {lead._salesExec?.name || 'Unassigned'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                          <Link href={`/crm/${lead.id}`} className="btn btn-ghost btn-sm btn-icon" title="View details">
                            <Eye size={13} />
                          </Link>
                          <button
                            onClick={async () => {
                              if (await confirm({ message: 'Are you sure you want to delete this lead?', variant: 'danger' })) {
                                deleteLeadMutation.mutate(lead.id);
                              }
                            }}
                            className="btn btn-danger btn-sm btn-icon"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ============================================================
          CREATE LEAD MODAL (SLIDE-OVER PANEL)
          ============================================================ */}
      {showCreateModal && (
        <>
          <div className="overlay" onClick={() => setShowCreateModal(false)} />
          <div
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: '100%', maxWidth: '640px',
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              zIndex: 51,
              display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
              animation: 'slideInRight 0.25s ease',
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>Create New Lead</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Fill in deal parameters and contacts.</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="btn btn-ghost btn-icon" style={{ borderRadius: '50%' }}>
                <X size={18} />
              </button>
            </div>

            {/* Error display */}
            {createLeadMutation.isError && (
              <div style={{ padding: '0.75rem 1.5rem', background: 'var(--danger-subtle)', borderBottom: '1px solid var(--danger)', color: 'var(--danger)', fontSize: '0.875rem' }}>
                ⚠ Failed to create lead. Please check all required fields and try again.
              </div>
            )}

            {/* Modal Body (Scrollable form) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                
                const selectedServiceIds: number[] = [];
                catalogServices.forEach(s => {
                  if (formData.get(`service_${s.id}`) === 'on') {
                    selectedServiceIds.push(s.id);
                  }
                });

                // Build primary contact object
                const primaryContactName = formData.get('contact_name') as string;
                const primaryContact = primaryContactName ? {
                  name: primaryContactName,
                  designation: formData.get('contact_designation') as string || '',
                  email: formData.get('contact_email') as string || '',
                  phone: formData.get('contact_phone') as string || '',
                  whatsapp: formData.get('contact_whatsapp') as string || '',
                  notes: formData.get('contact_notes') as string || '',
                  is_primary: true,
                } : null;

                // Read secondary contacts
                const secondaryContacts: any[] = [];
                const secContactCount = parseInt(formData.get('sec_contact_count') as string || '0', 10);
                for (let i = 0; i < secContactCount; i++) {
                  const name = formData.get(`sec_name_${i}`) as string;
                  if (name) {
                    secondaryContacts.push({
                      name,
                      designation: formData.get(`sec_designation_${i}`) as string || '',
                      email: formData.get(`sec_email_${i}`) as string || '',
                      phone: formData.get(`sec_phone_${i}`) as string || '',
                      whatsapp: formData.get(`sec_whatsapp_${i}`) as string || '',
                      notes: formData.get(`sec_notes_${i}`) as string || '',
                      is_primary: false,
                    });
                  }
                }

                // Build contacts array for backend
                const contacts: any[] = [];
                if (primaryContact) contacts.push(primaryContact);
                secondaryContacts.forEach(sc => contacts.push(sc));

                const budgetRaw = formData.get('budget') as string;
                const budgetVal = parseFloat(budgetRaw) || 0;

                const postData: any = {
                  company_name: formData.get('company_name') as string,
                  website_url: formData.get('website_url') as string || undefined,
                  // Send BOTH field names so backend normalizer picks it up
                  budget: budgetVal,
                  estimated_monthly_budget: budgetVal,
                  timezone: formData.get('timezone') as string,
                  expected_start_date: formData.get('expected_start_date') as string || undefined,
                  priority: formData.get('priority') as string,
                  temperature: formData.get('temperature') as string,
                  // Send BOTH source field names
                  source_id: parseInt(formData.get('source_id') as string || '0', 10) || undefined,
                  lead_source_id: parseInt(formData.get('source_id') as string || '0', 10) || undefined,
                  stage_id: parseInt(formData.get('stage_id') as string || '0', 10) || undefined,
                  sales_exec_id: formData.get('sales_exec_id') ? parseInt(formData.get('sales_exec_id') as string, 10) : undefined,
                  sales_head_id: formData.get('sales_head_id') ? parseInt(formData.get('sales_head_id') as string, 10) : undefined,
                  // Contacts as array (backend normalizer also accepts primary_contact separately)
                  contacts: contacts,
                  primary_contact: primaryContact,
                  secondary_contacts: secondaryContacts,
                  interested_service_ids: selectedServiceIds,
                  notes: formData.get('notes') as string || undefined,
                };

                createLeadMutation.mutate(postData);
              }}
              style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
            >
              
              {/* SECTION: Company Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '0.04em' }}>1. Company Info</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="form-label">Company Name *</label>
                    <input required type="text" name="company_name" className="form-input" placeholder="e.g. Initech Corp" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Website URL</label>
                    <input type="url" name="website_url" className="form-input" placeholder="e.g. https://initech.biz" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Budget (INR) *
                      <HelpIcon text="The lead's estimated monthly budget. Powers the pipeline value KPIs and the budget filter — an estimate is fine." />
                    </label>
                    <input required type="number" name="budget" min="0" className="form-input" placeholder="e.g. 1200000" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Timezone</label>
                    <select name="timezone" className="form-input" defaultValue="Asia/Kolkata">
                      {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="form-label">Expected Start Date</label>
                    <input type="date" name="expected_start_date" className="form-input" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select name="priority" className="form-input" defaultValue="medium">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Temperature
                      <HelpIcon text="How ready the lead is to buy. Cold: just exploring. Warm: interested. Hot: close to a decision." />
                    </label>
                    <select name="temperature" className="form-input" defaultValue="warm">
                      <option value="cold">Cold</option>
                      <option value="warm">Warm</option>
                      <option value="hot">Hot</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Source *
                      <HelpIcon text="Where this lead came from (referral, website, ads...). Used in reports to see which channels bring the best leads." />
                    </label>
                    <select required name="source_id" className="form-input">
                      <option value="">Select Source</option>
                      {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Pipeline Stage
                      <HelpIcon text="Where the lead starts on the Kanban board. Usually the first stage — you can drag it forward later." />
                    </label>
                    <select name="stage_id" className="form-input">
                      <option value="">Select Stage</option>
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Sales Executive
                      <HelpIcon text="The team member who owns this lead and does the follow-ups. Their name shows on the lead's card." />
                    </label>
                    <select name="sales_exec_id" className="form-input">
                      <option value="">Select Executive</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="form-label">Sales Head</label>
                    <select name="sales_head_id" className="form-input">
                      <option value="">Select Sales Head</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">WhatsApp Number</label>
                    <input type="text" name="whatsapp_number" className="form-input" placeholder="+91 99999 88888" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea name="notes" rows={2} className="form-input" placeholder="Initial notes about this lead..." style={{ resize: 'none' }} />
                </div>
              </div>

              {/* SECTION: Interested Services */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '0.04em' }}>2. Interested Services</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {catalogServices.length === 0 ? (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No services in the catalog yet.</span>
                  ) : catalogServices.map((srv) => (
                    <label key={srv.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <input type="checkbox" name={`service_${srv.id}`} style={{ accentColor: 'var(--accent)' }} />
                      {srv.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* SECTION: Primary Contact Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '0.04em' }}>3. Primary Contact</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="form-label">Contact Name</label>
                    <input type="text" name="contact_name" className="form-input" placeholder="e.g. Richard Hendricks" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Designation</label>
                    <input type="text" name="contact_designation" className="form-input" placeholder="e.g. Technical Director" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input type="email" name="contact_email" className="form-input" placeholder="richard@hooli.xyz" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input type="text" name="contact_phone" className="form-input" placeholder="+1 555 123 4567" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">WhatsApp Number</label>
                  <input type="text" name="contact_whatsapp" className="form-input" placeholder="WhatsApp (if same or different)" />
                </div>

                <div className="form-group">
                  <label className="form-label">Contact Notes</label>
                  <textarea name="contact_notes" rows={2} className="form-input" placeholder="Any initial notes about the contact..." style={{ resize: 'none' }} />
                </div>
              </div>

              {/* SECTION: Secondary Contacts */}
              <SecondaryContactsSection />

              {/* Submit Buttons */}
              <div style={{ padding: '1.25rem 0 0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLeadMutation.isPending}
                  className="btn btn-primary"
                >
                  {createLeadMutation.isPending ? 'Creating...' : 'Create Lead'}
                </button>
              </div>

            </form>
          </div>
        </>
      )}

    </div>
  );
}

// ── Secondary Contacts Section (Stateful Helper) ──────────────────
function SecondaryContactsSection() {
  const [contacts, setContacts] = useState<number[]>([]);

  const addContact = () => {
    setContacts([...contacts, contacts.length]);
  };

  const removeContact = (idx: number) => {
    setContacts(contacts.filter(item => item !== idx));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      <input type="hidden" name="sec_contact_count" value={contacts.length} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '0.04em' }}>4. Secondary Contacts</h3>
        <button type="button" onClick={addContact} className="btn btn-secondary btn-sm">
          + Add Contact
        </button>
      </div>

      {contacts.map((cIdx, i) => (
        <div key={cIdx} style={{ padding: '1rem', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Secondary Contact #{i+1}</span>
            <button type="button" onClick={() => removeContact(cIdx)} style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>
              Remove
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input required type="text" name={`sec_name_${cIdx}`} className="form-input" style={{ background: 'var(--surface)' }} placeholder="Name" />
            </div>
            <div className="form-group">
              <label className="form-label">Designation</label>
              <input type="text" name={`sec_designation_${cIdx}`} className="form-input" style={{ background: 'var(--surface)' }} placeholder="e.g. VP Marketing" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" name={`sec_email_${cIdx}`} className="form-input" style={{ background: 'var(--surface)' }} placeholder="email@domain.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input type="text" name={`sec_phone_${cIdx}`} className="form-input" style={{ background: 'var(--surface)' }} placeholder="+1..." />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">WhatsApp</label>
            <input type="text" name={`sec_whatsapp_${cIdx}`} className="form-input" style={{ background: 'var(--surface)' }} placeholder="WhatsApp" />
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea name={`sec_notes_${cIdx}`} rows={1} className="form-input" style={{ background: 'var(--surface)', resize: 'none' }} placeholder="Notes..." />
          </div>
        </div>
      ))}
    </div>
  );
}
