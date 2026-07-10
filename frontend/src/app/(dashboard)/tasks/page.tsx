'use client';

import { useState, useEffect } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useModal } from '@/providers/ModalProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare, Search, Plus, List, LayoutGrid, Calendar, MoreHorizontal,
  Trash2, User, Clock, AlertCircle, PlusCircle, CheckCircle2, RefreshCw, X, FolderOpen
} from 'lucide-react';
import {
  tasks as tasksApi,
  projects as projectsApi,
  users as usersApi,
  Task, Project, User as UserType,
  getApiErrorMessage
} from '@/lib/api';
import TaskDetailSlideOver from '@/components/TaskDetailSlideOver';
import { formatDate } from '@/lib/utils';
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

const STATUS_COLUMNS = [
  { id: 'todo', label: 'To Do', color: '#3b82f6', bg: 'rgba(59,130,246,0.05)' },
  { id: 'in_progress', label: 'In Progress', color: '#f59e0b', bg: 'rgba(245,158,11,0.05)' },
  { id: 'review', label: 'Review', color: '#7c3aed', bg: 'rgba(124,58,237,0.05)' },
  { id: 'blocked', label: 'Blocked', color: '#ef4444', bg: 'rgba(239,68,68,0.05)' },
  { id: 'done', label: 'Done', color: '#10b981', bg: 'rgba(16,185,129,0.05)' }
];

