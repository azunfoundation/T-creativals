'use client';

import { useState, useEffect } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useModal } from '@/providers/ModalProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, LayoutGrid, List, Filter, X,
  Calendar, DollarSign, UserCheck, Briefcase,
  ArrowUpDown, ExternalLink, Check, Trash2, Clock,
  ArrowRight, Users, CheckCircle2, AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import {
  projects as projectsApi,
  invoices as invoicesApi,
  users as usersApi,
  clientsApi,
  Project, Invoice, User
} from '@/lib/api';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const PROJECTS_HOWTO = {
  overview: 'A Project tracks one paid piece of work for a client from kickoff to delivery — its team, budget, deadlines, milestones, and tasks all live here.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Click "New Project" and fill in the client, manager, and dates.',
        'Projects are usually created after an invoice is approved — you can link the invoice that is funding this work.',
        'Add team members from the project detail page once it is created.',
      ],
    },
    {
      heading: 'Day to day',
      items: [
        'Drag a project between columns in Board View to update its status.',
        'Open a project to manage its Milestones, Tasks, Timesheets, and Documents.',
        'Use the filters to find a project by client, manager, or status.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Set a realistic Budget Hours and Budget Amount up front — it powers the profitability numbers later.',
        'Keep status current so the dashboard and reports reflect reality.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Leaving a project as "Planning" long after work has started — switch it to "In Progress" so reporting stays accurate.',
        'Forgetting to set an end date, which makes timeline and overdue tracking unreliable.',
      ],
    },
  ],
};

const STATUS_CONFIG = {
  planning: { label: 'Planning', color: 'var(--info)', bg: 'var(--info-subtle)', borderLeft: 'border-l-blue-500' },
  in_progress: { label: 'In Progress', color: 'var(--accent)', bg: 'var(--accent-subtle)', borderLeft: 'border-l-purple-500' },
  active: { label: 'Active', color: 'var(--accent)', bg: 'var(--accent-subtle)', borderLeft: 'border-l-purple-500' },
  on_hold: { label: 'On Hold', color: 'var(--warning)', bg: 'var(--warning-subtle)', borderLeft: 'border-l-orange-500' },
  completed: { label: 'Completed', color: 'var(--success)', bg: 'var(--success-subtle)', borderLeft: 'border-l-green-500' },
  cancelled: { label: 'Cancelled', color: 'var(--danger)', bg: 'var(--danger-subtle)', borderLeft: 'border-l-red-500' }
};

