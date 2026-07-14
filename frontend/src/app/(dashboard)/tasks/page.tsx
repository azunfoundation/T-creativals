'use client';

import { useState, useEffect } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useModal } from '@/providers/ModalProvider';
import { useToast } from '@/hooks/useToast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare, Search, Plus, List, LayoutGrid, Calendar, MoreHorizontal,
  Trash2, User, Clock, AlertCircle, PlusCircle, CheckCircle2, RefreshCw, X, FolderOpen,
  Play, Tag as TagIcon, Eye, Lock, Loader2, UploadCloud, Lightbulb, TrendingUp,
  AlertTriangle, Sparkles, Filter, PieChart, Activity, Layers, ListChecks
} from 'lucide-react';
import {
  tasks as tasksApi,
  projects as projectsApi,
  users as usersApi,
  Task, Project, User as UserType,
  getApiErrorMessage
} from '@/lib/api';
import TaskDetailSlideOver from '@/components/TaskDetailSlideOver';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const TASKS_HOWTO = {
  overview: 'Tasks are the individual to-do items that make up a project — this page shows every task across all projects in one place.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Click "Add Task" and pick which project it belongs to — every task must be linked to a project.',
        'Assign it to a teammate and set a due date and priority so it shows up on their radar.',
      ],
    },
    {
      heading: 'Day to day',
      items: [
        'Board View: drag a card to a new column to change its status.',
        'List View: better for scanning many tasks at once, or exporting a filtered list.',
        'Click any task to open its details — update status, log time, comment, or attach a file.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Keep due dates realistic — overdue tasks are the fastest way to spot a project at risk.',
        'Use subtasks (inside a task\'s details) to break down anything that takes more than a day.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Leaving a task "In Progress" forever — move it to Review or Done as soon as it is ready.',
        'Creating a task with no assignee — nobody owns it, so it tends to get forgotten.',
      ],
    },
  ],
};

const PRIORITY_META: Record<'low' | 'medium' | 'high' | 'urgent', { label: string; color: string }> = {
  low: { label: 'Low', color: '#6b7280' },
  medium: { label: 'Medium', color: '#f59e0b' },
  high: { label: 'High', color: '#f97316' },
  urgent: { label: 'Urgent', color: '#ef4444' },
};

const STATUS_COLUMNS = [
  { id: 'todo', label: 'To Do', color: '#3b82f6', bg: 'rgba(59,130,246,0.05)', icon: ListChecks },
  { id: 'in_progress', label: 'In Progress', color: '#f59e0b', bg: 'rgba(245,158,11,0.05)', icon: Loader2 },
  { id: 'review', label: 'Review', color: '#7c3aed', bg: 'rgba(124,58,237,0.05)', icon: Eye },
  { id: 'blocked', label: 'Blocked', color: '#ef4444', bg: 'rgba(239,68,68,0.05)', icon: Lock },
  { id: 'done', label: 'Done', color: '#10b981', bg: 'rgba(16,185,129,0.05)', icon: CheckCircle2 }
];

const TASK_CATEGORIES_STORAGE_KEY = 'creativals_task_categories';
const DAY_MS = 86_400_000;

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

