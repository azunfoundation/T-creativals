'use client';

import { useState, useEffect } from 'react';
import { useModal } from '@/providers/ModalProvider';
import { useToast } from '@/hooks/useToast';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, LayoutGrid, List, X, RotateCcw, Tag,
  UserPlus, Flame, Trophy, XCircle, TrendingUp,
  ArrowUpRight, ArrowDownRight, ArrowUpDown,
  Globe, Eye, Trash2,
  Users, Briefcase, IndianRupee, BarChart3, Upload, Layers,
  Phone, MessageCircle, Mail, StickyNote, CalendarClock,
  ArrowRightCircle, UserCheck, Sparkles, CheckCircle2, Lightbulb
} from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
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

const STAGE_DESCRIPTIONS: Record<string, string> = {
  'fresh-lead': 'Newly added leads',
  'new': 'Newly added leads',
  'warm-lead': 'Contacted & interested',
  'hot-lead': 'Proposal / negotiation',
  'quote-sent': 'Quote shared',
  'invoice-sent': 'Payment pending',
  'won': 'Converted',
  'lost': 'Not converted',
  'future-interest': 'Revisit later',
};

const SERVICE_TAG_CLASSES = ['badge-success', 'badge-warning', 'badge-info', 'badge-accent', 'badge-danger'];

const ACTIVITY_ICONS: Record<string, { icon: React.ComponentType<any>; color: string; bg: string }> = {
  call: { icon: Phone, color: 'var(--info)', bg: 'var(--info-subtle)' },
  whatsapp: { icon: MessageCircle, color: 'var(--success)', bg: 'var(--success-subtle)' },
  email: { icon: Mail, color: 'var(--info)', bg: 'var(--info-subtle)' },
  note: { icon: StickyNote, color: 'var(--warning)', bg: 'var(--warning-subtle)' },
  meeting: { icon: CalendarClock, color: 'var(--accent)', bg: 'var(--accent-subtle)' },
  stage_change: { icon: ArrowRightCircle, color: 'var(--warning)', bg: 'var(--warning-subtle)' },
  assignment_change: { icon: UserCheck, color: 'var(--info)', bg: 'var(--info-subtle)' },
  system_event: { icon: Sparkles, color: 'var(--accent)', bg: 'var(--accent-subtle)' },
  lead_converted: { icon: Trophy, color: 'var(--success)', bg: 'var(--success-subtle)' },
};

const DAY_MS = 86_400_000;

// ============================================================
// Helpers
// ============================================================

function getLeadBudget(lead: Lead): number {
  const raw = (lead as any).estimated_monthly_budget ?? (lead as any).budget ?? 0;
  const num = Number(raw);
  return isNaN(num) ? 0 : num;
}

function budgetRangeLabel(value: number): string {
  if (value <= 0) return 'Budget TBD';
  if (value < 50_000) return '₹0 - ₹50K';
  if (value < 100_000) return '₹50K - ₹1L';
  if (value < 500_000) return '₹1L - ₹5L';
  if (value < 1_500_000) return '₹5L - ₹15L';
  return '₹15L+';
}

/** % change of items dated in the last 7 days vs the 7 days before. Null when both windows are empty. */
function pctChangeOverWeek(dates: (string | undefined)[]): number | null {
  const now = Date.now();
  let last = 0;
  let prev = 0;
  dates.forEach((s) => {
    if (!s) return;
    const t = new Date(s).getTime();
    if (isNaN(t)) return;
    if (t >= now - 7 * DAY_MS) last++;
    else if (t >= now - 14 * DAY_MS) prev++;
  });
  if (last === 0 && prev === 0) return null;
  if (prev === 0) return 100;
  return Math.round(((last - prev) / prev) * 100);
}