export default function TasksPage() {
  const { confirm, prompt } = useModal();
  const queryClient = useQueryClient();

  // Layout & Navigation View Mode
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

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');

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
    mutationFn: (data: any) => tasksApi.create(data),
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
    setCreateError('');
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
      title: createTitle,
      project_id: parseInt(createProjectId),
      description: createDescription || undefined,
      priority: createPriority,
      assigned_to: createAssigneeId ? parseInt(createAssigneeId) : undefined,
      due_date: createDueDate || undefined,
      estimated_hours: createEstimate ? parseFloat(createEstimate) : undefined,
      status: 'todo',
      completion_percentage: 0
    });
  };

  const handleCardClick = (id: number) => {
    setSelectedTaskId(id);
    setTaskDetailOpen(true);
  };

  // ============================================================
  // Filtering & Math Metrics
  // ============================================================

  const taskList = tasksData || [];

  const filteredTasks = taskList.filter((t) => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (t.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProject = !projectFilter || t.project_id === parseInt(projectFilter);
    const matchesPriority = !priorityFilter || t.priority === priorityFilter;
    const matchesAssignee = !assigneeFilter || t.assigned_to === parseInt(assigneeFilter);
    return matchesSearch && matchesProject && matchesPriority && matchesAssignee;
  });

  const todoTasks = filteredTasks.filter((t) => t.status === 'todo');
  const inProgressTasks = filteredTasks.filter((t) => t.status === 'in_progress');
  const reviewTasks = filteredTasks.filter((t) => t.status === 'review');
  const blockedTasks = filteredTasks.filter((t) => t.status === 'blocked');
  const doneTasks = filteredTasks.filter((t) => t.status === 'done');

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckSquare size={22} style={{ color: 'var(--accent)' }} />
            Task Manager
            <HelpIcon title="Tasks" content={{
              what: 'A Task is one unit of work that belongs to a project, optionally assigned to a teammate.',
              why: 'Breaking a project into tasks makes it possible to track who is doing what, and whether the project is on track.',
              when: 'Create a task for anything that takes real time and needs to be tracked to completion.',
            }} />
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '2px' }}>
            Track milestones, log timesheet workloads, and check project tasks progression.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <HowToUseGuide moduleKey="tasks" title="How Tasks Work" content={TASKS_HOWTO} />

          {/* Toggle view mode */}
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
              title="Kanban Board"
            >
              <LayoutGrid size={14} style={{ marginRight: '4px' }} />
              Board View
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
              title="List View"
            >
              <List size={14} style={{ marginRight: '4px' }} />
              List View
            </button>
          </div>

          <button
            onClick={() => refetch()}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.5rem' }}
            title="Refresh tasks"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button 
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            <Plus size={16} /> Add Task
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
        {STATUS_COLUMNS.map((col) => {
          const count = taskList.filter((t) => t.status === col.id).length;
          return (
            <div key={col.id} className="kpi-card" style={{ borderLeft: `4px solid ${col.color}` }}>
              <span className="kpi-label" style={{ color: col.color, fontSize: '0.6875rem', textTransform: 'uppercase', fontWeight: 700 }}>{col.label}</span>
              <div className="kpi-value" style={{ marginTop: '0.25rem', fontSize: '1.25rem' }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="card-elevated" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search tasks title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '2.25rem', height: '38px', fontSize: '0.875rem', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Project filter */}
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

          {/* Priority filter */}
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

          {/* Assignee filter */}
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

          {/* Clear Filters */}
          {(searchQuery || projectFilter || priorityFilter || assigneeFilter) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setProjectFilter('');
                setPriorityFilter('');
                setAssigneeFilter('');
              }}
              style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', padding: '0.5rem' }}
            >
              <X size={12} /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Views */}
      {isLoading ? (
        <div className="data-table-wrap" style={{ padding: '2rem' }}>
          <SkeletonTable rows={5} cols={5} />
        </div>
      ) : viewMode === 'kanban' ? (
        /* Kanban Board View */
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '1rem', minHeight: 'calc(100vh - 360px)', alignItems: 'flex-start' }}>
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
                  width: '280px',
                  minWidth: '280px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 'calc(100vh - 320px)',
                  transition: 'background var(--transition-fast), border var(--transition-fast)'
                }}
              >
                {/* Column Title */}
                <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{col.label}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: '9999px', padding: '1px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {colTasks.length}
                  </span>
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
                        borderLeft: `4px solid ${col.color}`,
                        borderRadius: 'var(--radius-md)',
                        padding: '0.875rem',
                        cursor: 'grab',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>TSK-{t.id}</span>
                        <span 
                          className={`badge ${
                            t.priority === 'urgent' ? 'badge-danger' : 
                            t.priority === 'high' ? 'badge-warning' : 
                            t.priority === 'medium' ? 'badge-info' : 'badge-muted'
                          }`}
                          style={{ fontSize: '0.55rem', padding: '1px 4px' }}
                        >
                          {t.priority}
                        </span>
                      </div>

                      <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, margin: 0 }}>{t.title}</h4>
                      
                      {t.project && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.6875rem', color: 'var(--accent)', fontWeight: 550, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          <FolderOpen size={11} />
                          {t.project.name}
                        </div>
                      )}

                      {/* Card Footer */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <Calendar size={11} />
                          {t.due_date ? formatDate(t.due_date) : 'No due date'}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {t.estimated_hours && (
                            <span style={{ fontFamily: 'monospace', fontSize: '0.625rem', background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 4px', borderRadius: 'var(--radius-sm)' }}>
                              {t.estimated_hours}h
                            </span>
                          )}
                          <div className="avatar avatar-sm" style={{ width: 18, height: 18, fontSize: '0.55rem' }} title={t.assignee?.name || 'Unassigned'}>
                            {t.assignee ? t.assignee.name.substring(0, 2).toUpperCase() : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {colTasks.length === 0 && (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                      Empty column
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View (Table Mode) */
        <div className="data-table-wrap">
          {filteredTasks.length === 0 ? (
            <EmptyState
              title={taskList.length === 0 ? 'No tasks yet' : 'No tasks match your filters'}
              description={taskList.length === 0
                ? "Click \"Add Task\" above to create your first task."
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
                    <td style={{ color: 'var(--text-secondary)' }}>{t.assignee?.name || 'Unassigned'}</td>
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
              width: '500px', maxWidth: '90vw',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              zIndex: 61,
              display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
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

            <form onSubmit={handleCreateSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                  <select
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.target.value as any)}
                    className="form-input"
                    style={{ height: '38px', padding: '0 0.5rem', fontSize: '0.875rem' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
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
                  <select
                    value={createAssigneeId}
                    onChange={(e) => setCreateAssigneeId(e.target.value)}
                    className="form-input"
                    style={{ height: '38px', padding: '0 0.5rem', fontSize: '0.875rem' }}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
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
                  <input
                    type="number"
                    placeholder="e.g. 15"
                    value={createEstimate}
                    onChange={(e) => setCreateEstimate(e.target.value)}
                    className="form-input"
                    style={{ height: '38px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
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

      {/* Slide-over Task Detail Drawer */}
      <TaskDetailSlideOver
        open={taskDetailOpen}
        onClose={() => setTaskDetailOpen(false)}
        taskId={selectedTaskId}
      />

    </div>
  );
}