export default function ProjectsPage() {
  const { confirm, prompt } = useModal();
  const queryClient = useQueryClient();

  // Layout states
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');
  const [showDrawer, setShowDrawer] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === 'true') {
        setShowDrawer(true);
        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      }
    }
  }, []);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');

  // Drag and drop states for Board view
  const [draggedProjectId, setDraggedProjectId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  // Form states for new project
  const [newName, setNewName] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [newInvoiceId, setNewInvoiceId] = useState('');
  const [newManagerId, setNewManagerId] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newBudgetHours, setNewBudgetHours] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // ============================================================
  // Queries
  // ============================================================

  const { data: projectsData = [], isLoading: isLoadingProjects, isError: isProjectsError } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await projectsApi.list();
      const data = res.data.data || [];
      return data.map((p: any) => ({
        ...p,
        budget: p.budget_amount !== undefined ? parseFloat(p.budget_amount) : p.budget
      }));
    }
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: async () => {
      try {
        const res = await invoicesApi.list();
        return res.data.data;
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
        return res.data.data;
      } catch {
        return [];
      }
    }
  });

  // Client picker: the Clients module directory (clients.view — PMs hold it).
  // The previous roles+users lookup required roles.view/users.view, which
  // only founder/director hold, so the picker was silently empty for PMs.
  // (A Project's client_id is a real User id, not a Lead id.)
  const { data: clients = [], isError: isClientsError } = useQuery({
    queryKey: ['clients_directory', 'picker'],
    queryFn: async () => {
      const res = await clientsApi.list();
      return (res.data?.breakdown || []).map((c) => ({
        id: c.client_id,
        name: c.company_name ? `${c.company_name} (${c.client_name})` : c.client_name,
        email: c.client_email,
      }));
    },
  });

  // ============================================================
  // Mutations
  // ============================================================

  const createProjectMutation = useMutation({
    mutationFn: (data: any) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowDrawer(false);
      resetForm();
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: number) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number, status: Project['status'] }) =>
      projectsApi.update(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      const previousProjects = queryClient.getQueryData<Project[]>(['projects']);
      if (previousProjects) {
        queryClient.setQueryData<Project[]>(
          ['projects'],
          previousProjects.map((p) => (p.id === id ? { ...p, status } : p))
        );
      }
      return { previousProjects };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });

  // ============================================================
  // Handlers and Filtering
  // ============================================================

  const resetForm = () => {
    setNewName('');
    setNewClientId('');
    setNewInvoiceId('');
    setNewManagerId('');
    setNewStartDate('');
    setNewEndDate('');
    setNewBudgetHours('');
    setNewBudgetAmount('');
    setNewDescription('');
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: newName,
      client_id: newClientId ? parseInt(newClientId) : undefined,
      invoice_id: newInvoiceId ? parseInt(newInvoiceId) : undefined,
      manager_id: newManagerId ? parseInt(newManagerId) : undefined,
      start_date: newStartDate,
      end_date: newEndDate,
      budget_hours: parseFloat(newBudgetHours) || 0,
      budget_amount: parseFloat(newBudgetAmount) || 0,
      description: newDescription,
      status: 'planning',
      completion_percentage: 0
    };

    createProjectMutation.mutate(payload);
  };

  const handleDragStart = (id: number) => {
    setDraggedProjectId(id);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverStatus(status);
  };

  const handleDrop = (status: Project['status']) => {
    if (draggedProjectId !== null) {
      updateStatusMutation.mutate({ id: draggedProjectId, status });
    }
    setDraggedProjectId(null);
    setDragOverStatus(null);
  };

  // Filter projects
  const filteredProjects = projectsData.filter(project => {
    if (searchQuery) {
      const nameMatch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
      const numberMatch = project.project_number?.toLowerCase().includes(searchQuery.toLowerCase());
      const clientMatch = project.client?.name?.toLowerCase().includes(searchQuery.toLowerCase());
      if (!nameMatch && !numberMatch && !clientMatch) return false;
    }
    if (statusFilter && project.status !== statusFilter) return false;
    if (managerFilter && project.manager_id !== parseInt(managerFilter)) return false;
    return true;
  });

  // KPI calculations
  const totalProjectsCount = projectsData.length;
  const activeCount = projectsData.filter(p => p.status === 'active' || p.status === 'in_progress').length;
  const completedCount = projectsData.filter(p => p.status === 'completed').length;
  const totalBudgetVal = projectsData.reduce((sum, p) => sum + (p.budget || 0), 0);

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto' }}>
      
      {/* ── Metrics Row ── */}
      <div className="kpi-grid kpi-grid-4" style={{ marginBottom: '1.5rem', gap: '0.75rem' }}>
        <div className="kpi-card">
          <span className="kpi-label">Total Projects</span>
          <div className="kpi-value">{totalProjectsCount}</div>
          <span className="kpi-trend flat">All Projects</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Active Projects</span>
          <div className="kpi-value" style={{ color: 'var(--accent)' }}>{activeCount}</div>
          <span className="kpi-trend up" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>Ongoing</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Completed Projects</span>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{completedCount}</div>
          <span className="kpi-trend up">{completedCount} Delivered</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Total Budget</span>
          <div className="kpi-value" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalBudgetVal)}</div>
          <span className="kpi-trend flat">Portfolio Value</span>
        </div>
      </div>

      {/* ── Action Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Projects
            <HelpIcon title="Projects" content={{
              what: 'A Project tracks one client engagement — its team, budget, milestones, and tasks.',
              why: 'It gives everyone one place to see what work is happening, for whom, and how it is progressing against budget and deadline.',
              when: 'Create a project once a client engagement is confirmed (usually after an invoice is approved).',
            }} />
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '2px' }}>
            Monitor agency contracts, visual delivery streams, and production capacity.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <HowToUseGuide moduleKey="projects" title="How Projects Work" content={PROJECTS_HOWTO} />

          {/* View Toggle */}
          <div style={{ background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', padding: '3px', display: 'flex', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('table')}
              className="btn btn-sm"
              style={{
                background: viewMode === 'table' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '0.375rem 0.625rem',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <List size={14} style={{ marginRight: '4px' }} />
              Table View
            </button>
            <button
              onClick={() => setViewMode('board')}
              className="btn btn-sm"
              style={{
                background: viewMode === 'board' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'board' ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '0.375rem 0.625rem',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <LayoutGrid size={14} style={{ marginRight: '4px' }} />
              Board View
            </button>
          </div>

          <button
            onClick={() => setShowDrawer(true)}
            className="btn btn-primary"
          >
            <Plus size={16} /> New Project
          </button>
        </div>
      </div>

      {/* ── Filters Panel ── */}
      <div className="card-elevated" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search projects, client, manager..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '2.25rem', height: '38px', fontSize: '0.875rem' }}
            />
          </div>

          <Filter size={15} style={{ color: 'var(--text-muted)' }} />

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-input"
            style={{ width: '140px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>

          {/* Manager Filter */}
          <select
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value)}
            className="form-input"
            style={{ width: '160px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
          >
            <option value="">All Managers</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          {/* Clear button */}
          {(searchQuery || statusFilter || managerFilter) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('');
                setManagerFilter('');
              }}
              style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', padding: '0.5rem' }}
            >
              <X size={12} /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {isProjectsError && (
        <div style={{ marginBottom: '1.25rem', padding: '0.875rem 1rem', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} />
          Couldn&apos;t load projects. Please check your connection and try refreshing the page.
        </div>
      )}

      {/* ── Table View ── */}
      {viewMode === 'table' ? (
        <div className="data-table-wrap">
          {isLoadingProjects ? (
            <SkeletonTable rows={5} cols={6} />
          ) : filteredProjects.length === 0 ? (
            <EmptyState
              title={projectsData.length === 0 ? 'No projects yet' : 'No projects match your filters'}
              description={projectsData.length === 0
                ? "Click \"New Project\" above to create your first project."
                : 'Try clearing your search or filters to see more results.'}
              action={projectsData.length === 0 ? (
                <button onClick={() => setShowDrawer(true)} className="btn btn-primary btn-sm">
                  <Plus size={14} /> New Project
                </button>
              ) : undefined}
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project#</th>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Manager</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Timeline</th>
                  <th>Budget</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => {
                  const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.planning;
                  return (
                    <tr key={project.id}>
                      <td style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {project.project_number || `PRJ-${project.id.toString().padStart(3, '0')}`}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        <Link href={`/projects/${project.id}`} style={{ color: 'var(--text-primary)' }} className="hover:text-accent flex items-center gap-1">
                          {project.name}
                          <ExternalLink size={12} style={{ opacity: 0.5 }} />
                        </Link>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {project.client?.name || 'Walk-in Client'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div className="avatar avatar-sm">
                            {getInitials(project.manager?.name || 'Unassigned')}
                          </div>
                          <span style={{ fontSize: '0.875rem' }}>{project.manager?.name || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={{ backgroundColor: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ width: '130px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                            <span>{project.completion_percentage}%</span>
                          </div>
                          <div style={{ height: '6px', background: 'var(--surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${project.completion_percentage}%`,
                              background: 'linear-gradient(90deg, var(--accent) 0%, #a855f7 100%)',
                              borderRadius: '999px'
                            }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <div>S: {formatDate(project.start_date)}</div>
                        <div style={{ marginTop: '2px' }}>E: {formatDate(project.end_date)}</div>
                      </td>
                      <td style={{ fontWeight: 500, fontFamily: 'monospace' }}>
                        {formatCurrency(project.budget || 0)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <Link href={`/projects/${project.id}`} className="btn btn-secondary btn-sm" style={{ padding: '0.375rem' }}>
                            View Detail
                          </Link>
                          <button
                            onClick={async () => { if (await confirm({ message: 'Are you sure you want to delete this project?', variant: 'danger' })) deleteProjectMutation.mutate(project.id); }}
                            className="btn btn-danger btn-sm btn-icon"
                            style={{ padding: '0.375rem' }}
                          >
                            <Trash2 size={14} />
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
      ) : (
        
        // ── Board View (by Status) ──
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '1rem', minHeight: 'calc(100vh - 360px)', alignItems: 'flex-start' }}>
          {(['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'] as Array<Project['status']>).map((statusKey) => {
            const statusCol = STATUS_CONFIG[statusKey];
            const colProjects = filteredProjects.filter(p => p.status === statusKey);
            const isOver = dragOverStatus === statusKey;

            return (
              <div
                key={statusKey}
                onDragOver={(e) => handleDragOver(e, statusKey)}
                onDrop={() => handleDrop(statusKey)}
                onDragLeave={() => setDragOverStatus(null)}
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
                {/* Header */}
                <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusCol.color }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{statusCol.label}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: '9999px', padding: '1px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {colProjects.length}
                  </span>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {colProjects.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      No projects here
                    </div>
                  ) : (
                    colProjects.map((project) => (
                      <div
                        key={project.id}
                        draggable
                        onDragStart={() => handleDragStart(project.id)}
                        style={{
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border)',
                          borderLeft: `4px solid ${statusCol.color}`,
                          borderRadius: 'var(--radius-md)',
                          padding: '0.875rem',
                          cursor: 'grab',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                        }}
                        className="crm-kanban-card"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                          <Link href={`/projects/${project.id}`} style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }} className="hover:text-accent flex items-center gap-1">
                            {project.name}
                            <ExternalLink size={10} style={{ opacity: 0.5 }} />
                          </Link>
                        </div>

                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                          Client: {project.client?.name || 'Walk-in'}
                        </div>

                        {/* Progress */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            <span>Progress</span>
                            <span>{project.completion_percentage}%</span>
                          </div>
                          <div style={{ height: '4px', background: 'var(--surface)', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${project.completion_percentage}%`, background: 'var(--accent)' }} />
                          </div>
                        </div>

                        {/* Footer info */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <Calendar size={11} /> {formatDate(project.start_date)}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div className="avatar avatar-sm" style={{ width: 18, height: 18, fontSize: '0.55rem' }}>
                              {getInitials(project.manager?.name || 'U')}
                            </div>
                            {project.manager?.name.split(' ')[0]}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Project Slide-over Drawer ── */}
      {showDrawer && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 60 }}
            onClick={() => setShowDrawer(false)}
          />

          {/* Drawer Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New Project"
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 520, maxWidth: '90vw',
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              zIndex: 61,
              display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
              animation: 'slideInRight 0.25s ease',
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)' }}>Create New Project</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Fill in the fields below to schedule a new contract pipeline.</p>
              </div>
              <button
                onClick={() => setShowDrawer(false)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)' }}
                className="hover:text-primary hover:bg-surface-elevated"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Scroll Body */}
            <form onSubmit={handleCreateSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Project Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="form-input"
                  placeholder="e.g. Stark Website Redesign"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Client *
                    <HelpIcon text="The client account this project is billed under. Don't see them here? Add them as a client under Users first." />
                  </label>
                  <select
                    required
                    value={newClientId}
                    onChange={(e) => setNewClientId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select a client</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                    ))}
                  </select>
                  {isClientsError && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.375rem' }}>
                      Couldn't load the client list — refresh the page to retry.
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Linked Invoice
                    <HelpIcon text="Optional — link the invoice that is funding this project, for reporting." />
                  </label>
                  <select
                    value={newInvoiceId}
                    onChange={(e) => setNewInvoiceId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">None</option>
                    {invoices.map(inv => (
                      <option key={inv.id} value={inv.id}>{inv.invoice_number} - {inv.title} (₹{inv.total_amount.toLocaleString()})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Project Manager *
                  <HelpIcon text="The employee accountable for this project's delivery — shown throughout the app as the point of contact." />
                </label>
                <select
                  required
                  value={newManagerId}
                  onChange={(e) => setNewManagerId(e.target.value)}
                  className="form-input"
                >
                  <option value="">Select Project Manager</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.employee_id || 'Employee'})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">End Date *</label>
                  <input
                    type="date"
                    required
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Budget Hours
                    <HelpIcon text="Total hours you expect this project to take. Used to track hours burned vs. budgeted." />
                  </label>
                  <input
                    type="number"
                    value={newBudgetHours}
                    onChange={(e) => setNewBudgetHours(e.target.value)}
                    className="form-input"
                    placeholder="e.g. 150"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Budget Amount (₹) *
                    <HelpIcon text="The total contract value for this project. Powers the profitability numbers on the project detail page." />
                  </label>
                  <input
                    type="number"
                    required
                    value={newBudgetAmount}
                    onChange={(e) => setNewBudgetAmount(e.target.value)}
                    className="form-input"
                    placeholder="e.g. 500000"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="form-input"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  placeholder="Details about deliverables, design language, core goals..."
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => { setShowDrawer(false); resetForm(); }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProjectMutation.isPending}
                  className="btn btn-primary"
                >
                  {createProjectMutation.isPending ? 'Saving...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