export default function TasksPage() {
  const { confirm, prompt } = useModal();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Layout & Navigation View Mode
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

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

  // Task Categories (client-side quick-pick tags, persisted locally)
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(TASK_CATEGORIES_STORAGE_KEY);
      if (stored) setCategories(JSON.parse(stored));
    } catch {
      // ignore malformed local storage
    }
  }, []);

  const persistCategories = (next: string[]) => {
    setCategories(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TASK_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
    }
  };

  const addCategory = () => {
    const name = newCategoryInput.trim();
    if (name && !categories.includes(name)) {
      persistCategories([...categories, name]);
    }
    setNewCategoryInput('');
  };

  const removeCategory = (name: string) => {
    persistCategories(categories.filter((c) => c !== name));
  };

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [dueDateFilter, setDueDateFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  // Drag and Drop Column state
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);

  // Selected Task for Slide-Over Drawer
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  // Create Task Form State
  const [createTitle, setCreateTitle] = useState('');
  const [createProjectId, setCreateProjectId] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPriority, setCreatePriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [createAssigneeId, setCreateAssigneeId] = useState('');
  const [createDueDate, setCreateDueDate] = useState('');
  const [createEstimate, setCreateEstimate] = useState('');
  const [createTimeTracking, setCreateTimeTracking] = useState(false);
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [createTagInput, setCreateTagInput] = useState('');
  const [createError, setCreateError] = useState('');

  // ============================================================
  // Queries
  // ============================================================

  const { data: tasksData, isLoading, refetch } = useQuery({
    queryKey: ['globalTasks'],
    queryFn: async () => {
      const res = await tasksApi.list({ per_page: 250 });
      // If interceptor returns paginated response envelope, extract data array
      const payload = res.data as any;
      if (payload && Array.isArray(payload.data)) {
        return payload.data as Task[];
      }
      return (Array.isArray(payload) ? payload : []) as Task[];
    }
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projectsList'],
    queryFn: async () => {
      const res = await projectsApi.list({ per_page: 100 });
      const payload = res.data as any;
      if (payload && Array.isArray(payload.data)) {
        return payload.data;
      }
      return Array.isArray(payload) ? payload : [];
    }
  });

  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ['usersList'],
    queryFn: async () => {
      const res = await usersApi.list({ per_page: 100 });
      const payload = res.data as any;
      if (payload && Array.isArray(payload.data)) {
        return payload.data;
      }
      return Array.isArray(payload) ? payload : [];
    }
  });

  // ============================================================
  // Mutations
  // ============================================================

  const updateStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: Task['status'] }) =>
      tasksApi.updateStatus(taskId, status),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['globalTasks'] });
      const previousTasks = queryClient.getQueryData<Task[]>(['globalTasks']);
      if (previousTasks) {
        queryClient.setQueryData<Task[]>(
          ['globalTasks'],
          previousTasks.map((t) => (t.id === taskId ? { ...t, status } : t))
        );
      }
      return { previousTasks };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['globalTasks'], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['globalTasks'] });
    }
  });

  const createTaskMutation = useMutation({
    mutationFn: async ({ data, startTimer }: { data: any; startTimer: boolean }) => {
      const res = await tasksApi.create(data);
      const payload = res.data as any;
      const created: Task | undefined = payload?.data ?? payload;
      // "Timer will start when task begins" — kick the timer off right after creation.
      if (startTimer && created?.id) {
        await tasksApi.startTimer(created.id);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalTasks'] });
      setShowCreateModal(false);
      resetCreateForm();
    },
    onError: (err: any) => {
      setCreateError(getApiErrorMessage(err, 'Failed to create task.'));
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalTasks'] });
    }
  });

  // ============================================================
  // Helpers & Drag-and-Drop Handlers
  // ============================================================

  const resetCreateForm = () => {
    setCreateTitle('');
    setCreateProjectId('');
    setCreateDescription('');
    setCreatePriority('medium');
    setCreateAssigneeId('');
    setCreateDueDate('');
    setCreateEstimate('');
    setCreateTimeTracking(false);
    setCreateTags([]);
    setCreateTagInput('');
    setCreateError('');
  };

  const addCreateTag = (tagOverride?: string) => {
    const tag = (tagOverride ?? createTagInput).trim();
    if (tag && !createTags.includes(tag)) {
      setCreateTags((prev) => [...prev, tag]);
    }
    if (!tagOverride) setCreateTagInput('');
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCreateTag();
    } else if (e.key === 'Backspace' && !createTagInput && createTags.length > 0) {
      setCreateTags((prev) => prev.slice(0, -1));
    }
  };

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedTaskId(id);
    e.dataTransfer.setData('text/plain', id.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: Task['status']) => {
    e.preventDefault();
    const taskIdStr = e.dataTransfer.getData('text/plain') || draggedTaskId?.toString();
    if (taskIdStr) {
      const taskId = parseInt(taskIdStr);
      updateStatusMutation.mutate({ taskId, status });
    }
    setDraggedTaskId(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim() || !createProjectId) {
      setCreateError('Task title and Project selection are required.');
      return;
    }

    createTaskMutation.mutate({
      data: {
        title: createTitle,
        project_id: parseInt(createProjectId),
        description: createDescription || undefined,
        priority: createPriority,
        assigned_to: createAssigneeId ? parseInt(createAssigneeId) : undefined,
        due_date: createDueDate || undefined,
        estimated_hours: createEstimate ? parseFloat(createEstimate) : undefined,
        tags: createTags.length > 0 ? createTags : undefined,
        status: 'todo',
        completion_percentage: 0
      },
      startTimer: createTimeTracking,
    });
  };

  const handleCardClick = (id: number) => {
    setSelectedTaskId(id);
    setTaskDetailOpen(true);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setProjectFilter('');
    setPriorityFilter('');
    setAssigneeFilter('');
    setDueDateFilter('');
    setTagFilter('');
  };

  // ============================================================
  // Filtering & Math Metrics
  // ============================================================

  const taskList = tasksData || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allTags = Array.from(new Set(taskList.flatMap((t) => t.tags ?? []))).sort();

  const filteredTasks = taskList.filter((t) => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProject = !projectFilter || t.project_id === parseInt(projectFilter);
    const matchesPriority = !priorityFilter || t.priority === priorityFilter;
    const matchesAssignee = !assigneeFilter || t.assigned_to === parseInt(assigneeFilter);
    const matchesTag = !tagFilter || (t.tags ?? []).includes(tagFilter);

    let matchesDueDate = true;
    if (dueDateFilter && t.status !== 'done') {
      const due = t.due_date ? new Date(t.due_date) : null;
      if (dueDateFilter === 'overdue') {
        matchesDueDate = !!due && due.getTime() < today.getTime();
      } else if (dueDateFilter === 'today') {
        matchesDueDate = !!due && due.toDateString() === today.toDateString();
      } else if (dueDateFilter === 'week') {
        matchesDueDate = !!due && due.getTime() >= today.getTime() && due.getTime() < today.getTime() + 7 * DAY_MS;
      }
    } else if (dueDateFilter && t.status === 'done') {
      matchesDueDate = false;
    }

    return matchesSearch && matchesProject && matchesPriority && matchesAssignee && matchesTag && matchesDueDate;
  });

  const todoTasks = filteredTasks.filter((t) => t.status === 'todo');
  const inProgressTasks = filteredTasks.filter((t) => t.status === 'in_progress');
  const reviewTasks = filteredTasks.filter((t) => t.status === 'review');
  const blockedTasks = filteredTasks.filter((t) => t.status === 'blocked');
  const doneTasks = filteredTasks.filter((t) => t.status === 'done');

  const hasActiveFilters = !!(searchQuery || projectFilter || priorityFilter || assigneeFilter || dueDateFilter || tagFilter);

  // ============================================================
  // Sidebar & Analytics Data
  // ============================================================

  const statusOverviewSegments = STATUS_COLUMNS.map((col) => ({
    label: col.label,
    color: col.color,
    value: taskList.filter((t) => t.status === col.id).length,
  }));

  const priorityDistribution = (Object.keys(PRIORITY_META) as Array<keyof typeof PRIORITY_META>).map((key) => ({
    label: PRIORITY_META[key].label,
    color: PRIORITY_META[key].color,
    value: taskList.filter((t) => t.priority === key).length,
  }));

  const overdueTasks = taskList.filter((t) => {
    if (t.status === 'done' || !t.due_date) return false;
    const due = new Date(t.due_date);
    return !isNaN(due.getTime()) && due.getTime() < today.getTime();
  });

  // estimated_hours is cast as `decimal:2` on the backend, so the API serializes it as a numeric string (e.g. "15.00").
  const tasksWithEstimate = taskList.filter((t) => Number(t.estimated_hours) > 0);
  const avgTimePerTask = tasksWithEstimate.length > 0
    ? tasksWithEstimate.reduce((sum, t) => sum + Number(t.estimated_hours ?? 0), 0) / tasksWithEstimate.length
    : 0;

  const completionRate = taskList.length > 0 ? (doneTasks.length / taskList.length) * 100 : 0;
  const completionTrend = pctChangeOverWeek(doneTasks.map((t) => t.updated_at));

  const recentActivity = [...taskList]
    .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
    .slice(0, 5)
    .map((t) => {
      const createdTime = t.created_at ? new Date(t.created_at).getTime() : NaN;
      const updatedTime = t.updated_at ? new Date(t.updated_at).getTime() : NaN;
      const isNew = !isNaN(createdTime) && !isNaN(updatedTime) && Math.abs(updatedTime - createdTime) < 60_000;

      let icon = Plus, color = 'var(--info)', bg = 'var(--info-subtle)', text = `New task "${t.title}" created`;
      if (!isNew) {
        if (t.status === 'done') {
          icon = CheckCircle2; color = 'var(--success)'; bg = 'var(--success-subtle)';
          text = `Task "${t.title}" marked as Done`;
        } else if (t.priority === 'urgent') {
          icon = AlertCircle; color = 'var(--danger)'; bg = 'var(--danger-subtle)';
          text = `Task "${t.title}" marked as Urgent`;
        } else {
          icon = RefreshCw; color = 'var(--warning)'; bg = 'var(--warning-subtle)';
          text = `Task "${t.title}" updated`;
        }
      }

      return {
        id: t.id,
        icon,
        color,
        bg,
        text,
        who: t.assignee?.name || t.assignee_name || 'Someone',
        time: formatRelativeTime(t.updated_at ?? t.created_at ?? new Date().toISOString()),
      };
    });

  const productivityTip = overdueTasks.length > 0
    ? `You have ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'} — tackle those first to keep projects on track.`
    : 'Break large tasks into smaller subtasks to track progress more effectively.';

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <CheckSquare size={22} style={{ color: 'var(--accent)' }} />
            Tasks
            <HelpIcon title="Tasks" content={{
              what: 'A Task is one unit of work that belongs to a project, optionally assigned to a teammate.',
              why: 'Breaking a project into tasks makes it possible to track who is doing what, and whether the project is on track.',
              when: 'Create a task for anything that takes real time and needs to be tracked to completion.',
            }} />
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Plan, organize and track tasks across projects.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowCategoriesModal(true)}
            className="btn btn-sm"
            style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <TagIcon size={14} style={{ color: 'var(--accent)' }} /> Manage Categories
          </button>

          {/* Toggle view mode */}
          <div style={{ background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', padding: '3px', display: 'flex', gap: '2px', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('kanban')}
              className="btn btn-sm"
              style={{
                background: viewMode === 'kanban' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'kanban' ? '#fff' : 'var(--text-secondary)',
                padding: '0.375rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              <LayoutGrid size={14} /> Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="btn btn-sm"
              style={{
                background: viewMode === 'list' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'list' ? '#fff' : 'var(--text-secondary)',
                padding: '0.375rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              <List size={14} /> List
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Grid Layout matching the mockup */}
      <div className="board-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: '1.5rem', display: 'grid', alignItems: 'start' }}>
        
        {/* Left Column (Content area) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
          
          {/* Status Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.875rem' }}>
            {STATUS_COLUMNS.map((col) => {
              const count = taskList.filter((t) => t.status === col.id).length;
              const Icon = col.icon;
              return (
                <div key={col.id} style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  transition: 'box-shadow var(--transition-fast)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span style={{
                      width: 38, height: 38, borderRadius: '10px',
                      background: `color-mix(in srgb, ${col.color} 14%, transparent)`,
                      color: col.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Icon size={18} />
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {col.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{count}</div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{count === 1 ? 'Task' : 'Tasks'}</span>
                </div>
              );
            })}
          </div>

          {/* Filter Bar — borderless, clean */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search tasks by title, keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.25rem', height: '38px', fontSize: '0.875rem', width: '100%' }}
              />
            </div>

            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="form-input"
              style={{ minWidth: '150px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_number || `PRJ-${p.id}`} - {p.name}</option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="form-input"
              style={{ width: '130px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
            >
              <option value="">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>

            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="form-input"
              style={{ width: '150px', height: '38px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
            >
              <option value="">All Assignees</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <button
              onClick={() => setShowMoreFilters((v) => !v)}
              className="btn btn-sm"
              style={{
                height: '38px',
                border: '1px solid var(--border)',
                background: showMoreFilters ? 'var(--accent-subtle)' : 'var(--surface)',
                color: showMoreFilters ? 'var(--accent)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <Filter size={13} /> Filters
            </button>

            <button
              onClick={() => refetch()}
              className="btn btn-secondary btn-sm"
              style={{ height: '38px', width: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
              title="Refresh"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', padding: '0.5rem' }}
              >
                <X size={12} /> Clear Filters
              </button>
            )}
          </div>

          {showMoreFilters && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={dueDateFilter}
                onChange={(e) => setDueDateFilter(e.target.value)}
                className="form-input"
                style={{ width: '160px', height: '36px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
              >
                <option value="">Any Due Date</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due Today</option>
                <option value="week">Due This Week</option>
              </select>

              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="form-input"
                style={{ width: '160px', height: '36px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
              >
                <option value="">Any Tag</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          )}

          {/* Kanban columns or List table */}
          {isLoading ? (
            <div className="data-table-wrap" style={{ padding: '2rem' }}>
              <SkeletonTable rows={5} cols={5} />
            </div>
          ) : viewMode === 'kanban' ? (
            <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '1rem', minHeight: '420px', alignItems: 'flex-start', minWidth: 0 }}>
              {STATUS_COLUMNS.map((col) => {
                const colTasks =
                  col.id === 'todo' ? todoTasks :
                  col.id === 'in_progress' ? inProgressTasks :
                  col.id === 'review' ? reviewTasks :
                  col.id === 'blocked' ? blockedTasks : doneTasks;

                return (
                  <div
                    key={col.id}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, col.id as Task['status'])}
                    style={{
                      width: '260px',
                      minWidth: '260px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      display: 'flex',
                      flexDirection: 'column',
                      maxHeight: 'calc(100vh - 340px)',
                      transition: 'background var(--transition-fast), border var(--transition-fast)'
                    }}
                  >
                    {/* Column Title */}
                    <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{col.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: '9999px', padding: '1px 7px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {colTasks.length}
                        </span>
                        <button style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: 'var(--radius-sm)' }}>
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Task Cards Container */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      {colTasks.map((t) => (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, t.id)}
                          onClick={() => handleCardClick(t.id)}
                          className="crm-kanban-card"
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.875rem',
                            cursor: 'grab',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>TSK-{t.id}</span>
                            <span
                              className={`badge ${
                                t.priority === 'urgent' ? 'badge-danger' :
                                t.priority === 'high' ? 'badge-warning' :
                                t.priority === 'medium' ? 'badge-info' : 'badge-muted'
                              }`}
                              style={{ fontSize: '0.55rem', padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                            >
                              {t.priority}
                            </span>
                          </div>

                          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, margin: 0 }}>{t.title}</h4>

                          {t.project && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-secondary)', fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              <FolderOpen size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                              {t.project.name}
                            </div>
                          )}

                          {/* Assignee row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div className="avatar avatar-sm" style={{ width: 22, height: 22, fontSize: '0.6rem', fontWeight: 700 }}>
                              {(t.assignee?.name || t.assignee_name) ? (t.assignee?.name || t.assignee_name)!.substring(0, 2).toUpperCase() : '—'}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {t.assignee?.name || t.assignee_name || 'Unassigned'}
                            </span>
                          </div>

                          {/* Card Footer */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', marginTop: '0.125rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <Calendar size={11} />
                              {t.due_date ? formatDate(t.due_date) : 'No due date'}
                            </span>
                            {t.estimated_hours && (
                              <span style={{ fontFamily: 'monospace', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {t.estimated_hours}h
                              </span>
                            )}
                          </div>
                        </div>
                      ))}

                      {colTasks.length === 0 && getColumnEmptyState(col.id, col.label, col.color, () => setShowCreateModal(true))}
                    </div>

                    {/* Column Footer: quick add */}
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="crm-col-add"
                      style={{
                        margin: '0 0.625rem 0.625rem',
                        padding: '0.4rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px dashed var(--border)',
                        background: 'transparent',
                        color: col.color,
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
                      <Plus size={13} /> Add Task
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="data-table-wrap">
              {filteredTasks.length === 0 ? (
                <EmptyState
                  title={taskList.length === 0 ? 'No tasks yet' : 'No tasks match your filters'}
                  description={taskList.length === 0
                    ? "Click \"Add Task\" to create your first task."
                    : 'Adjust your filters to see more results.'}
                  action={taskList.length === 0 ? (
                    <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
                      <Plus size={14} /> Add Task
                    </button>
                  ) : undefined}
                />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Task Info</th>
                      <th>Project</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Assignee</th>
                      <th>Due Date</th>
                      <th style={{ textAlign: 'right' }}>Estimate</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <button
                            onClick={() => handleCardClick(t.id)}
                            className="hover:text-accent"
                            style={{ fontWeight: 600, color: 'var(--text-primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                          >
                            {t.title}
                          </button>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>TSK-{t.id}</div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {t.project ? t.project.name : '—'}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              t.status === 'done' ? 'badge-success' :
                              t.status === 'in_progress' ? 'badge-accent' : 'badge-info'
                            }`}
                            style={{ fontSize: '0.75rem' }}
                          >
                            {t.status === 'in_progress' ? 'In Progress' : (t.status === 'todo' ? 'To Do' : t.status)}
                          </span>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>
                          <span className={`badge ${
                            t.priority === 'urgent' ? 'badge-danger' :
                            t.priority === 'high' ? 'badge-warning' :
                            t.priority === 'medium' ? 'badge-info' : 'badge-muted'
                          }`} style={{ fontSize: '0.75rem' }}>
                            {t.priority}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{t.assignee?.name || t.assignee_name || 'Unassigned'}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{t.due_date ? formatDate(t.due_date) : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>{t.estimated_hours ? `${t.estimated_hours} hrs` : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={async () => {
                              if (await confirm({ message: 'Are you sure you want to delete this task?', variant: 'danger' })) {
                                deleteTaskMutation.mutate(t.id);
                              }
                            }}
                            className="btn btn-danger btn-sm btn-icon"
                            style={{ padding: '0.375rem' }}
                            title="Delete task"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Bottom Analytics Row */}
          {!isLoading && (
            <div className="stats-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <AnalyticsCard title="Tasks by Priority">
                {taskList.length === 0 ? (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>No tasks yet.</p>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <DonutChart segments={priorityDistribution.filter((s) => s.value > 0)} size={110} thickness={20} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', flex: 1, minWidth: '110px' }}>
                      {priorityDistribution.map((seg) => (
                        <div key={seg.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '0.75rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                            {seg.label}
                          </span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem' }}>
                            {seg.value} ({taskList.length > 0 ? Math.round((seg.value / taskList.length) * 1000) / 10 : 0}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </AnalyticsCard>

              <AnalyticsCard title="Completion Rate">
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {completionRate.toFixed(2)}%
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {doneTasks.length} of {taskList.length} task{taskList.length === 1 ? '' : 's'} completed
                </div>
                <div className="dash-progress" style={{ margin: '0.625rem 0' }}>
                  <div className="dash-progress-fill" style={{ width: `${Math.min(100, completionRate)}%`, background: 'var(--success)' }} />
                </div>
                {completionTrend !== null && (
                  <div style={{ fontSize: '0.75rem', color: completionTrend >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <TrendingUp size={13} /> {completionTrend >= 0 ? '+' : ''}{completionTrend}% vs last 7 days
                  </div>
                )}
              </AnalyticsCard>

              <AnalyticsCard title="Overdue Tasks">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{overdueTasks.length}</div>
                    <span style={{ fontSize: '0.75rem', color: overdueTasks.length > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                      {overdueTasks.length > 0 ? 'Needs attention' : 'All caught up'}
                    </span>
                  </div>
                  <span style={{ width: 44, height: 44, borderRadius: '10px', background: 'var(--danger-subtle)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertTriangle size={20} />
                  </span>
                </div>
              </AnalyticsCard>

              <AnalyticsCard title="Avg. Time / Task">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{avgTimePerTask.toFixed(2)}h</div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Across all tasks</span>
                  </div>
                  <span style={{ width: 44, height: 44, borderRadius: '10px', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Clock size={20} />
                  </span>
                </div>
              </AnalyticsCard>
            </div>
          )}

        </div>

        {/* Right Column (Sidebar area) */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>

          {/* Task Overview */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.125rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0, marginBottom: '1rem' }}>
              <PieChart size={15} style={{ color: 'var(--accent)' }} /> Task Overview
            </h3>
            {taskList.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>No tasks yet — create one to see the breakdown.</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <DonutChart segments={statusOverviewSegments.filter((s) => s.value > 0)} size={110} thickness={20} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '130px' }}>
                  {statusOverviewSegments.map((seg) => (
                    <div key={seg.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '0.75rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                        {seg.label}
                      </span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem' }}>
                        {seg.value} ({taskList.length > 0 ? Math.round((seg.value / taskList.length) * 1000) / 10 : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.125rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                <Activity size={15} style={{ color: 'var(--accent)' }} /> Recent Activity
              </h3>
              <button
                onClick={() => setViewMode('list')}
                style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                View all
              </button>
            </div>
            {recentActivity.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>No activity yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {recentActivity.map((a) => {
                  const ActIcon = a.icon;
                  return (
                    <div key={a.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <span style={{ width: 30, height: 30, borderRadius: '50%', background: a.bg, color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ActIcon size={14} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {a.text}
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          {a.who} · {a.time}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.125rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0, marginBottom: '0.875rem' }}>
              <Sparkles size={15} style={{ color: 'var(--accent)' }} /> Quick Actions
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <QuickAction
                icon={Plus} iconBg="rgba(124, 58, 237, 0.08)" iconColor="var(--accent)"
                title="Add New Task" caption="Create a new task"
                onClick={() => setShowCreateModal(true)}
              />
              <QuickAction
                icon={UploadCloud} iconBg="rgba(16, 185, 129, 0.08)" iconColor="#10b981"
                title="Import Tasks" caption="From CSV / Excel"
                onClick={() => showToast('CSV / Excel import is coming soon.', 'info')}
              />
              <QuickAction
                icon={TagIcon} iconBg="rgba(59, 130, 246, 0.08)" iconColor="#3b82f6"
                title="Manage Categories" caption="Create & edit categories"
                onClick={() => setShowCategoriesModal(true)}
              />
              <QuickAction
                icon={Layers} iconBg="rgba(245, 158, 11, 0.08)" iconColor="#f59e0b"
                title="Task Templates" caption="Use pre-built templates"
                onClick={() => showToast('Apply a task template from inside a project via "Apply Template".', 'info')}
              />
            </div>
          </div>

          {/* Productivity Tip */}
          <div style={{
            background: 'linear-gradient(135deg, #e0e7ff 0%, #fae8ff 100%)',
            border: '1px solid #ddd6fe',
            borderRadius: 'var(--radius-lg)',
            padding: '1.125rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
              <h4 style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lightbulb size={15} style={{ color: '#f59e0b' }} /> Productivity Tip
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{productivityTip}</p>
            </div>
            
            {/* Embedded illustration decoration */}
            <div style={{ flexShrink: 0, opacity: 0.85, zIndex: 1 }}>
              <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="44" cy="40" r="16" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="2"/>
                <circle cx="44" cy="40" r="10" fill="#ffedd5" stroke="#f59e0b" strokeWidth="1.5"/>
                <circle cx="44" cy="40" r="4" fill="#ef4444"/>
                <path d="M24 20 L38 34" stroke="#1f2937" strokeWidth="2" strokeLinecap="round"/>
                <path d="M38 34 L36 30 M38 34 L34 32" stroke="#1f2937" strokeWidth="2"/>
                <rect x="8" y="14" width="22" height="30" rx="3" fill="white" stroke="#374151" strokeWidth="2"/>
                <rect x="13" y="10" width="12" height="6" rx="1" fill="#e2e8f0" stroke="#374151" strokeWidth="2"/>
                <line x1="12" y1="22" x2="22" y2="22" stroke="#94a3b8" strokeWidth="2" />
                <line x1="12" y1="28" x2="18" y2="28" stroke="#94a3b8" strokeWidth="2" />
              </svg>
            </div>
          </div>
        </aside>

      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 60 }} onClick={() => setShowCreateModal(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add New Task"
            style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '560px', maxWidth: '92vw', maxHeight: '92vh',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              zIndex: 61,
              display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <PlusCircle size={18} style={{ color: 'var(--accent)' }} />
                Add New Task
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer' }}
                className="hover:text-primary hover:bg-surface-elevated"
              >
                <X size={16} />
              </button>
            </div>

            {createError && (
              <div style={{ margin: '1rem 1.5rem 0', padding: '0.75rem', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <AlertCircle size={16} style={{ color: 'var(--danger)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
              <div className="form-group">
                <label className="form-label">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="What needs to be completed?"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Select Project *</label>
                  <select
                    required
                    value={createProjectId}
                    onChange={(e) => setCreateProjectId(e.target.value)}
                    className="form-input"
                    style={{ height: '38px', padding: '0 0.5rem', fontSize: '0.875rem' }}
                  >
                    <option value="">Select a project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: PRIORITY_META[createPriority].color, pointerEvents: 'none' }} />
                    <select
                      value={createPriority}
                      onChange={(e) => setCreatePriority(e.target.value as any)}
                      className="form-input"
                      style={{ height: '38px', padding: '0 0.5rem 0 1.625rem', fontSize: '0.875rem', width: '100%' }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  placeholder="Task details and scope..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="form-input"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Assignee</label>
                  <div style={{ position: 'relative' }}>
                    <User size={14} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <select
                      value={createAssigneeId}
                      onChange={(e) => setCreateAssigneeId(e.target.value)}
                      className="form-input"
                      style={{ height: '38px', padding: '0 0.5rem 0 1.875rem', fontSize: '0.875rem', width: '100%' }}
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input
                    type="date"
                    value={createDueDate}
                    onChange={(e) => setCreateDueDate(e.target.value)}
                    className="form-input"
                    style={{ height: '38px' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Estimate (Hours)</label>
                  <div style={{ position: 'relative' }}>
                    <Clock size={14} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      placeholder="e.g. 15"
                      value={createEstimate}
                      onChange={(e) => setCreateEstimate(e.target.value)}
                      className="form-input"
                      style={{ height: '38px', paddingLeft: '1.875rem', width: '100%' }}
                    />
                  </div>
                </div>
              </div>

              {/* Time Tracking (optional) */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', background: 'var(--surface-elevated)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    <Clock size={15} style={{ color: 'var(--accent)' }} />
                    Time Tracking
                  </span>
                  <span className="badge badge-muted" style={{ fontSize: '0.625rem' }}>Optional</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={createTimeTracking}
                    aria-label="Enable time tracking for this task"
                    onClick={() => setCreateTimeTracking((v) => !v)}
                    style={{
                      width: 40, height: 22, borderRadius: 9999, border: 'none', cursor: 'pointer',
                      position: 'relative', flexShrink: 0, padding: 0,
                      background: createTimeTracking ? 'var(--accent)' : 'var(--surface-hover)',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    <span style={{ position: 'absolute', top: 3, left: createTimeTracking ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease', boxShadow: 'var(--shadow-sm)' }} />
                  </button>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-primary)' }}>Enable time tracking for this task</span>
                </div>

                {createTimeTracking && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Start Timer</label>
                      <div style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.75rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.75rem', background: 'var(--surface)' }}>
                        <Play size={13} style={{ flexShrink: 0 }} />
                        Timer will start when task begins
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Planned Hours</label>
                      <div style={{ position: 'relative' }}>
                        <Clock size={14} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          placeholder="e.g. 10.00"
                          value={createEstimate}
                          onChange={(e) => setCreateEstimate(e.target.value)}
                          className="form-input"
                          style={{ height: '38px', paddingLeft: '1.875rem', paddingRight: '2.5rem', width: '100%' }}
                        />
                        <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.75rem' }}>hrs</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tags */}
              <div className="form-group">
                <label className="form-label">Add Tags (Optional)</label>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.375rem', padding: '0.375rem 0.625rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface)', minHeight: '42px' }}>
                  <TagIcon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  {createTags.map((tag) => (
                    <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--accent-subtle)', color: 'var(--accent)', borderRadius: 9999, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {tag}
                      <button
                        type="button"
                        onClick={() => setCreateTags(createTags.filter((t) => t !== tag))}
                        aria-label={`Remove tag ${tag}`}
                        style={{ display: 'flex', color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  <input
                    value={createTagInput}
                    onChange={(e) => setCreateTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => addCreateTag()}
                    placeholder={createTags.length === 0 ? 'Type and press Enter to add tags...' : ''}
                    style={{ flex: 1, minWidth: '140px', border: 'none', outline: 'none', background: 'transparent', fontSize: '0.8125rem', color: 'var(--text-primary)', height: '26px' }}
                  />
                </div>
                {categories.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem' }}>
                    {categories.filter((c) => !createTags.includes(c)).map((cat) => (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => addCreateTag(cat)}
                        style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, border: '1px dashed var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
                      >
                        + {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTaskMutation.isPending}
                  className="btn btn-primary"
                >
                  {createTaskMutation.isPending ? 'Saving...' : 'Save Task'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Manage Categories Modal */}
      {showCategoriesModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 60 }} onClick={() => setShowCategoriesModal(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Manage Categories"
            style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '440px', maxWidth: '92vw', maxHeight: '85vh',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              zIndex: 61,
              display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <TagIcon size={18} style={{ color: 'var(--accent)' }} />
                Manage Categories
              </h3>
              <button
                onClick={() => setShowCategoriesModal(false)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer' }}
                className="hover:text-primary hover:bg-surface-elevated"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
                Quick-pick categories show up as one-click tag suggestions when creating a task.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                  placeholder="e.g. Design, Bug Fix, Client Request..."
                  className="form-input"
                  style={{ flex: 1 }}
                />
                <button onClick={addCategory} className="btn btn-primary btn-sm">
                  <Plus size={14} /> Add
                </button>
              </div>

              {categories.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No categories yet — add one above.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {categories.map((cat) => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-elevated)' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>{cat}</span>
                      <button onClick={() => removeCategory(cat)} className="btn btn-danger btn-sm btn-icon" title="Remove category">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Slide-over Task Detail Drawer */}
      <TaskDetailSlideOver
        open={taskDetailOpen}
        onClose={() => setTaskDetailOpen(false)}
        taskId={selectedTaskId}
      />

    </div>
  );
}

// ============================================================
// Presentational helpers & Illustrations
// ============================================================

function getColumnEmptyState(colId: string, colLabel: string, colColor: string, onAddClick?: () => void) {
  let illustration;
  let text = `No tasks in ${colLabel.toLowerCase()}`;
  
  if (colId === 'todo') {
    illustration = (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="28" fill="rgba(59, 130, 246, 0.08)" />
        <rect x="22" y="18" width="20" height="28" rx="2" stroke="#3b82f6" strokeWidth="2" fill="white" />
        <line x1="26" y1="24" x2="38" y2="24" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
        <line x1="26" y1="30" x2="34" y2="30" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
        <line x1="26" y1="36" x2="36" y2="36" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  } else if (colId === 'in_progress') {
    text = 'No tasks in progress';
    illustration = (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="28" fill="rgba(245, 158, 11, 0.08)" />
        <rect x="22" y="20" width="20" height="26" rx="2" stroke="#f59e0b" strokeWidth="2" fill="white" />
        <path d="M28 16 H36 V20 H28 Z" fill="#ffedd5" stroke="#f59e0b" strokeWidth="1.5" />
        <circle cx="28" cy="28" r="2" fill="#f59e0b" />
        <circle cx="28" cy="34" r="2" fill="#f59e0b" />
        <line x1="32" y1="28" x2="38" y2="28" stroke="#fdba74" strokeWidth="2" strokeLinecap="round" />
        <line x1="32" y1="34" x2="36" y2="34" stroke="#fdba74" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  } else if (colId === 'review') {
    text = 'No tasks to review';
    illustration = (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="28" fill="rgba(124, 58, 237, 0.08)" />
        <rect x="22" y="18" width="20" height="28" rx="2" stroke="#7c3aed" strokeWidth="2" fill="white" />
        <circle cx="36" cy="36" r="5" stroke="#7c3aed" strokeWidth="2" fill="white" />
        <line x1="39.5" y1="39.5" x2="44" y2="44" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
        <line x1="26" y1="24" x2="38" y2="24" stroke="#ddd6fe" strokeWidth="2" />
        <line x1="26" y1="29" x2="32" y2="29" stroke="#ddd6fe" strokeWidth="2" />
      </svg>
    );
  } else if (colId === 'blocked') {
    text = 'No blocked tasks';
    illustration = (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="28" fill="rgba(239, 68, 68, 0.08)" />
        <rect x="23" y="26" width="18" height="16" rx="2" stroke="#ef4444" strokeWidth="2" fill="white" />
        <path d="M27 26 V21 C27 18 29 16 32 16 C35 16 37 18 37 21 V26" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="33" r="2" fill="#ef4444" />
        <line x1="32" y1="35" x2="32" y2="38" stroke="#ef4444" strokeWidth="1.5" />
      </svg>
    );
  } else {
    illustration = (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="28" fill="rgba(16, 185, 129, 0.08)" />
        <circle cx="32" cy="32" r="14" stroke="#10b981" strokeWidth="2" fill="white" />
        <path d="M26 32 L30 36 L38 27" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <div style={{ padding: '2.5rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      {illustration}
      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {text}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Drag tasks here or{' '}
        <button
          onClick={onAddClick}
          style={{ color: colColor, fontWeight: 600 }}
        >
          + Add new task
        </button>
      </div>
    </div>
  );
}

function AnalyticsCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.125rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: '0.5rem' }}>{title}</h3>
      {children}
    </div>
  );
}

function QuickAction({ icon: Icon, iconBg, iconColor, title, caption, onClick }: {
  icon: React.ComponentType<any>;
  iconBg: string;
  iconColor: string;
  title: string;
  caption: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="crm-quick-action"
      style={{
        display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start',
        padding: '0.75rem', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)', background: 'transparent',
        width: '100%', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{ width: 32, height: 32, borderRadius: '8px', background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{caption}</span>
      </span>
    </button>
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} role="img" aria-label="Distribution chart">
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
