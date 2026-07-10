'use client';

import { useState, useMemo } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useModal } from '@/providers/ModalProvider'; 
import { useToast } from '@/hooks/useToast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight,
  Plus, List, Grid, Search, Filter, X, Check, Edit2, Trash2,
  DollarSign, Send, AlertCircle
} from 'lucide-react';
import {
  timesheets as timesheetsApi,
  projects as projectsApi,
  tasks as tasksApi,
  users as usersApi,
  Timesheet, Project, Task, User
} from '@/lib/api';
import { formatDate, formatCurrency, getInitials } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

// ============================================================
// Helper dates
// ============================================================

const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
};

const formatLocalDateStr = (d: Date) => {
  return d.toISOString().split('T')[0];
};

const TIMESHEETS_HOWTO = {
  overview: 'Timesheets are how the team logs billable and non-billable hours against projects and tasks. Log time in the Weekly Grid or List View, then submit it for your project manager to approve.',
  sections: [
    {
      heading: 'Logging time',
      items: [
        'Click any empty cell in the Weekly Grid, or use "Log Time", to add an entry for a project (and optionally a specific task).',
        'Entries start as Draft — you can edit or delete them freely until you submit.',
        'Toggle "Billable" off for internal work that shouldn’t be charged to the client.',
      ],
    },
    {
      heading: 'Submitting for approval',
      items: [
        'Use "Submit Week for Approval" to send every draft entry in the visible week to your manager at once.',
        'In List View, you can also submit a single entry directly from its row.',
        'Once submitted, an entry is locked — you can no longer edit or delete it yourself.',
      ],
    },
    {
      heading: 'After submission',
      items: [
        'Approved entries count toward the project’s actual hours and profitability figures.',
        'Rejected entries return to Draft with a note from your manager explaining what to fix — re-submit once corrected.',
      ],
    },
  ],
};

