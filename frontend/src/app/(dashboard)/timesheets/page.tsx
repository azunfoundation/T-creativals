'use client';

import { useState, useMemo, useEffect } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useModal } from '@/providers/ModalProvider';
import { useToast } from '@/hooks/useToast';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight,
  Plus, List, LayoutGrid, Search, Filter, X, Check, Edit2, Trash2,
  DollarSign, Send, AlertCircle, FileCheck2, Hourglass, CheckCircle2,
  Download, Eye, Settings, Monitor, Megaphone, Layers, Palette,
  Briefcase, ArrowRight
} from 'lucide-react';
import {
  timesheets as timesheetsApi,
  projects as projectsApi,
  tasks as tasksApi,
  Timesheet, Project, Task
} from '@/lib/api';
import { formatDate, getInitials } from '@/lib/utils';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const shortDay = (d: Date) => `${d.getDate().toString().padStart(2, '0')} ${MONTHS[d.getMonth()]}`;

/** "21" for whole numbers, "21.5" otherwise — used in the stat cards. */
const fmtHrs = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "21.0h" style used inside the weekly grid. */
const fmtCell = (n: number) => `${n.toFixed(1)}h`;

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

// ============================================================
// Project visual identity (icon avatar + category chip)
// ============================================================

const getProjectStyle = (name: string = '') => {
  const lower = name.toLowerCase();
  if (lower.includes('web') || lower.includes('site') || lower.includes('portal') || lower.includes('app')) {
    return { Icon: Monitor, iconColor: '#7c3aed', iconBg: 'rgba(124, 58, 237, 0.12)', chipClass: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400', label: 'Website' };
  }
  if (lower.includes('social') || lower.includes('marketing') || lower.includes('seo') || lower.includes('campaign') || lower.includes('ads')) {
    return { Icon: Megaphone, iconColor: '#ec4899', iconBg: 'rgba(236, 72, 153, 0.12)', chipClass: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400', label: 'Marketing' };
  }
  if (lower.includes('cloud') || lower.includes('migration') || lower.includes('infra') || lower.includes('dev') || lower.includes('software') || lower.includes('api')) {
    return { Icon: Layers, iconColor: '#10b981', iconBg: 'rgba(16, 185, 129, 0.12)', chipClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400', label: 'Development' };
  }
  if (lower.includes('design') || lower.includes('brand') || lower.includes('logo') || lower.includes('creative')) {
    return { Icon: Palette, iconColor: '#f97316', iconBg: 'rgba(249, 115, 22, 0.12)', chipClass: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400', label: 'Design' };
  }
  return { Icon: Briefcase, iconColor: '#64748b', iconBg: 'rgba(100, 116, 139, 0.12)', chipClass: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400', label: 'General' };
};

const DONUT_COLORS = ['#7c3aed', '#f59e0b', '#10b981', '#3b82f6', '#ec4899'];
const OTHERS_COLOR = '#cbd5e1';
const AVATAR_COLORS = ['bg-violet-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500'];

const statusDotColor = (entries: Timesheet[]) => {
  if (entries.some(e => e.status === 'rejected')) return 'var(--danger)';
  if (entries.some(e => e.status === 'draft')) return 'var(--warning)';
  if (entries.some(e => e.status === 'submitted')) return 'var(--info)';
  return 'var(--success)';
};

const cellStatusLabel = (entries: Timesheet[]) => {
  if (entries.some(e => e.status === 'rejected')) return 'Rejected';
  if (entries.some(e => e.status === 'draft')) return 'Draft';
  if (entries.some(e => e.status === 'submitted')) return 'Submitted';
  return 'Approved';
};

const formatActivityTime = (entry: Timesheet) => {
  const iso = entry.updated_at || entry.created_at;
  if (!iso) return formatDate(entry.date);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return formatDate(entry.date);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${formatDate(d)}, ${time}`;
};

// ============================================================
// Header illustration (clipboard checklist + floating clock)
// ============================================================

function HeaderIllustration() {
  return (
    <div className="relative w-[280px] h-[150px] hidden xl:block select-none overflow-visible shrink-0">
      <div className="absolute right-8 top-2 w-[150px] h-[150px] bg-violet-500/10 rounded-full blur-[40px] z-0" />

      {/* Clipboard checklist card */}
      <div className="absolute right-14 top-5 w-[190px] bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-700/50 rounded-xl shadow-lg p-3 z-10 transition-transform duration-500 hover:-translate-y-1">
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-3.5 bg-violet-200 dark:bg-violet-500/40 rounded-full" />
        <div className="space-y-2.5 mt-1">
          {[16, 24, 20].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-violet-600 dark:text-violet-400" strokeWidth={3} />
              </div>
              <div className={`h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full`} style={{ width: `${w * 4}px` }} />
              <div className="h-1.5 w-7 bg-violet-100 dark:bg-violet-900/40 rounded-full ml-auto" />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-zinc-200 dark:border-zinc-700" />
            <div className="h-1.5 w-14 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
            <div className="h-1.5 w-9 bg-amber-100 dark:bg-amber-900/40 rounded-full ml-auto" />
          </div>
        </div>
      </div>

      {/* Floating clock badge */}
      <div className="absolute right-2 bottom-4 w-14 h-14 bg-gradient-to-br from-violet-400 to-indigo-600 rounded-full shadow-xl shadow-indigo-500/25 flex items-center justify-center z-20 transition-all duration-500 hover:scale-110">
        <Clock className="w-7 h-7 text-white" strokeWidth={1.8} />
      </div>

      {/* Small floating dots */}
      <div className="absolute right-[240px] top-8 w-2.5 h-2.5 bg-violet-400 rounded-full z-0" />
      <div className="absolute right-6 top-2 w-2 h-2 bg-amber-400 rounded-full z-0" />
      <div className="absolute right-[225px] bottom-8 w-3 h-3 border-2 border-violet-300 dark:border-violet-700 rounded-full z-0" />
    </div>
  );
}

export default function TimesheetsPage() {
  const { confirm } = useModal();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Layout states
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentWeekRefDate, setCurrentWeekRefDate] = useState<Date>(new Date());
  const [showWeekends, setShowWeekends] = useState(true);

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

  // Workspace state & sticky project context
  const { activeProjectId, getPagePreference, setPagePreference, isLoaded: workspaceLoaded } = useWorkspace();
  const [isInitialized, setIsInitialized] = useState(false);

  // Grid toolbar filter states
  const [gridSearch, setGridSearch] = useState('');
  const [gridProjectFilter, setGridProjectFilter] = useState('');
  const [gridMemberFilter, setGridMemberFilter] = useState('');

  // List filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [billableFilter, setBillableFilter] = useState('');

  // Hydrate workspace preferences
  useEffect(() => {
    if (!workspaceLoaded || isInitialized) return;
    const saved = getPagePreference<any>('timesheets', null);
    if (saved) {
      if (saved.viewMode) setViewMode(saved.viewMode);
      if (saved.gridSearch !== undefined) setGridSearch(saved.gridSearch);
      if (saved.gridProjectFilter !== undefined) {
        setGridProjectFilter(saved.gridProjectFilter);
      } else if (activeProjectId) {
        setGridProjectFilter(String(activeProjectId));
      }
      if (saved.gridMemberFilter !== undefined) setGridMemberFilter(saved.gridMemberFilter);
      if (saved.searchQuery !== undefined) setSearchQuery(saved.searchQuery);
      if (saved.projectFilter !== undefined) {
        setProjectFilter(saved.projectFilter);
      } else if (activeProjectId) {
        setProjectFilter(String(activeProjectId));
      }
      if (saved.statusFilter !== undefined) setStatusFilter(saved.statusFilter);
      if (saved.billableFilter !== undefined) setBillableFilter(saved.billableFilter);
      if (saved.showWeekends !== undefined) setShowWeekends(saved.showWeekends);
    } else if (activeProjectId) {
      setGridProjectFilter(String(activeProjectId));
      setProjectFilter(String(activeProjectId));
    }
    setIsInitialized(true);
  }, [workspaceLoaded, isInitialized, getPagePreference, activeProjectId]);

  // Persist workspace preferences
  useEffect(() => {
    if (!isInitialized) return;
    setPagePreference('timesheets', {
      viewMode,
      gridSearch,
      gridProjectFilter,
      gridMemberFilter,
      searchQuery,
      projectFilter,
      statusFilter,
      billableFilter,
      showWeekends,
    });
  }, [
    isInitialized,
    viewMode,
    gridSearch,
    gridProjectFilter,
    gridMemberFilter,
    searchQuery,
    projectFilter,
    statusFilter,
    billableFilter,
    showWeekends,
    setPagePreference,
  ]);

  // Pre-select sticky project in log time modal
  useEffect(() => {
    if (showLogModal && activeProjectId && !formProjectId) {
      setFormProjectId(String(activeProjectId));
    }
  }, [showLogModal, activeProjectId, formProjectId]);

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

  const prevWeekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() - 7 + i);
      return d;
    });
  }, [monday]);

  const weekStartStr = useMemo(() => formatDate(weekDays[0]), [weekDays]);
  const weekEndStr = useMemo(() => formatDate(weekDays[6]), [weekDays]);

  const visibleDays = useMemo(
    () => (showWeekends ? weekDays : weekDays.slice(0, 5)),
    [weekDays, showWeekends]
  );

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

  const prevWeekTimesheets = useMemo(() => {
    const startStr = formatLocalDateStr(prevWeekDays[0]);
    const endStr = formatLocalDateStr(prevWeekDays[6]);
    return timesheetsData.filter(t => t.date >= startStr && t.date <= endStr);
  }, [timesheetsData, prevWeekDays]);

  // Member options for the grid toolbar, derived from this week's entries
  const memberOptions = useMemo(() => {
    const map = new Map<number, string>();
    currentWeekTimesheets.forEach(t => {
      if (t.user) map.set(t.user_id, t.user.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [currentWeekTimesheets]);

  // Toolbar project / member filters apply at entry level, before grouping
  const visibleWeekTimesheets = useMemo(() => {
    return currentWeekTimesheets.filter(t => {
      if (gridProjectFilter && t.project_id !== parseInt(gridProjectFilter)) return false;
      if (gridMemberFilter && t.user_id !== parseInt(gridMemberFilter)) return false;
      return true;
    });
  }, [currentWeekTimesheets, gridProjectFilter, gridMemberFilter]);

  // Group timesheets by Project + Task key
  const gridRows = useMemo(() => {
    const rowsMap: Record<string, { project: Project; task?: Task; entries: Record<string, Timesheet[]> }> = {};

    visibleWeekTimesheets.forEach(entry => {
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
  }, [visibleWeekTimesheets, projects, allTasks]);

  // Toolbar search applies on the grouped rows
  const displayedRows = useMemo(() => {
    if (!gridSearch.trim()) return gridRows;
    const q = gridSearch.toLowerCase();
    return gridRows.filter(row =>
      row.project.name.toLowerCase().includes(q) ||
      (row.task?.title || 'general scope').toLowerCase().includes(q)
    );
  }, [gridRows, gridSearch]);

  const sumEntries = (entries: Timesheet[]) =>
    entries.reduce((s, e) => s + (parseFloat(e.hours as any) || 0), 0);

  const dailyTotals = useMemo(() => {
    return visibleDays.map(day => {
      const dateStr = formatLocalDateStr(day);
      return displayedRows.reduce((sum, row) => sum + sumEntries(row.entries[dateStr] || []), 0);
    });
  }, [visibleDays, displayedRows]);

  const gridGrandTotal = useMemo(() => {
    return displayedRows.reduce((sum, row) => {
      return sum + Object.values(row.entries).reduce((s, entries) => s + sumEntries(entries), 0);
    }, 0);
  }, [displayedRows]);

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

  const handleExportReport = () => {
    if (currentWeekTimesheets.length === 0) {
      showToast('No entries to export for this week.', 'info');
      return;
    }
    const header = ['Date', 'User', 'Project', 'Task', 'Hours', 'Billable', 'Status', 'Description'];
    const rows = currentWeekTimesheets.map(t => [
      t.date,
      t.user?.name || '',
      t.project?.name || projects.find(p => p.id === t.project_id)?.name || `Project #${t.project_id}`,
      t.task?.title || 'General Scope',
      t.hours,
      t.billable ? 'Yes' : 'No',
      t.status,
      t.description || ''
    ]);
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheet-week-${formatLocalDateStr(weekDays[0])}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============================================================
  // Filters & List View Calculations
  // ============================================================

  const filteredTimesheetsList = useMemo(() => {
    return timesheetsData.filter(entry => {
      // Search filter
      if (searchQuery) {
        const uName = entry.user_name || entry.user?.name || '';
        const pName = entry.project_name || entry.project?.name || '';
        const desc = entry.description || '';
        const descMatch = desc.toLowerCase().includes(searchQuery.toLowerCase());
        const userMatch = uName.toLowerCase().includes(searchQuery.toLowerCase());
        const projMatch = pName.toLowerCase().includes(searchQuery.toLowerCase());
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

  // ============================================================
  // Week statistics (stat cards + sidebar)
  // ============================================================

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

  const lastWeekTotal = useMemo(
    () => prevWeekTimesheets.reduce((s, t) => s + (parseFloat(t.hours as any) || 0), 0),
    [prevWeekTimesheets]
  );

  const weekDeltaPct = useMemo(() => {
    if (lastWeekTotal <= 0) return null;
    return Math.round(((totals.total - lastWeekTotal) / lastWeekTotal) * 100);
  }, [totals.total, lastWeekTotal]);

  const pendingCount = useMemo(
    () => currentWeekTimesheets.filter(t => t.status === 'submitted').length,
    [currentWeekTimesheets]
  );

  const billablePct = totals.total > 0 ? Math.round((totals.billable / totals.total) * 100) : 0;
  const nonBillablePct = totals.total > 0 ? Math.round((totals.nonBillable / totals.total) * 100) : 0;

  // Hours distribution by project (top 3 + Others)
  const distribution = useMemo(() => {
    const byProject = new Map<number, { name: string; hours: number }>();
    currentWeekTimesheets.forEach(t => {
      const name = t.project?.name || projects.find(p => p.id === t.project_id)?.name || `Project #${t.project_id}`;
      const prev = byProject.get(t.project_id);
      const hrs = parseFloat(t.hours as any) || 0;
      if (prev) prev.hours += hrs;
      else byProject.set(t.project_id, { name, hours: hrs });
    });
    const sorted = Array.from(byProject.values()).sort((a, b) => b.hours - a.hours);
    const top = sorted.slice(0, 3).map((d, i) => ({ ...d, color: DONUT_COLORS[i] }));
    const othersHours = sorted.slice(3).reduce((s, d) => s + d.hours, 0);
    return [...top, { name: 'Others', hours: othersHours, color: OTHERS_COLOR }];
  }, [currentWeekTimesheets, projects]);

  // Daily totals for the trend chart (this week vs last week)
  const dayTotalsFor = (entries: Timesheet[], days: Date[]) =>
    days.map(day => {
      const dateStr = formatLocalDateStr(day);
      return entries.filter(t => t.date === dateStr).reduce((s, t) => s + (parseFloat(t.hours as any) || 0), 0);
    });

  const thisWeekDaily = useMemo(() => dayTotalsFor(currentWeekTimesheets, weekDays), [currentWeekTimesheets, weekDays]);
  const lastWeekDaily = useMemo(() => dayTotalsFor(prevWeekTimesheets, prevWeekDays), [prevWeekTimesheets, prevWeekDays]);

  // Recent activity feed, from latest touched entries
  const recentActivities = useMemo(() => {
    return [...timesheetsData]
      .sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || a.date).getTime();
        const tb = new Date(b.updated_at || b.created_at || b.date).getTime();
        return tb - ta;
      })
      .slice(0, 3);
  }, [timesheetsData]);

  const todayStr = formatLocalDateStr(new Date());

  // ============================================================
  // Donut geometry
  // ============================================================

  const DONUT_R = 44;
  const DONUT_C = 2 * Math.PI * DONUT_R;
  let donutAcc = 0;
  const donutSegments = distribution.map(d => {
    const frac = totals.total > 0 ? d.hours / totals.total : 0;
    const seg = { color: d.color, frac, start: donutAcc };
    donutAcc += frac;
    return seg;
  });

  // ============================================================
  // Trend chart geometry
  // ============================================================

  const CH_W = 640, CH_H = 238;
  const CH_P = { l: 38, r: 16, t: 36, b: 44 };
  const chInnerW = CH_W - CH_P.l - CH_P.r;
  const chInnerH = CH_H - CH_P.t - CH_P.b;
  const chMax = Math.max(...thisWeekDaily, ...lastWeekDaily, 8);
  const chNiceMax = Math.max(Math.ceil(chMax / 10) * 10, 10);
  const chX = (i: number) => CH_P.l + (chInnerW / 6) * i;
  const chY = (v: number) => CH_P.t + chInnerH * (1 - v / chNiceMax);
  const thisWeekPath = thisWeekDaily.map((v, i) => `${i === 0 ? 'M' : 'L'} ${chX(i)} ${chY(v)}`).join(' ');
  const lastWeekPath = lastWeekDaily.map((v, i) => `${i === 0 ? 'M' : 'L'} ${chX(i)} ${chY(v)}`).join(' ');
  const thisWeekArea = `${thisWeekPath} L ${chX(6)} ${CH_H - CH_P.b} L ${chX(0)} ${CH_H - CH_P.b} Z`;
  const chGridVals = Array.from({ length: 4 }, (_, i) => (chNiceMax / 3) * i);

  const isCurrentWeek = weekDays.some(d => formatLocalDateStr(d) === todayStr);

  return (
    <div className="pb-10 max-w-[1600px] mx-auto">

      {/* ══════════════ Header Banner ══════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12121a] shadow-sm mb-5 flex items-center gap-4">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-violet-500/5 to-transparent pointer-events-none" />
        <div className="p-6 flex-1 z-10 min-w-0">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            Timesheets
            <HelpIcon title="Timesheets" content={{
              what: 'Your log of hours worked, by project and task, for each day.',
              why: 'Approved hours feed project profitability, task actuals, and payroll — accurate logging keeps all three correct.',
              when: 'Log time daily or weekly, then submit the week for your manager to approve.',
            }} />
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Log hours, review weekly schedule distribution, and submit billing logs for approval.
          </p>
        </div>

        <HeaderIllustration />

        <div className="flex items-center gap-4 pr-6 z-10 shrink-0">
          <HowToUseGuide moduleKey="timesheets" title="How Timesheets Work" content={TIMESHEETS_HOWTO} />

          {/* View mode tabs */}
          <div className="flex items-center">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
                viewMode === 'grid'
                  ? 'text-violet-600 dark:text-violet-400 border-violet-600 dark:border-violet-400'
                  : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <LayoutGrid size={15} /> Weekly Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
                viewMode === 'list'
                  ? 'text-violet-600 dark:text-violet-400 border-violet-600 dark:border-violet-400'
                  : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <List size={15} /> List View
            </button>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 mb-4 text-[13px]"
          style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          <AlertCircle size={16} />
          Couldn't load timesheet data. Check your connection and refresh the page.
        </div>
      )}

      {/* ══════════════ Week Selector Bar ══════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12121a] shadow-sm px-4 py-3 mb-5">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevWeek}
            aria-label="Previous week"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-violet-600 hover:border-violet-300 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>

          <span className="flex items-center gap-2 px-4 h-9 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-zinc-800 dark:text-zinc-100">
            <CalendarIcon size={15} className="text-violet-600 dark:text-violet-400" />
            {weekStartStr} – {weekEndStr}
          </span>

          <button
            onClick={handleNextWeek}
            aria-label="Next week"
            className="w-9 h-9 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-violet-600 hover:border-violet-300 transition-colors"
          >
            <ChevronRight size={16} />
          </button>

          <button onClick={handleTodayWeek} className="btn btn-secondary btn-sm ml-1 h-9">
            Today
          </button>
        </div>

        {viewMode === 'grid' && (
          <button onClick={handleWeeklySubmit} className="btn btn-primary h-10 px-5">
            <Send size={15} />
            Submit Week for Approval
          </button>
        )}
      </div>

      {viewMode === 'grid' ? (
        <>
          {/* ══════════════ Stats + Week Overview two-column area ══════════════ */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start mb-5">

            {/* ── Left column: stat cards + weekly grid ── */}
            <div className="min-w-0 flex flex-col gap-5">

              {/* Stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
                {/* Week Total Hours */}
                <div className="rounded-2xl p-4 flex items-center gap-3.5 bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20">
                  <div className="w-11 h-11 rounded-full bg-white dark:bg-white/10 shadow-sm flex items-center justify-center shrink-0">
                    <Clock size={20} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Week Total Hours</p>
                    <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">{fmtHrs(totals.total)} hrs</p>
                    {weekDeltaPct === null ? (
                      <p className="text-[11px] font-medium text-zinc-400">no data last week</p>
                    ) : (
                      <p className={`text-[11px] font-semibold ${weekDeltaPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                        {weekDeltaPct >= 0 ? '+' : ''}{weekDeltaPct}% vs last week
                      </p>
                    )}
                  </div>
                </div>

                {/* Billable Hours */}
                <div className="rounded-2xl p-4 flex items-center gap-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                  <div className="w-11 h-11 rounded-full bg-white dark:bg-white/10 shadow-sm flex items-center justify-center shrink-0">
                    <FileCheck2 size={20} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Billable Hours</p>
                    <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">{fmtHrs(totals.billable)} hrs</p>
                    <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{billablePct}% of total</p>
                  </div>
                </div>

                {/* Non-Billable Hours */}
                <div className="rounded-2xl p-4 flex items-center gap-3.5 bg-orange-50 dark:bg-orange-500/10 border border-orange-100 dark:border-orange-500/20">
                  <div className="w-11 h-11 rounded-full bg-white dark:bg-white/10 shadow-sm flex items-center justify-center shrink-0">
                    <Hourglass size={20} className="text-orange-500 dark:text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Non-Billable Hours</p>
                    <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">{fmtHrs(totals.nonBillable)} hrs</p>
                    <p className="text-[11px] font-semibold text-orange-500 dark:text-orange-400">{nonBillablePct}% of total</p>
                  </div>
                </div>

                {/* Pending Approval */}
                <div className="rounded-2xl p-4 flex items-center gap-3.5 bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20">
                  <div className="w-11 h-11 rounded-full bg-white dark:bg-white/10 shadow-sm flex items-center justify-center shrink-0">
                    <CheckCircle2 size={20} className="text-sky-500 dark:text-sky-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Pending Approval</p>
                    <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">{pendingCount > 0 ? pendingCount : 'No'}</p>
                    <p className="text-[11px] font-semibold text-sky-500 dark:text-sky-400">{pendingCount > 0 ? 'entries awaiting review' : 'All clear'}</p>
                  </div>
                </div>
              </div>

              {/* ── Weekly grid card ── */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12121a] shadow-sm overflow-hidden">

                {/* Toolbar */}
                <div className="flex items-center flex-wrap gap-3 p-3.5 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search projects or tasks..."
                      value={gridSearch}
                      onChange={(e) => setGridSearch(e.target.value)}
                      className="form-input"
                      style={{ paddingLeft: '2.25rem', height: '36px', fontSize: '0.8125rem' }}
                    />
                  </div>

                  <select
                    value={gridProjectFilter}
                    onChange={(e) => setGridProjectFilter(e.target.value)}
                    className="form-input"
                    style={{ width: '140px', height: '36px', padding: '0 0.5rem', fontSize: '0.75rem' }}
                  >
                    <option value="">All Projects</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  <select
                    value={gridMemberFilter}
                    onChange={(e) => setGridMemberFilter(e.target.value)}
                    className="form-input"
                    style={{ width: '140px', height: '36px', padding: '0 0.5rem', fontSize: '0.75rem' }}
                  >
                    <option value="">All Members</option>
                    {memberOptions.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => setShowWeekends(w => !w)}
                    title={showWeekends ? 'Hide weekend columns' : 'Show weekend columns'}
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                      showWeekends
                        ? 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                        : 'border-violet-300 dark:border-violet-500/40 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10'
                    }`}
                  >
                    <Settings size={15} />
                  </button>

                  <button
                    onClick={() => { resetForm(); setShowLogModal(true); }}
                    className="btn btn-primary btn-sm"
                    style={{ height: '36px' }}
                  >
                    <Plus size={14} /> Log Time
                  </button>
                </div>

                {/* Grid table */}
                {isLoading ? (
                  <div className="p-4"><SkeletonTable rows={4} cols={8} /></div>
                ) : displayedRows.length === 0 ? (
                  <div className="py-6">
                    <EmptyState
                      title="No time logged for this week"
                      description="Click Log Time to add your first entry — it will appear as a row in the grid."
                      action={<button onClick={() => { resetForm(); setShowLogModal(true); }} className="btn btn-primary btn-sm"><Plus size={14} /> Log Time</button>}
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: showWeekends ? '860px' : '700px' }}>
                      <thead>
                        <tr className="border-b border-zinc-100 dark:border-zinc-800">
                          <th className="text-left text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 py-3 pl-5 pr-3 w-[230px]">
                            Project / Task
                          </th>
                          {visibleDays.map((day, idx) => {
                            const isToday = formatLocalDateStr(day) === todayStr;
                            return (
                              <th key={idx} className={`text-center py-2.5 px-2 ${isToday ? 'bg-violet-50 dark:bg-violet-500/10' : ''}`}>
                                <div className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-600 dark:text-zinc-300'}`}>
                                  {DAY_NAMES[weekDays.indexOf(day)]}
                                </div>
                                <div className={`text-[10px] font-medium mt-0.5 ${isToday ? 'text-violet-500 dark:text-violet-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                                  {shortDay(day)}
                                </div>
                              </th>
                            );
                          })}
                          <th className="text-center text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-3 px-3 w-[80px] bg-zinc-50 dark:bg-zinc-800/40">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRows.map((row, rowIdx) => {
                          const style = getProjectStyle(row.project.name);
                          const RowIcon = style.Icon;
                          const rowTotal = Object.values(row.entries).reduce((s, entries) => s + sumEntries(entries), 0);

                          return (
                            <tr key={rowIdx} className="border-b border-zinc-100 dark:border-zinc-800">
                              {/* Project / Task cell */}
                              <td className="py-3.5 pl-5 pr-3 align-middle">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: style.iconBg }}>
                                    <RowIcon size={18} style={{ color: style.iconColor }} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{row.project.name}</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{row.task ? row.task.title : 'General Scope'}</p>
                                    <span className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold mt-1 ${style.chipClass}`}>
                                      {style.label}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Day cells */}
                              {visibleDays.map((day, colIdx) => {
                                const dateStr = formatLocalDateStr(day);
                                const entries = row.entries[dateStr] || [];
                                const sumHrs = sumEntries(entries);
                                const isToday = dateStr === todayStr;

                                return (
                                  <td
                                    key={colIdx}
                                    onClick={() => handleCellClick(day, row.project, row.task, entries[0])}
                                    className={`text-center align-middle cursor-pointer py-3 px-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
                                      isToday ? 'bg-violet-50 dark:bg-violet-500/10' : ''
                                    }`}
                                  >
                                    {sumHrs > 0 ? (
                                      <div className="inline-flex flex-col items-center gap-0.5">
                                        <span className={`inline-flex items-center gap-1.5 text-sm font-bold tabular-nums ${isToday ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-800 dark:text-zinc-100'}`}>
                                          {fmtCell(sumHrs)}
                                          {!isToday && (
                                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: statusDotColor(entries) }} />
                                          )}
                                        </span>
                                        {isToday ? (
                                          <span className="text-[10px] font-semibold text-violet-500 dark:text-violet-400">{cellStatusLabel(entries)}</span>
                                        ) : entries.length > 1 ? (
                                          <span className="text-[10px] font-semibold text-violet-500 dark:text-violet-400">{entries.length} tasks</span>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div className="inline-flex flex-col items-center gap-0.5">
                                        <span className="text-sm text-zinc-300 dark:text-zinc-600">—</span>
                                        <span className="text-[10px] text-zinc-300 dark:text-zinc-600">0h</span>
                                      </div>
                                    )}
                                  </td>
                                );
                              })}

                              {/* Row total */}
                              <td className="text-center align-middle py-3 px-2 bg-zinc-50 dark:bg-zinc-800/40">
                                <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                                  {rowTotal > 0 ? fmtCell(rowTotal) : '—'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Daily total row */}
                        <tr className="bg-zinc-50/70 dark:bg-zinc-800/30">
                          <td className="py-3 pl-5 pr-3">
                            <span className="text-[13px] font-bold text-violet-700 dark:text-violet-400">Daily Total</span>
                          </td>
                          {visibleDays.map((day, idx) => {
                            const isToday = formatLocalDateStr(day) === todayStr;
                            return (
                              <td key={idx} className={`text-center py-3 px-2 ${isToday ? 'bg-violet-100/70 dark:bg-violet-500/15' : ''}`}>
                                <span className={`text-sm font-bold tabular-nums ${isToday ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-800 dark:text-zinc-100'}`}>
                                  {fmtCell(dailyTotals[idx])}
                                </span>
                              </td>
                            );
                          })}
                          <td className="text-center py-3 px-2 bg-zinc-100 dark:bg-zinc-800/60">
                            <span className="text-sm font-extrabold tabular-nums text-zinc-900 dark:text-zinc-50">{fmtCell(gridGrandTotal)}</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right column: Week Overview ── */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12121a] shadow-sm p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
                  <CalendarIcon size={17} className="text-white" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Week Overview</h3>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 mt-0.5">
                    <Clock size={11} /> {weekStartStr} – {weekEndStr}
                  </p>
                </div>
              </div>

              {/* Progress rows */}
              <div className="space-y-4">
                {[
                  { label: 'Total Hours Logged', value: totals.total, pct: totals.total > 0 ? 100 : 0, color: '#7c3aed' },
                  { label: 'Billable Hours', value: totals.billable, pct: billablePct, color: '#10b981' },
                  { label: 'Non-Billable Hours', value: totals.nonBillable, pct: nonBillablePct, color: '#94a3b8' },
                ].map((rowItem) => (
                  <div key={rowItem.label}>
                    <div className="flex items-end justify-between mb-1.5">
                      <div>
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{rowItem.label}</p>
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{fmtHrs(rowItem.value)} hrs</p>
                      </div>
                      <span className="text-[11px] font-bold" style={{ color: rowItem.color }}>{rowItem.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rowItem.pct}%`, background: rowItem.color }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800 my-5" />

              {/* Hours distribution donut */}
              <h4 className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 mb-3">Hours Distribution</h4>
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <svg width="116" height="116" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r={DONUT_R} fill="none" stroke="var(--surface-elevated)" strokeWidth="14" />
                    {totals.total > 0 && donutSegments.map((seg, i) => (
                      seg.frac > 0 && (
                        <circle
                          key={i}
                          cx="60" cy="60" r={DONUT_R}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="14"
                          strokeDasharray={`${seg.frac * DONUT_C} ${DONUT_C}`}
                          strokeDashoffset={-seg.start * DONUT_C}
                          transform="rotate(-90 60 60)"
                        />
                      )
                    ))}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50 leading-none">{fmtHrs(totals.total)}</span>
                    <span className="text-[9px] font-medium text-zinc-400 mt-0.5 text-center leading-tight">Total<br />Hours</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {distribution.map((d, i) => {
                    const pct = totals.total > 0 ? Math.round((d.hours / totals.total) * 100) : 0;
                    return (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: d.color }} />
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">{d.name}</p>
                          <p className="text-[10px] text-zinc-400">{fmtHrs(d.hours)} hrs ({pct}%)</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800 my-5" />

              <div className="flex gap-2.5">
                <button onClick={handleExportReport} className="btn btn-secondary btn-sm flex-1 justify-center">
                  <Download size={13} /> Export Report
                </button>
                <button onClick={() => setViewMode('list')} className="btn btn-secondary btn-sm flex-1 justify-center">
                  <Eye size={13} /> View Logs
                </button>
              </div>
            </div>
          </div>

          {/* ══════════════ Bottom row: Trend chart + Recent Activities ══════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* Weekly Hours Trend */}
            <div className="lg:col-span-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12121a] shadow-sm p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-[15px] font-bold text-violet-700 dark:text-violet-400">Weekly Hours Trend</h3>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    <span className="w-5 h-[3px] rounded-full bg-violet-600 inline-block" /> This Week
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                    <span className="w-5 border-t-2 border-dashed border-zinc-400 inline-block" /> Last Week
                  </span>
                </div>
              </div>

              <svg viewBox={`0 0 ${CH_W} ${CH_H}`} className="w-full h-auto select-none">
                <defs>
                  <linearGradient id="tsTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Grid lines + Y labels */}
                {chGridVals.map((v, i) => (
                  <g key={i}>
                    <line x1={CH_P.l} y1={chY(v)} x2={CH_W - CH_P.r} y2={chY(v)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,4" opacity="0.5" />
                    <text x={CH_P.l - 8} y={chY(v) + 3.5} textAnchor="end" fill="var(--text-muted)" fontSize="10">{Math.round(v)}h</text>
                  </g>
                ))}

                {/* Last week (dashed) */}
                <path d={lastWeekPath} fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeDasharray="5,5" opacity="0.55" strokeLinejoin="round" />

                {/* This week area + line */}
                <path d={thisWeekArea} fill="url(#tsTrendGrad)" />
                <path d={thisWeekPath} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

                {/* This week points + value badges */}
                {thisWeekDaily.map((v, i) => {
                  const label = `${fmtHrs(v)}h`;
                  const bw = label.length * 6.5 + 14;
                  return (
                    <g key={i}>
                      <circle cx={chX(i)} cy={chY(v)} r="4" fill="#7c3aed" stroke="var(--surface)" strokeWidth="2" />
                      <rect x={chX(i) - bw / 2} y={chY(v) - 27} width={bw} height="18" rx="9" fill="var(--surface)" stroke="var(--border)" />
                      <text x={chX(i)} y={chY(v) - 14.5} textAnchor="middle" fill="var(--text-primary)" fontSize="10" fontWeight="700">{label}</text>
                    </g>
                  );
                })}

                {/* X labels */}
                {weekDays.map((day, i) => {
                  const isToday = formatLocalDateStr(day) === todayStr;
                  return (
                    <g key={i}>
                      <text x={chX(i)} y={CH_H - CH_P.b + 18} textAnchor="middle" fontSize="10" fontWeight={isToday ? 700 : 500}
                        fill={isToday ? '#7c3aed' : 'var(--text-secondary)'}>
                        {DAY_NAMES[i]}
                      </text>
                      <text x={chX(i)} y={CH_H - CH_P.b + 31} textAnchor="middle" fontSize="9"
                        fill={isToday ? '#7c3aed' : 'var(--text-muted)'} fontWeight={isToday ? 600 : 400}>
                        {shortDay(day)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Recent Activities */}
            <div className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12121a] shadow-sm p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Recent Activities</h3>
                <button onClick={() => setViewMode('list')} className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline">
                  View All
                </button>
              </div>

              <div className="flex-1 space-y-1">
                {recentActivities.length === 0 && (
                  <p className="text-sm text-zinc-400 py-6 text-center">No activity yet — log your first hours to get started.</p>
                )}
                {recentActivities.map((entry, i) => {
                  const projName = entry.project_name || entry.project?.name || projects.find(p => p.id === entry.project_id)?.name || `Project #${entry.project_id}`;
                  const userName = entry.user_name || entry.user?.name || 'A team member';
                  const hrs = fmtHrs(parseFloat(entry.hours as any) || 0);
                  const meta = {
                    draft: { text: `logged ${hrs}h to ${projName}`, badge: 'Logged', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
                    submitted: { text: `submitted ${hrs}h on ${projName} for approval`, badge: 'Pending', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
                    approved: { text: `got ${hrs}h approved on ${projName}`, badge: 'Approved', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
                    rejected: { text: `had ${hrs}h rejected on ${projName}`, badge: 'Rejected', cls: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
                  }[entry.status] || { text: `updated ${hrs}h on ${projName}`, badge: 'Updated', cls: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' };

                  return (
                    <div key={entry.id} className="flex items-center gap-3 py-2.5 border-b border-zinc-50 dark:border-zinc-800/60 last:border-0">
                      <div className={`w-9 h-9 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-white text-[11px] font-bold flex items-center justify-center shrink-0`}>
                        {getInitials(userName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-zinc-800 dark:text-zinc-200 truncate">
                          <span className="font-bold">{userName}</span> {meta.text}
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{formatActivityTime(entry)}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold shrink-0 ${meta.cls}`}>{meta.badge}</span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setViewMode('list')}
                className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline flex items-center justify-center gap-1.5 w-full"
              >
                View Full Activity Log <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </>
      ) : (

        // ============================================================
        // LIST VIEW
        // ============================================================
        <div className="flex flex-col gap-4">

          {/* List filters panel */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12121a] shadow-sm px-5 py-3.5 flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search user, project, description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.25rem', height: '36px', fontSize: '0.8125rem' }}
              />
            </div>

            <Filter size={14} className="text-zinc-400" />

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
                className="text-xs font-semibold flex items-center gap-1"
                style={{ color: 'var(--danger)' }}
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
                            {getInitials(entry.user_name || entry.user?.name || 'User')}
                          </div>
                          <span style={{ fontSize: '0.8125rem' }}>{entry.user_name || entry.user?.name || 'Member'}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{entry.project_name || entry.project?.name || `Project #${entry.project_id}`}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{entry.task_title || entry.task?.title || 'General Scope'}</span>
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