function formatDateTime(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

// ============================================================
// Page Component
// ============================================================

export default function LeadsPage() {
  const { confirm } = useModal();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canCreate = user?.permissions?.includes('leads.create') ?? false;
  const canEdit   = user?.permissions?.includes('leads.edit')   ?? false;
  const canDelete = user?.permissions?.includes('leads.delete') ?? false;
  const canConvert = user?.permissions?.includes('leads.convert') ?? false;

  // Layout and view states
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStageId, setCreateStageId] = useState<number | null>(null);
  const [trendDays, setTrendDays] = useState(7);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [showAllReminders, setShowAllReminders] = useState(false);

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

  // Workspace state
  const { getPagePreference, setPagePreference, isLoaded: workspaceLoaded } = useWorkspace();
  const [isInitialized, setIsInitialized] = useState(false);

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

  // Hydrate workspace preferences
  useEffect(() => {
    if (!workspaceLoaded || isInitialized) return;
    const saved = getPagePreference<any>('crm', null);
    if (saved) {
      if (saved.viewMode) setViewMode(saved.viewMode);
      if (saved.searchQuery != null) setSearchQuery(String(saved.searchQuery));
      if (saved.stageFilter != null) setStageFilter(String(saved.stageFilter));
      if (saved.sourceFilter != null) setSourceFilter(String(saved.sourceFilter));
      if (saved.execFilter != null) setExecFilter(String(saved.execFilter));
      if (saved.priorityFilter != null) setPriorityFilter(String(saved.priorityFilter));
      if (saved.tempFilter != null) setTempFilter(String(saved.tempFilter));
      if (saved.budgetRangeFilter != null) setBudgetRangeFilter(String(saved.budgetRangeFilter));
      if (saved.sortField) setSortField(saved.sortField);
      if (saved.sortOrder) setSortOrder(saved.sortOrder);
    }
    setIsInitialized(true);
  }, [workspaceLoaded, isInitialized, getPagePreference]);

  // Persist workspace preferences
  useEffect(() => {
    if (!isInitialized) return;
    setPagePreference('crm', {
      viewMode,
      searchQuery,
      stageFilter,
      sourceFilter,
      execFilter,
      priorityFilter,
      tempFilter,
      budgetRangeFilter,
      sortField,
      sortOrder,
    });
  }, [
    isInitialized,
    viewMode,
    searchQuery,
    stageFilter,
    sourceFilter,
    execFilter,
    priorityFilter,
    tempFilter,
    budgetRangeFilter,
    sortField,
    sortOrder,
    setPagePreference,
  ]);

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

  const openCreateModal = (stageId?: number) => {
    setCreateStageId(stageId ?? null);
    setShowCreateModal(true);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStageFilter('');
    setSourceFilter('');
    setExecFilter('');
    setPriorityFilter('');
    setTempFilter('');
    setBudgetRangeFilter('');
  };

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

  const freshLeads = leads.filter((l) => {
    const slug = getLeadStageSlug(l);
    return slug === 'fresh-lead' || slug === 'new';
  });
  const warmLeads = leads.filter((l) => l.temperature === 'warm');
  const hotLeads = leads.filter((l) => l.temperature === 'hot');
  const wonLeads = leads.filter((l) => getLeadStageSlug(l) === 'won');
  const lostLeads = leads.filter((l) => getLeadStageSlug(l) === 'lost');

  const newCount = freshLeads.length;
  const warmCount = warmLeads.length;
  const hotCount = hotLeads.length;
  const wonCount = wonLeads.length;
  const lostCount = lostLeads.length;
  const conversionRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;
  const wonBudgetTotal = wonLeads.reduce((sum, l) => sum + getLeadBudget(l), 0);
  const avgDealValue = wonCount > 0 ? Math.round(wonBudgetTotal / wonCount) : 0;

  // Week-over-week trends (created/closed in last 7 days vs the 7 days before)
  const newTrend = pctChangeOverWeek(leads.map((l) => l.created_at));
  const warmTrend = pctChangeOverWeek(warmLeads.map((l) => l.created_at));
  const hotTrend = pctChangeOverWeek(hotLeads.map((l) => l.created_at));
  const wonTrend = pctChangeOverWeek(wonLeads.map((l) => (l as any).converted_at ?? l.updated_at));
  const lostTrend = pctChangeOverWeek(lostLeads.map((l) => l.updated_at));

  // ============================================================
  // Pipeline Insights + Analytics data
  // ============================================================

  const activeDeals = leads.filter((l) => !['won', 'lost'].includes(getLeadStageSlug(l))).length;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const wonThisMonth = wonLeads
    .filter((l) => {
      const t = new Date((l as any).converted_at ?? l.updated_at).getTime();
      return !isNaN(t) && t >= monthStart.getTime();
    })
    .reduce((sum, l) => sum + getLeadBudget(l), 0);

  // Lead source distribution (all leads)
  const sourceDistribution = sources
    .map((src) => ({
      label: src.name,
      color: src.color || 'var(--accent)',
      value: leads.filter((l) => ((l as any).source_id ?? (l as any).lead_source_id) === src.id).length,
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const distributedTotal = sourceDistribution.reduce((s, x) => s + x.value, 0);
  if (totalLeads - distributedTotal > 0) {
    sourceDistribution.push({ label: 'Other', color: 'var(--text-muted)', value: totalLeads - distributedTotal });
  }

  // Pipeline trend: leads created per day over the selected window
  const trendSeries: { label: string; value: number }[] = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const from = day.getTime();
    const to = from + DAY_MS;
    const count = leads.filter((l) => {
      const t = new Date(l.created_at).getTime();
      return !isNaN(t) && t >= from && t < to;
    }).length;
    trendSeries.push({
      label: day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      value: count,
    });
  }

  // Recent activities across all leads (list endpoint eager-loads them)
  const allActivities = leads
    .flatMap((l) =>
      (l.activities ?? []).map((a) => ({ ...a, _company: l.company_name, _leadId: l.id }))
    )
    .sort((a, b) =>
      new Date(b.occurred_at ?? b.created_at).getTime() - new Date(a.occurred_at ?? a.created_at).getTime()
    );
  const visibleActivities = allActivities.slice(0, showAllActivities ? 12 : 4);

  // Pending follow-ups across all leads, soonest first
  const pendingFollowups = leads
    .flatMap((l) =>
      (l.followups ?? []).filter((f) => !f.is_completed).map((f) => ({ ...f, _company: l.company_name, _leadId: l.id }))
    )
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const quoteSentCount = leads.filter((l) => getLeadStageSlug(l) === 'quote-sent').length;
  const invoiceSentCount = leads.filter((l) => getLeadStageSlug(l) === 'invoice-sent').length;

  const tips: string[] = [
    hotCount > 0 ? `Follow up with ${hotCount} hot lead${hotCount === 1 ? '' : 's'}` : '',
    quoteSentCount > 0 ? `${quoteSentCount} quote${quoteSentCount === 1 ? ' is' : 's are'} awaiting response` : '',
    invoiceSentCount > 0 ? `${invoiceSentCount} invoice${invoiceSentCount === 1 ? ' is' : 's are'} pending payment` : '',
    pendingFollowups.length > 0 ? `${pendingFollowups.length} follow-up${pendingFollowups.length === 1 ? ' is' : 's are'} scheduled` : '',
    'Update leads to keep the pipeline accurate',
  ].filter(Boolean);

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto' }}>

      {/* ── KPI Panels ── */}
      <div className="kpi-grid kpi-grid-6" style={{ marginBottom: '1.5rem', gap: '0.75rem' }}>
        <StatCard
          icon={UserPlus} iconBg="var(--info-subtle)" iconColor="var(--info)"
          label="New Leads" value={newCount} trend={newTrend}
          help="Leads currently sitting in the first pipeline stage. Trend compares leads created in the last 7 days with the 7 days before."
        />
        <StatCard
          icon={Flame} iconBg="var(--warning-subtle)" iconColor="var(--warning)"
          label="Warm Temperature" value={warmCount} trend={warmTrend}
          help="Leads marked warm — interested, but not ready to decide yet."
        />
        <StatCard
          icon={Flame} iconBg="var(--danger-subtle)" iconColor="var(--danger)"
          label="Hot Temperature" value={hotCount} trend={hotTrend}
          help="Leads marked hot — close to a decision. These deserve attention first."
        />
        <StatCard
          icon={Trophy} iconBg="var(--success-subtle)" iconColor="var(--success)"
          label="Won Deals" value={wonCount} valueColor="var(--success)" trend={wonTrend}
          help="Leads that reached the Won stage."
        />
        <StatCard
          icon={XCircle} iconBg="var(--danger-subtle)" iconColor="var(--danger)"
          label="Lost Leads" value={lostCount} valueColor="var(--text-muted)" trend={lostTrend} trendIsBad
          help="Leads that reached the Lost stage. A falling trend is good news here."
        />
        <StatCard
          icon={TrendingUp} iconBg="var(--accent-subtle)" iconColor="var(--accent)"
          label="Conversion Rate" value={`${conversionRate}%`} subline={`${wonCount} / ${totalLeads}`}
          help="Won leads ÷ all leads. The line below shows won / total."
        />
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
            Manage client acquisitions, track deals, and convert prospects.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <HowToUseGuide moduleKey="crm" title="How the CRM Works" content={CRM_HOWTO} />

          <Link
            href="/settings/crm"
            className="btn btn-sm"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid transparent' }}
            title="Manage pipeline stages and lead sources"
          >
            <Tag size={14} /> Manage Categories
          </Link>

          {/* View Toggle */}
          <div style={{ background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', padding: '3px', display: 'flex', gap: '2px', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('kanban')}
              title="Kanban view"
              style={{
                width: 32, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: viewMode === 'kanban' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'kanban' ? 'var(--accent)' : 'var(--text-secondary)',
                border: viewMode === 'kanban' ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              style={{
                width: 32, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: viewMode === 'list' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-secondary)',
                border: viewMode === 'list' ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              <List size={15} />
            </button>
          </div>

          {canCreate && (
            <button onClick={() => openCreateModal()} className="btn btn-primary">
              <Plus size={16} /> Add Lead
            </button>
          )}
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="card-elevated" style={{ padding: '0.875rem 1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search company, contact name, email..."
              value={searchQuery ?? ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '2.25rem', height: '38px', fontSize: '0.875rem' }}
            />
          </div>

          <select
            value={stageFilter ?? ''}
            onChange={(e) => setStageFilter(e.target.value)}
            className="form-input"
            style={{ width: '125px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={sourceFilter ?? ''}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="form-input"
            style={{ width: '125px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={execFilter ?? ''}
            onChange={(e) => setExecFilter(e.target.value)}
            className="form-input"
            style={{ width: '140px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Sales Execs</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          <select
            value={priorityFilter ?? ''}
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

          <select
            value={tempFilter ?? ''}
            onChange={(e) => setTempFilter(e.target.value)}
            className="form-input"
            style={{ width: '110px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Temps</option>
            <option value="cold">Cold</option>
            <option value="warm">Warm</option>
            <option value="hot">Hot</option>
          </select>

          <select
            value={budgetRangeFilter ?? ''}
            onChange={(e) => setBudgetRangeFilter(e.target.value)}
            className="form-input"
            style={{ width: '130px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">Any Budget</option>
            <option value="under_1l">Under ₹1,00,000</option>
            <option value="1l_5l">₹1,00,000 - ₹5,00,000</option>
            <option value="5l_15l">₹5,00,000 - ₹15,00,000</option>
            <option value="over_15l">Over ₹15,00,000</option>
          </select>

          <button
            onClick={resetFilters}
            className="btn btn-sm"
            style={{ height: '38px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)' }}
            title="Clear all filters"
          >
            <RotateCcw size={13} /> Reset
          </button>

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
        // KANBAN VIEW + INSIGHTS SIDEBAR
        // ============================================================

        <div className="crm-layout" style={{ marginBottom: '1.25rem' }}>

          {/* Board */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '0.875rem', overflowX: 'auto', paddingBottom: '0.5rem', alignItems: 'flex-start' }}>
              {[...stages].sort((a, b) => a.sort_order - b.sort_order).map((stage) => {
                const stageLeads = filteredLeads.filter((l) => {
                  const lid = l.stage_id ?? (l as any)._stageObj?.id;
                  return lid === stage.id;
                });
                const isOver = dragOverStageId === stage.id;
                const description = STAGE_DESCRIPTIONS[stage.slug] ?? '';
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => handleDragOver(e, stage.id)}
                    onDrop={() => handleDrop(stage.id)}
                    onDragLeave={() => setDragOverStageId(null)}
                    style={{
                      flex: 1,
                      minWidth: '260px',
                      background: isOver
                        ? 'var(--surface-hover)'
                        : stage.color
                          ? `color-mix(in srgb, ${stage.color} 6%, var(--surface))`
                          : 'var(--surface)',
                      border: isOver ? '2px dashed var(--accent)' : '1px solid var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      display: 'flex',
                      flexDirection: 'column',
                      maxHeight: 'calc(100vh - 300px)',
                      transition: 'background var(--transition-fast), border var(--transition-fast)'
                    }}
                  >
                    {/* Stage Header */}
                    <div style={{ padding: '0.875rem 1rem 0.625rem', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: stage.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stage.name}</span>
                        </div>
                        <span style={{ fontSize: '0.6875rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '9999px', padding: '1px 7px', color: 'var(--text-secondary)', fontWeight: 700, flexShrink: 0 }}>
                          {stageLeads.length}
                        </span>
                      </div>
                      {description && (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '17px' }}>
                          {description}
                        </div>
                      )}
                    </div>

                    {/* Stage Body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0.625rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      {stageLeads.length === 0 ? (
                        <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          No leads in this stage
                        </div>
                      ) : (
                        stageLeads.map((lead) => {
                          const contacts = lead.contacts ?? [];
                          const primaryContact = (contacts.find((c: any) => c.is_primary) ?? contacts[0]) as any;
                          const firstServiceId = (lead.interested_service_ids ?? [])[0];
                          const firstService = catalogServices.find((s) => s.id === firstServiceId);
                          const serviceTagClass = firstService ? SERVICE_TAG_CLASSES[firstService.id % SERVICE_TAG_CLASSES.length] : '';
                          const exec = (lead as any)._salesExec;
                          const execFirstName = exec?.name?.split(' ')[0];

                          return (
                            <div
                              key={lead.id}
                              draggable
                              onDragStart={() => handleDragStart(lead.id)}
                              onDragEnd={() => setDraggedLeadId(null)}
                              className="crm-kanban-card"
                              style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                padding: '0.75rem 0.875rem',
                                cursor: 'grab',
                                boxShadow: 'var(--shadow-sm)'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                                <Link href={`/crm/${lead.id}`} style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none', lineHeight: 1.3 }} className="hover:text-accent">
                                  {lead.company_name}
                                </Link>
                                {lead.temperature === 'hot' && (
                                  <span className="badge badge-danger" style={{ fontSize: '0.5625rem', padding: '1px 6px', letterSpacing: '0.05em', flexShrink: 0 }}>
                                    HOT
                                  </span>
                                )}
                              </div>

                              {primaryContact?.name && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                                  {primaryContact.name}
                                </div>
                              )}
                              {primaryContact?.email && (
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {primaryContact.email}
                                </div>
                              )}

                              {firstService && (
                                <div style={{ marginTop: '0.5rem' }}>
                                  <span className={`badge ${serviceTagClass}`} style={{ fontSize: '0.5625rem', padding: '2px 6px', letterSpacing: '0.06em', fontWeight: 700 }}>
                                    {firstService.name.toUpperCase()}
                                  </span>
                                </div>
                              )}

                              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                                {budgetRangeLabel(lead._budget)}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', marginTop: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                                <span>
                                  {formatDate((lead.expected_start_date as string) || lead.created_at)}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                                  <span style={{
                                    width: 16, height: 16, borderRadius: '50%',
                                    background: 'var(--accent-subtle)', color: 'var(--accent)',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.5625rem', fontWeight: 700
                                  }}>
                                    {(execFirstName?.[0] ?? '?').toUpperCase()}
                                  </span>
                                  {execFirstName ?? 'Unassigned'}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Column Footer: quick add into this stage */}
                    {canCreate && (
                      <button
                        onClick={() => openCreateModal(stage.id)}
                        className="crm-col-add"
                        style={{
                          margin: '0.375rem 0.625rem 0.625rem',
                          padding: '0.4rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px dashed var(--border)',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                      >
                        <Plus size={13} /> Add Lead
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add New Stage */}
            <Link
              href="/settings/crm"
              className="crm-add-stage"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '0.625rem', marginTop: '0.5rem',
                border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)', fontSize: '0.8125rem', fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <Plus size={14} /> Add New Stage
            </Link>
          </div>
        </div>
      ) : (

        // ============================================================
        // DATATABLE LIST VIEW
        // ============================================================

        <div className="data-table-wrap" style={{ marginBottom: '1.25rem' }}>
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
                          {canDelete && (
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
                          )}
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
          ANALYTICS ROW
          ============================================================ */}
      {!isLoading && (
        <div className="crm-analytics-grid" style={{ marginBottom: '1.5rem' }}>

          {/* Lead Source Distribution */}
          <AnalyticsCard title="Lead Source Distribution">
            {sourceDistribution.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>No leads yet — add your first lead to see the split by source.</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                <DonutChart segments={sourceDistribution} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '140px' }}>
                  {sourceDistribution.slice(0, 6).map((seg) => (
                    <div key={seg.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.75rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', minWidth: 0 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg.label}</span>
                      </span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round((seg.value / totalLeads) * 100)}% ({seg.value})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AnalyticsCard>

          {/* Pipeline Trend */}
          <AnalyticsCard
            title="Pipeline Trend"
            action={
              <select
                value={trendDays}
                onChange={(e) => setTrendDays(Number(e.target.value))}
                className="form-input"
                style={{ width: 'auto', height: '30px', padding: '0 0.5rem', fontSize: '0.75rem' }}
              >
                <option value={7}>Last 7 Days</option>
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days</option>
              </select>
            }
          >
            <TrendChart series={trendSeries} />
          </AnalyticsCard>

          {/* Recent Activities */}
          <AnalyticsCard title="Recent Activities">
            {visibleActivities.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>No activity yet. Calls, notes, and stage changes will show up here.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {visibleActivities.map((a) => {
                  const meta = ACTIVITY_ICONS[a.type] ?? { icon: Sparkles, color: 'var(--text-muted)', bg: 'var(--surface-elevated)' };
                  const ActIcon = meta.icon;
                  return (
                    <Link key={`${a._leadId}-${a.id}`} href={`/crm/${a._leadId}`} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', textDecoration: 'none' }}>
                      <span style={{ width: 28, height: 28, borderRadius: '50%', background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ActIcon size={13} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {a.description}
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          {a._company} · {formatDateTime(a.occurred_at ?? a.created_at)}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
            {allActivities.length > 4 && (
              <button
                onClick={() => setShowAllActivities((v) => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left', marginTop: 'auto' }}
              >
                {showAllActivities ? 'Show Less' : 'View All Activities'}
              </button>
            )}
          </AnalyticsCard>

          {/* Tips & Reminders */}
          <AnalyticsCard title={
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lightbulb size={15} style={{ color: 'var(--warning)' }} /> Tips &amp; Reminders
            </span>
          }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {tips.map((tip) => (
                <div key={tip} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <CheckCircle2 size={15} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{tip}</span>
                </div>
              ))}
            </div>
            {showAllReminders && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                {pendingFollowups.length === 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No pending follow-ups — you&apos;re all caught up.</span>
                ) : (
                  pendingFollowups.slice(0, 8).map((f) => (
                    <Link key={`${f._leadId}-${f.id}`} href={`/crm/${f._leadId}`} style={{ textDecoration: 'none' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{f.description}</span>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{f._company} · {formatDate(f.scheduled_at)}</span>
                    </Link>
                  ))
                )}
              </div>
            )}
            <button
              onClick={() => setShowAllReminders((v) => !v)}
              className="btn btn-sm"
              style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid transparent' }}
            >
              {showAllReminders ? 'Hide Reminders' : 'View All Reminders'}
            </button>
          </AnalyticsCard>
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
                    <select name="stage_id" className="form-input" defaultValue={createStageId != null ? String(createStageId) : ''}>
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

// ============================================================
// Presentational helpers
// ============================================================

function StatCard({ icon: Icon, iconBg, iconColor, label, value, valueColor, trend, trendIsBad, subline, help }: {
  icon: React.ComponentType<any>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  trend?: number | null;
  trendIsBad?: boolean;
  subline?: string;
  help?: string;
}) {
  const isUp = (trend ?? 0) >= 0;
  const good = trendIsBad ? !isUp : isUp;
  const trendColor = good ? 'var(--success)' : 'var(--danger)';
  return (
    <div className="kpi-card" style={{ gap: '0.625rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <span style={{ width: 34, height: 34, borderRadius: '10px', background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={17} />
        </span>
        <span className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {label}
          {help && <HelpIcon text={help} />}
        </span>
      </div>
      <div className="kpi-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      {subline ? (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{subline}</span>
      ) : trend === null || trend === undefined ? (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>— vs last 7 days</span>
      ) : (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
          {isUp
            ? <ArrowUpRight size={13} style={{ color: trendColor }} />
            : <ArrowDownRight size={13} style={{ color: trendColor }} />}
          <span style={{ color: trendColor, fontWeight: 700 }}>{Math.abs(trend)}%</span>
          vs last 7 days
        </span>
      )}
    </div>
  );
}

function InsightRow({ icon: Icon, iconBg, iconColor, label, value }: {
  icon: React.ComponentType<any>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '0.4375rem 0' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', color: 'var(--text-secondary)', minWidth: 0 }}>
        <span style={{ width: 26, height: 26, borderRadius: '8px', background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={13} />
        </span>
        {label}
      </span>
      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {value}
      </span>
    </div>
  );
}

function QuickAction({ icon: Icon, iconBg, iconColor, title, caption, onClick, href }: {
  icon: React.ComponentType<any>;
  iconBg: string;
  iconColor: string;
  title: string;
  caption: string;
  onClick?: () => void;
  href?: string;
}) {
  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '0.5rem 0.625rem', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-subtle)', background: 'transparent',
    width: '100%', cursor: 'pointer', textDecoration: 'none', textAlign: 'left',
  };
  const inner = (
    <>
      <span style={{ width: 32, height: 32, borderRadius: '8px', background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{caption}</span>
      </span>
    </>
  );
  return href
    ? <Link href={href} className="crm-quick-action" style={style}>{inner}</Link>
    : <button onClick={onClick} className="crm-quick-action" style={style}>{inner}</button>;
}

function AnalyticsCard({ title, action, children }: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.125rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function DonutChart({ segments, size = 148, thickness = 26 }: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} role="img" aria-label="Lead source distribution">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const dash = frac * circ;
          const offset = -acc * circ;
          acc += frac;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </g>
    </svg>
  );
}

function TrendChart({ series }: { series: { label: string; value: number }[] }) {
  if (series.length === 0) return null;
  const w = 520, h = 200, pl = 30, pr = 12, pt = 10, pb = 26;
  const iw = w - pl - pr, ih = h - pt - pb;
  const maxVal = Math.max(...series.map((s) => s.value), 1);
  const step = Math.max(1, Math.ceil(maxVal / 4));
  const yMax = step * 4;
  const n = series.length;
  const pts = series.map((s, i) => ({
    x: pl + (n === 1 ? iw / 2 : (i * iw) / (n - 1)),
    y: pt + ih * (1 - s.value / yMax),
  }));

  let line = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    line += ` C ${mx} ${pts[i - 1].y}, ${mx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }
  const area = `${line} L ${pts[n - 1].x} ${pt + ih} L ${pts[0].x} ${pt + ih} Z`;
  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const dotR = n > 14 ? 2 : 3;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Leads created per day">
      <defs>
        <linearGradient id="crmTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => {
        const y = pt + (ih * i) / 4;
        return (
          <g key={i}>
            <line x1={pl} x2={w - pr} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth="1" />
            <text x={pl - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">{yMax - step * i}</text>
          </g>
        );
      })}
      <path d={area} fill="url(#crmTrendFill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={dotR} fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
      ))}
      {series.map((s, i) => (
        (i % labelEvery === 0 || i === n - 1) && (
          <text key={i} x={pts[i].x} y={h - 8} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{s.label}</text>
        )
      ))}
    </svg>
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