export default function TimesheetsPage() {
  const { confirm, prompt } = useModal();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Layout states
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentWeekRefDate, setCurrentWeekRefDate] = useState<Date>(new Date());

  // Modal states
  const [showLogModal, setShowLogModal] = useState(false);
  const [editingTimesheetId, setEditingTimesheetId] = useState<number | null>(null);

  // Form states
  const [formDate, setFormDate] = useState(formatLocalDateStr(new Date()));
  const [formProjectId, setFormProjectId] = useState('');
  const [formTaskId, setFormTaskId] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBillable, setFormBillable] = useState(true);

  // List filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [billableFilter, setBillableFilter] = useState('');

  // ============================================================
  // Week calculations
  // ============================================================

  const monday = useMemo(() => getMonday(currentWeekRefDate), [currentWeekRefDate]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [monday]);

  const weekStartStr = useMemo(() => formatDate(weekDays[0]), [weekDays]);
  const weekEndStr = useMemo(() => formatDate(weekDays[6]), [weekDays]);

  const handlePrevWeek = () => {
    const prev = new Date(currentWeekRefDate);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekRefDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentWeekRefDate);
    next.setDate(next.getDate() + 7);
    setCurrentWeekRefDate(next);
  };

  const handleTodayWeek = () => {
    setCurrentWeekRefDate(new Date());
  };

  // ============================================================
  // Queries
  // ============================================================

  const { data: timesheetsData = [], isLoading, isError: timesheetsError } = useQuery<Timesheet[]>({
    queryKey: ['timesheets', 'all'],
    // `all: 1` bypasses the backend's default "current week only" filter — without it,
    // navigating to a past/future week (or searching List View) would always come back empty.
    // Note: /timesheets never paginates, so the response interceptor already unwraps it to a
    // flat array (unlike /projects or /tasks, which are paginated and keep the {data, meta} envelope).
    queryFn: async () => {
      const res = await timesheetsApi.list({ all: 1 });
      return res.data;
    }
  });

  const { data: projects = [], isError: projectsError } = useQuery<Project[]>({
    queryKey: ['projects', 'picker'],
    queryFn: async () => {
      const res = await projectsApi.list({ per_page: 200 });
      return res.data.data;
    }
  });

  const { data: allTasks = [], isError: tasksError } = useQuery<Task[]>({
    queryKey: ['tasks', 'picker'],
    queryFn: async () => {
      const res = await tasksApi.list({ per_page: 500 });
      return res.data.data;
    }
  });

  const loadError = timesheetsError || projectsError || tasksError;

  // Filter tasks in form based on chosen Project
  const formTasksFiltered = useMemo(() => {
    if (!formProjectId) return [];
    return allTasks.filter(t => t.project_id === parseInt(formProjectId));
  }, [formProjectId, allTasks]);

  // ============================================================
  // Mutations
  // ============================================================

  const createTimesheetMutation = useMutation({
    mutationFn: (data: any) => timesheetsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      setShowLogModal(false);
      resetForm();
    }
  });

  const updateTimesheetMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: any }) => timesheetsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      setShowLogModal(false);
      resetForm();
    }
  });

  const deleteTimesheetMutation = useMutation({
    mutationFn: (id: number) => timesheetsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    }
  });

  const submitWeekMutation = useMutation({
    // Submits all timesheets for this week that are currently in draft
    mutationFn: async (timesheetIds: number[]) => {
      for (const id of timesheetIds) {
        await timesheetsApi.submit(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      showToast('Timesheets submitted for approval successfully.', 'info');
    }
  });

  const submitEntryMutation = useMutation({
    mutationFn: (id: number) => timesheetsApi.submit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      showToast('Time entry submitted for approval.', 'info');
    }
  });

  // ============================================================
  // Grid processing
  // ============================================================

  // Filter timesheets belonging to current week
  const currentWeekTimesheets = useMemo(() => {
    const startStr = formatLocalDateStr(weekDays[0]);
    const endStr = formatLocalDateStr(weekDays[6]);
    return timesheetsData.filter(t => t.date >= startStr && t.date <= endStr);
  }, [timesheetsData, weekDays]);

  // Group timesheets by Project + Task key
  const gridRows = useMemo(() => {
    const rowsMap: Record<string, { project: Project; task?: Task; entries: Record<string, Timesheet[]> }> = {};

    currentWeekTimesheets.forEach(entry => {
      const projId = entry.project_id;
      const tskId = entry.task_id || 0;
      const key = `${projId}-${tskId}`;

      if (!rowsMap[key]) {
        // Resolve project and task
        const projObj = projects.find(p => p.id === projId) || entry.project || { id: projId, name: `Project #${projId}` } as Project;
        const taskObj = allTasks.find(t => t.id === tskId) || entry.task;
        
        rowsMap[key] = {
          project: projObj,
          task: taskObj,
          entries: {}
        };
      }

      const dateStr = entry.date;
      if (!rowsMap[key].entries[dateStr]) {
        rowsMap[key].entries[dateStr] = [];
      }
      rowsMap[key].entries[dateStr].push(entry);
    });

    return Object.values(rowsMap);
  }, [currentWeekTimesheets, projects, allTasks]);

  // ============================================================
  // Handlers & Form Control
  // ============================================================

  const resetForm = () => {
    setFormDate(formatLocalDateStr(new Date()));
    setFormProjectId('');
    setFormTaskId('');
    setFormHours('');
    setFormDescription('');
    setFormBillable(true);
    setEditingTimesheetId(null);
  };

  const handleCellClick = (date: Date, projectRow: Project, taskRow?: Task, entry?: Timesheet) => {
    if (entry && entry.status !== 'draft') {
      showToast(`This entry is ${entry.status} and can no longer be edited.`, 'info');
      return;
    }

    setFormDate(formatLocalDateStr(date));
    setFormProjectId(projectRow.id.toString());
    setFormTaskId(taskRow?.id.toString() || '');

    if (entry) {
      setEditingTimesheetId(entry.id);
      setFormHours(entry.hours.toString());
      setFormDescription(entry.description || '');
      setFormBillable(entry.billable);
    } else {
      setEditingTimesheetId(null);
      setFormHours('');
      setFormDescription('');
      setFormBillable(true);
    }
    
    setShowLogModal(true);
  };

  const handleEditButton = (entry: Timesheet) => {
    setEditingTimesheetId(entry.id);
    setFormDate(entry.date);
    setFormProjectId(entry.project_id.toString());
    setFormTaskId(entry.task_id?.toString() || '');
    setFormHours(entry.hours.toString());
    setFormDescription(entry.description || '');
    setFormBillable(entry.billable);
    setShowLogModal(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hrs = parseFloat(formHours);
    if (isNaN(hrs) || hrs <= 0) return;

    const payload = {
      project_id: parseInt(formProjectId),
      task_id: formTaskId ? parseInt(formTaskId) : null,
      date: formDate,
      hours: hrs,
      description: formDescription,
      billable: formBillable,
      status: 'draft'
    };

    if (editingTimesheetId) {
      updateTimesheetMutation.mutate({ id: editingTimesheetId, data: payload });
    } else {
      createTimesheetMutation.mutate(payload);
    }
  };

  const handleWeeklySubmit = async () => {
    const draftIds = currentWeekTimesheets
      .filter(t => t.status === 'draft')
      .map(t => t.id);

    if (draftIds.length === 0) {
      showToast('No draft timesheet entries found for this week.', 'info');
      return;
    }

    if (await confirm({ message: `Submit ${draftIds.length} draft entries for approval?`, variant: 'info' })) {
      submitWeekMutation.mutate(draftIds);
    }
  };

  // ============================================================
  // Filters & List View Calculations
  // ============================================================

  const filteredTimesheetsList = useMemo(() => {
    return timesheetsData.filter(entry => {
      // Search filter
      if (searchQuery) {
        const descMatch = entry.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const userMatch = entry.user?.name.toLowerCase().includes(searchQuery.toLowerCase());
        const projMatch = entry.project?.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!descMatch && !userMatch && !projMatch) return false;
      }
      
      // Select filters
      if (projectFilter && entry.project_id !== parseInt(projectFilter)) return false;
      if (statusFilter && entry.status !== statusFilter) return false;
      
      if (billableFilter) {
        const isBill = billableFilter === 'true';
        if (entry.billable !== isBill) return false;
      }

      return true;
    });
  }, [timesheetsData, searchQuery, projectFilter, statusFilter, billableFilter]);

  // Bottom week calculation summaries (based on currently selected week grid)
  const totals = useMemo(() => {
    let total = 0;
    let billable = 0;
    let nonBillable = 0;

    currentWeekTimesheets.forEach(t => {
      const val = parseFloat(t.hours as any) || 0;
      total += val;
      if (t.billable) {
        billable += val;
      } else {
        nonBillable += val;
      }
    });

    return { total, billable, nonBillable };
  }, [currentWeekTimesheets]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* ── Top Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Timesheets
            <HelpIcon title="Timesheets" content={{
              what: 'Your log of hours worked, by project and task, for each day.',
              why: 'Approved hours feed project profitability, task actuals, and payroll — accurate logging keeps all three correct.',
              when: 'Log time daily or weekly, then submit the week for your manager to approve.',
            }} />
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '2px' }}>
            Log hours, review weekly schedule distribution, and submit billing logs for approval.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <HowToUseGuide moduleKey="timesheets" title="How Timesheets Work" content={TIMESHEETS_HOWTO} />

          {/* View Mode toggle */}
          <div style={{ background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', padding: '3px', display: 'flex', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('grid')}
              className="btn btn-sm"
              style={{
                background: viewMode === 'grid' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '0.375rem 0.625rem',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <Grid size={14} />
              Weekly Grid
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
              <List size={14} />
              List View
            </button>
          </div>

          <button
            onClick={() => { resetForm(); setShowLogModal(true); }}
            className="btn btn-primary"
          >
            <Plus size={16} /> Log Time
          </button>
        </div>
      </div>

      {loadError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)',
          borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8125rem', flexShrink: 0
        }}>
          <AlertCircle size={16} />
          Couldn't load timesheet data. Check your connection and refresh the page.
        </div>
      )}

      {/* ── Calendar / Week Selector ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '0.75rem 1.25rem',
        marginBottom: '1.25rem',
        flexWrap: 'wrap',
        gap: '0.75rem',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={handlePrevWeek}
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
            className="hover:text-primary"
          >
            <ChevronLeft size={16} />
          </button>
          
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CalendarIcon size={16} style={{ color: 'var(--accent)' }} />
            {weekStartStr} — {weekEndStr}
          </span>

          <button
            onClick={handleNextWeek}
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
            className="hover:text-primary"
          >
            <ChevronRight size={16} />
          </button>

          <button
            onClick={handleTodayWeek}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.25rem 0.5rem', marginLeft: '0.5rem' }}
          >
            Today
          </button>
        </div>

        {viewMode === 'grid' && (
          <button
            onClick={handleWeeklySubmit}
            className="btn btn-primary btn-sm"
            style={{ height: '32px' }}
          >
            <Send size={13} />
            Submit Week for Approval
          </button>
        )}
      </div>

      {/* ── Main content view area ── */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', minHeight: 0 }}>
        
        {/* ============================================================
            WEEKLY GRID VIEW
            ============================================================ */}
        {viewMode === 'grid' ? (
          <div className="data-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '980px' }}>
              <thead>
                <tr>
                  <th style={{ width: '260px' }}>Project & Task</th>
                  {weekDays.map((day, idx) => {
                    const isToday = formatLocalDateStr(day) === formatLocalDateStr(new Date());
                    return (
                      <th
                        key={idx}
                        style={{
                          textAlign: 'center',
                          background: isToday ? 'var(--accent-subtle)' : 'transparent',
                          color: isToday ? 'var(--accent)' : 'var(--text-secondary)',
                          borderBottom: isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
                          fontWeight: 700
                        }}
                      >
                        <div>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx]}</div>
                        <div style={{ fontSize: '0.6875rem', marginTop: '2px', fontWeight: 500 }}>{day.getDate()} {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][day.getMonth()]}</div>
                      </th>
                    );
                  })}
                  <th style={{ textAlign: 'center', width: '100px', fontWeight: 700 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {gridRows.map((row, rowIdx) => {
                  let rowTotal = 0;
                  return (
                    <tr key={rowIdx}>
                      <td style={{ padding: '0.75rem 1rem', width: '260px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.project.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                          {row.task ? row.task.title : 'General Scope'}
                        </div>
                      </td>

                      {weekDays.map((day, colIdx) => {
                        const dateStr = formatLocalDateStr(day);
                        const entries = row.entries[dateStr] || [];
                        const sumHrs = entries.reduce((s, e) => s + (parseFloat(e.hours as any) || 0), 0);
                        rowTotal += sumHrs;

                        // Check if today column
                        const isToday = dateStr === formatLocalDateStr(new Date());

                        return (
                          <td
                            key={colIdx}
                            onClick={() => handleCellClick(day, row.project, row.task, entries[0])}
                            style={{
                              textAlign: 'center',
                              cursor: 'pointer',
                              background: isToday ? 'rgba(124, 58, 237, 0.03)' : 'transparent',
                              borderRight: '1px solid var(--border-subtle)',
                              padding: '0.75rem 0.5rem',
                              verticalAlign: 'middle',
                              transition: 'background 0.15s ease'
                            }}
                            className="hover:bg-surface-elevated"
                          >
                            {sumHrs > 0 ? (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                  {sumHrs}
                                </span>
                                {entries.some(e => e.status === 'approved') ? (
                                  <span style={{ fontSize: '0.55rem', color: 'var(--success)', fontWeight: 600 }}>Appr.</span>
                                ) : entries.some(e => e.status === 'submitted') ? (
                                  <span style={{ fontSize: '0.55rem', color: 'var(--info)', fontWeight: 600 }}>Sub.</span>
                                ) : (
                                  <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>Draft</span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Row total */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', background: 'var(--surface-elevated)', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9375rem' }}>
                        {rowTotal > 0 ? `${rowTotal}h` : '—'}
                      </td>
                    </tr>
                  );
                })}

                {gridRows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      No time logged for this week yet. Click cell or click Log Time to insert entries.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          
          // ============================================================
          // LIST VIEW
          // ============================================================
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* List filters panel */}
            <div className="card-elevated" style={{ padding: '0.875rem 1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search user, project, description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.25rem', height: '36px', fontSize: '0.8125rem' }}
                />
              </div>

              <Filter size={14} style={{ color: 'var(--text-muted)' }} />

              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="form-input"
                style={{ width: '150px', height: '36px', padding: '0 0.5rem', fontSize: '0.75rem' }}
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-input"
                style={{ width: '130px', height: '36px', padding: '0 0.5rem', fontSize: '0.75rem' }}
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>

              <select
                value={billableFilter}
                onChange={(e) => setBillableFilter(e.target.value)}
                className="form-input"
                style={{ width: '120px', height: '36px', padding: '0 0.5rem', fontSize: '0.75rem' }}
              >
                <option value="">Any Billing</option>
                <option value="true">Billable Only</option>
                <option value="false">Non-billable Only</option>
              </select>

              {(searchQuery || projectFilter || statusFilter || billableFilter) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setProjectFilter('');
                    setStatusFilter('');
                    setBillableFilter('');
                  }}
                  style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>

            {/* List Table */}
            {isLoading ? (
              <div className="data-table-wrap">
                <SkeletonTable rows={5} cols={8} />
              </div>
            ) : filteredTimesheetsList.length === 0 ? (
              <EmptyState
                title="No timesheets found"
                description={searchQuery || projectFilter || statusFilter || billableFilter ? 'No timesheet logs found matching the selected filters.' : 'You haven’t logged any time yet.'}
                action={<button onClick={() => { resetForm(); setShowLogModal(true); }} className="btn btn-primary btn-sm"><Plus size={14} /> Log Time</button>}
              />
            ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Project</th>
                    <th>Task Scope</th>
                    <th>Description</th>
                    <th>Hours</th>
                    <th>Billing</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTimesheetsList.map((entry) => {
                    let pillColor = 'badge-muted';
                    if (entry.status === 'approved') pillColor = 'badge-success';
                    if (entry.status === 'submitted') pillColor = 'badge-info';
                    if (entry.status === 'rejected') pillColor = 'badge-danger';

                    return (
                      <tr key={entry.id}>
                        <td style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{formatDate(entry.date)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="avatar avatar-sm">
                              {getInitials(entry.user?.name || 'User')}
                            </div>
                            <span style={{ fontSize: '0.8125rem' }}>{entry.user?.name || 'Member'}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{entry.project?.name || `Project #${entry.project_id}`}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{entry.task?.title || 'General Scope'}</span>
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.description || '—'}
                        </td>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{entry.hours}h</td>
                        <td>
                          <span className={`badge ${entry.billable ? 'badge-success' : 'badge-muted'}`} style={{ fontSize: '0.55rem', padding: '1px 4px' }}>
                            {entry.billable ? 'Billable' : 'Non-Billable'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${pillColor}`}>
                            {entry.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                            {entry.status === 'draft' && (
                              <>
                                <button onClick={async () => { if (await confirm({ message: 'Submit this time entry for approval?', variant: 'info' })) submitEntryMutation.mutate(entry.id); }} title="Submit for approval" style={{ padding: '4px', color: 'var(--accent)' }} className="hover:opacity-80">
                                  <Send size={13} />
                                </button>
                                <button onClick={() => handleEditButton(entry)} title="Edit" style={{ padding: '4px', color: 'var(--text-secondary)' }} className="hover:text-primary">
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={async () => { if (await confirm({ message: 'Delete timesheet entry?', variant: 'danger' })) deleteTimesheetMutation.mutate(entry.id); }} title="Delete" style={{ padding: '4px', color: 'var(--text-muted)' }} className="hover:text-danger">
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

          </div>
        )}

      </div>

      {/* ============================================================
          BOTTOM SUMMARY BAR (WEEK TOTALS)
          ============================================================ */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Week Total Hours</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: '2px' }}>
              {totals.total} hrs
            </div>
          </div>
          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', textTransform: 'uppercase', fontWeight: 600 }}>Billable Hours</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--success)', marginTop: '2px' }}>
              {totals.billable} hrs
            </div>
          </div>
          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Non-Billable Hours</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {totals.nonBillable} hrs
            </div>
          </div>
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={12} />
          Logs submitted are locked for editing once approved by a PM.
        </span>
      </div>

      {/* ============================================================
          LOG TIME / EDIT MODAL
          ============================================================ */}
      {showLogModal && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingTimesheetId ? 'Edit Time Entry' : 'Log Time'}</h3>
              <button onClick={() => setShowLogModal(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Date *</label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Hours *</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="24"
                      required
                      placeholder="e.g. 4.5"
                      value={formHours}
                      onChange={(e) => setFormHours(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Project *</label>
                  <select
                    required
                    value={formProjectId}
                    onChange={(e) => { setFormProjectId(e.target.value); setFormTaskId(''); }}
                    className="form-input"
                  >
                    <option value="">Select Project</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Task Scope</label>
                  <select
                    value={formTaskId}
                    onChange={(e) => setFormTaskId(e.target.value)}
                    disabled={!formProjectId}
                    className="form-input"
                  >
                    <option value="">General Scope (No specific task)</option>
                    {formTasksFiltered.map(t => (
                      <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <textarea
                    required
                    placeholder="Describe what was accomplished during this block..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="form-input"
                    style={{ minHeight: '80px', resize: 'vertical', fontSize: '0.875rem' }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none', marginTop: '0.25rem' }}>
                    <input
                      type="checkbox"
                      checked={formBillable}
                      onChange={(e) => setFormBillable(e.target.checked)}
                      style={{ accentColor: 'var(--accent)', width: '15px', height: '15px' }}
                    />
                    <DollarSign size={14} style={{ color: 'var(--success)' }} />
                    Billable Time Log (Charged to project hours)
                  </label>
                  <div style={{ marginLeft: '1.375rem', marginTop: '2px' }}>
                    <HelpIcon text="Uncheck for internal work (meetings, admin, training) that shouldn't be invoiced to the client." size={12} />
                  </div>
                </div>

              </div>

              <div className="modal-footer">
                {editingTimesheetId && (
                  <button
                    type="button"
                    onClick={async () => { if (await confirm({ message: 'Are you sure you want to delete this entry?', variant: 'danger' })) { deleteTimesheetMutation.mutate(editingTimesheetId); setShowLogModal(false); } }}
                    className="btn btn-danger"
                    style={{ marginRight: 'auto' }}
                  >
                    Delete Entry
                  </button>
                )}
                <button type="button" onClick={() => setShowLogModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTimesheetId ? 'Save Changes' : 'Log Time'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
