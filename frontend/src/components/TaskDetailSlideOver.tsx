'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Clock, Lock, Play, Pause, Plus, Square, RotateCcw, MoreVertical,
  ChevronDown, CheckCircle2, Trash, AlertCircle, File, Download, Tag as TagIcon
} from 'lucide-react';
import {
  tasks as tasksApi,
  users as usersApi,
  timesheets as timesheetsApi,
  Task, User, TaskComment, Timesheet, TaskAttachment,
  getApiErrorMessage,
} from '@/lib/api';
import { formatRelativeTime, formatDate } from '@/lib/utils';
import { FileUpload } from '@/components/ui/FileUpload';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { useModal } from '@/providers/ModalProvider';
import { useToast } from '@/hooks/useToast';

interface TaskDetailSlideOverProps {
  open: boolean;
  onClose: () => void;
  taskId: number | null;
}

const PRIORITY_META: Record<Task['priority'], { label: string; color: string }> = {
  low: { label: 'Low', color: '#6b7280' },
  medium: { label: 'Medium', color: '#f59e0b' },
  high: { label: 'High', color: '#f97316' },
  urgent: { label: 'Urgent', color: '#ef4444' },
};

const STATUS_LABELS: Record<Task['status'], string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

const formatHMS = (totalSeconds: number) => {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: '6px',
};

export default function TaskDetailSlideOver({ open, onClose, taskId }: TaskDetailSlideOverProps) {
  const queryClient = useQueryClient();
  const { confirm } = useModal();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'timelogs' | 'attachments'>('details');
  const [menuOpen, setMenuOpen] = useState(false);

  // Form & Inline states
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isCommentInternal, setIsCommentInternal] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  // Time Log Form state
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logHours, setLogHours] = useState('');
  const [logDescription, setLogDescription] = useState('');
  const [logBillable, setLogBillable] = useState(true);

  // New subtask state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Local completion percentage (buffered — only sent to API on pointer-up)
  const [localCompletionPct, setLocalCompletionPct] = useState(0);
  const completionDirtyRef = useRef(false);

  // Live-timer tick (1s while the timer is running)
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Keypress Escape handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // ============================================================
  // Queries
  // ============================================================

  const { data: task, isLoading, error } = useQuery<Task>({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const res = await tasksApi.get(taskId!);
      return res.data;
    },
    enabled: open && taskId !== null,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await usersApi.list({ per_page: 100 });
      return res.data.data;
    },
    enabled: open,
  });

  const { data: comments = [] } = useQuery<TaskComment[]>({
    queryKey: ['taskComments', taskId],
    queryFn: async () => {
      const res = await tasksApi.listComments(taskId!);
      return res.data;
    },
    enabled: open && taskId !== null && activeTab === 'comments',
  });

  const { data: timeLogs = [] } = useQuery<Timesheet[]>({
    queryKey: ['taskTimeLogs', taskId],
    queryFn: async () => {
      const res = await timesheetsApi.list({ task_id: taskId });
      return res.data;
    },
    enabled: open && taskId !== null && activeTab === 'timelogs',
  });

  const { data: attachments = [] } = useQuery<TaskAttachment[]>({
    queryKey: ['taskAttachments', taskId],
    queryFn: async () => {
      const res = await tasksApi.listAttachments(taskId!);
      return res.data;
    },
    enabled: open && taskId !== null,
  });

  // Subtasks are real child Task rows (parent_task_id), not a separate checklist model.
  const { data: subtasks = [] } = useQuery<Task[]>({
    queryKey: ['taskSubtasks', taskId],
    queryFn: async () => {
      const res = await tasksApi.list({ parent_task_id: taskId });
      const payload = res.data as any;
      return Array.isArray(payload) ? payload : (payload?.data ?? []);
    },
    enabled: open && taskId !== null,
  });

  // Sync state when task is loaded
  useEffect(() => {
    if (task) {
      setEditingTitle(task.title);
      setEditingDescription(task.description || '');
      // Only sync local completion when not currently dragging
      if (!completionDirtyRef.current) {
        setLocalCompletionPct(task.completion_percentage ?? 0);
      }
    }
  }, [task]);

  const timerRunning = !!task?.timer_started_at;

  useEffect(() => {
    if (!open || !timerRunning) return;
    setNowTick(Date.now());
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [open, timerRunning]);

  // ============================================================
  // Mutations
  // ============================================================

  const updateTaskMutation = useMutation({
    mutationFn: (data: Partial<Task>) => tasksApi.update(taskId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['globalTasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: Task['status']) => tasksApi.updateStatus(taskId!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['globalTasks'] });
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
    },
  });

  const updateCompletionMutation = useMutation({
    mutationFn: (pct: number) => tasksApi.updateCompletion(taskId!, pct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: () => tasksApi.delete(taskId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalTasks'] });
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
      onClose();
    },
  });

  const timerMutation = useMutation({
    mutationFn: (action: 'start' | 'pause' | 'stop' | 'reset') => {
      const fn = {
        start: tasksApi.startTimer,
        pause: tasksApi.pauseTimer,
        stop: tasksApi.stopTimer,
        reset: tasksApi.resetTimer,
      }[action];
      return fn(taskId!);
    },
    onSuccess: (_res, action) => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['globalTasks'] });
      if (action === 'stop') {
        queryClient.invalidateQueries({ queryKey: ['taskTimeLogs', taskId] });
        queryClient.invalidateQueries({ queryKey: ['projectTimesheets'] });
      }
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (data: { comment: string; is_internal: boolean }) =>
      tasksApi.addComment(taskId!, data),
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['taskComments', taskId] });
    },
  });

  const logTimeMutation = useMutation({
    mutationFn: (data: { date: string; hours: number; description: string; billable: boolean }) =>
      tasksApi.logTime(taskId!, data),
    onSuccess: () => {
      setLogHours('');
      setLogDescription('');
      queryClient.invalidateQueries({ queryKey: ['taskTimeLogs', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['projectTimesheets'] });
    },
  });

  const addAttachmentMutation = useMutation({
    mutationFn: (data: { filename: string; file_path: string; file_size?: number; mime_type?: string }) =>
      tasksApi.addAttachment(taskId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskAttachments', taskId] });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) =>
      tasksApi.deleteAttachment(taskId!, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskAttachments', taskId] });
    },
  });

  const addSubtaskMutation = useMutation({
    mutationFn: (title: string) => tasksApi.create({
      title,
      parent_task_id: taskId,
      project_id: task?.project_id,
      status: 'todo',
    }),
    onSuccess: () => {
      setNewSubtaskTitle('');
      queryClient.invalidateQueries({ queryKey: ['taskSubtasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['globalTasks'] });
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to add subtask. Please try again.'), 'error');
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      tasksApi.updateStatus(id, done ? 'done' : 'todo'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSubtasks', taskId] });
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to update subtask status.'), 'error');
    },
  });

  const removeSubtaskMutation = useMutation({
    mutationFn: (id: number) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSubtasks', taskId] });
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to remove subtask.'), 'error');
    },
  });

  // ============================================================
  // Handlers
  // ============================================================

  const handleTitleBlur = () => {
    if (editingTitle && editingTitle !== task?.title) {
      updateTaskMutation.mutate({ title: editingTitle });
    }
  };

  const handleDescriptionBlur = () => {
    if (editingDescription !== task?.description) {
      updateTaskMutation.mutate({ description: editingDescription });
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = newTagInput.trim();
    if (!tag || !task) return;
    const current = task.tags || [];
    if (!current.includes(tag)) {
      updateTaskMutation.mutate({ tags: [...current, tag] });
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    if (!task) return;
    updateTaskMutation.mutate({ tags: (task.tags || []).filter((t) => t !== tag) });
  };

  const handleDeleteTask = async () => {
    setMenuOpen(false);
    if (await confirm({ message: 'Are you sure you want to delete this task?', variant: 'danger' })) {
      deleteTaskMutation.mutate();
    }
  };

  const handleResetTimer = async () => {
    if (await confirm({ message: 'Reset the timer? The unlogged tracked time will be discarded.', variant: 'danger' })) {
      timerMutation.mutate('reset');
    }
  };

  const handleToggleSubtask = (subtask: Task) => {
    toggleSubtaskMutation.mutate({ id: subtask.id, done: subtask.status !== 'done' });
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !task) return;
    addSubtaskMutation.mutate(newSubtaskTitle.trim());
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    addCommentMutation.mutate({
      comment: newComment.trim(),
      is_internal: isCommentInternal,
    });
  };

  const handleLogTimeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hrs = parseFloat(logHours);
    if (isNaN(hrs) || hrs <= 0) return;
    logTimeMutation.mutate({
      date: logDate,
      hours: hrs,
      description: logDescription,
      billable: logBillable,
    });
  };

  // ============================================================
  // Timer derived values
  // ============================================================

  const accumulatedSeconds = task?.timer_accumulated_seconds ?? 0;
  const runningSeconds = timerRunning && task?.timer_started_at
    ? Math.max(0, Math.floor((nowTick - new Date(task.timer_started_at).getTime()) / 1000))
    : 0;
  const sessionSeconds = accumulatedSeconds + runningSeconds;
  const totalTrackedSeconds = Math.round((task?.time_logged ?? 0) * 3600) + sessionSeconds;
  const plannedHours = Number(task?.estimated_hours) || 0;
  const timeProgressPct = plannedHours > 0
    ? Math.min(100, Math.round((totalTrackedSeconds / (plannedHours * 3600)) * 100))
    : 0;
  const timerPaused = !timerRunning && accumulatedSeconds > 0;
  const startedAtLabel = task?.timer_started_at
    ? new Date(task.timer_started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  if (!open) return null;

  const assigneeName = task?.assignee?.name || task?.assignee_name || '';

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 70 }}
        onClick={onClose}
      />

      {/* Slide panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Task Detail"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '672px', maxWidth: '90vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 71,
          display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          animation: 'slideInRight 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-subtle)', border: '1px solid transparent', borderRadius: 'var(--radius-sm)', padding: '2px 6px', fontFamily: 'monospace' }}>
              TSK-{taskId}
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Task Details</span>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer' }}
            className="hover:text-primary hover:bg-surface-elevated"
          >
            <X size={16} />
          </button>
        </div>

        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2rem' }}>
            <div className="animate-pulse" style={{ height: '36px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)' }} />
            <div className="animate-pulse" style={{ height: '150px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)' }} />
            <div className="animate-pulse" style={{ height: '100px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)' }} />
          </div>
        ) : error || !task ? (
          <div style={{ flex: 1, padding: '3rem', textAlign: 'center' }}>
            <AlertCircle size={40} style={{ color: 'var(--danger)', marginBottom: '1rem' }} />
            <h3 style={{ fontWeight: 600 }}>Error loading task details</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>Please close this panel and try again.</p>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Title row: inline-editable title + status pill + kebab menu */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleTitleBlur}
                style={{
                  fontSize: '1.375rem',
                  fontWeight: 700,
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px dashed transparent',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  padding: '2px 0',
                }}
                className="hover:border-gray-500 focus:border-purple-500"
                placeholder="Task Title"
              />

              <div style={{ position: 'relative', flexShrink: 0 }}>
                <select
                  value={task.status}
                  onChange={(e) => updateStatusMutation.mutate(e.target.value as Task['status'])}
                  aria-label="Task status"
                  style={{
                    appearance: 'none', WebkitAppearance: 'none',
                    background: 'var(--accent-subtle)', color: 'var(--accent)',
                    border: 'none', borderRadius: 'var(--radius-md)',
                    padding: '0.45rem 1.9rem 0.45rem 0.875rem',
                    fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', outline: 'none',
                  }}
                >
                  {(Object.keys(STATUS_LABELS) as Task['status'][]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', pointerEvents: 'none' }} />
              </div>

              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Task actions"
                  style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
                  className="hover:bg-surface-elevated"
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => setMenuOpen(false)} />
                    <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: '180px', overflow: 'hidden' }}>
                      {task.status !== 'done' && (
                        <button
                          onClick={() => { setMenuOpen(false); updateStatusMutation.mutate('done'); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.875rem', fontSize: '0.8125rem', color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          className="hover:bg-surface-elevated"
                        >
                          <CheckCircle2 size={14} style={{ color: 'var(--success)' }} /> Mark as Done
                        </button>
                      )}
                      <button
                        onClick={handleDeleteTask}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.625rem 0.875rem', fontSize: '0.8125rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        className="hover:bg-surface-elevated"
                      >
                        <Trash size={14} /> Delete Task
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Meta strip: Priority | Assignee | Due Date | Est. Hours */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-elevated)' }}>
              <div style={{ padding: '0.75rem 0.875rem', borderRight: '1px solid var(--border)' }}>
                <label style={metaLabelStyle}>Priority</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_META[task.priority].color, flexShrink: 0 }} />
                  <select
                    value={task.priority}
                    onChange={(e) => updateTaskMutation.mutate({ priority: e.target.value as Task['priority'] })}
                    aria-label="Priority"
                    style={{ background: 'transparent', border: 'none', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', width: '100%', padding: 0 }}
                  >
                    {(Object.keys(PRIORITY_META) as Task['priority'][]).map((p) => (
                      <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ padding: '0.75rem 0.875rem', borderRight: '1px solid var(--border)' }}>
                <label style={metaLabelStyle}>Assignee</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-foreground)', fontSize: '0.5625rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {assigneeName ? assigneeName.substring(0, 2).toUpperCase() : '—'}
                  </span>
                  <select
                    value={task.assigned_to || ''}
                    onChange={(e) => updateTaskMutation.mutate({ assigned_to: e.target.value ? parseInt(e.target.value) : null })}
                    aria-label="Assignee"
                    style={{ background: 'transparent', border: 'none', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', width: '100%', padding: 0, textOverflow: 'ellipsis' }}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ padding: '0.75rem 0.875rem', borderRight: '1px solid var(--border)' }}>
                <label style={metaLabelStyle}>Due Date</label>
                <input
                  type="date"
                  value={task.due_date ? task.due_date.split('T')[0] : ''}
                  onChange={(e) => updateTaskMutation.mutate({ due_date: e.target.value || undefined })}
                  aria-label="Due date"
                  style={{ background: 'transparent', border: 'none', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', width: '100%', padding: 0 }}
                />
              </div>

              <div style={{ padding: '0.75rem 0.875rem' }}>
                <label style={metaLabelStyle}>Est. Hours</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    defaultValue={task.estimated_hours || ''}
                    key={`est-${task.id}-${task.estimated_hours}`}
                    onBlur={(e) => {
                      const hours = e.target.value ? parseFloat(e.target.value) : undefined;
                      if (hours !== Number(task.estimated_hours)) {
                        updateTaskMutation.mutate({ estimated_hours: hours });
                      }
                    }}
                    placeholder="—"
                    aria-label="Estimated hours"
                    style={{ background: 'transparent', border: 'none', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', width: '100%', padding: 0 }}
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.375rem' }}>
              <TagIcon size={13} style={{ color: 'var(--text-muted)' }} />
              {(task.tags || []).map((tag) => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--accent-subtle)', color: 'var(--accent)', borderRadius: 9999, padding: '2px 8px', fontSize: '0.6875rem', fontWeight: 600 }}>
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    style={{ display: 'flex', color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <form onSubmit={handleAddTag} style={{ display: 'flex' }}>
                <input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="+ Add tag"
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.6875rem', color: 'var(--text-secondary)', width: '90px' }}
                />
              </form>
            </div>

            {/* Time Tracking */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-elevated)' }}>
              <div style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  <Clock size={15} style={{ color: 'var(--accent)' }} />
                  Time Tracking
                </span>
                <span
                  className={`badge ${timerRunning ? 'badge-success' : timerPaused ? 'badge-warning' : 'badge-muted'}`}
                  style={{ fontSize: '0.625rem' }}
                >
                  {timerRunning ? 'Running' : timerPaused ? 'Paused' : 'Not Started'}
                </span>
              </div>

              <div style={{ padding: '0 1rem 0.875rem', display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', gap: '1rem' }}>
                <div>
                  <label style={metaLabelStyle}>Timer</label>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {formatHMS(sessionSeconds)}
                  </div>
                  {timerRunning && (
                    <div style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontWeight: 600, marginTop: '4px' }}>
                      Started at {startedAtLabel}
                    </div>
                  )}
                </div>
                <div>
                  <label style={metaLabelStyle}>Total Tracked</label>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {formatHMS(totalTrackedSeconds)}
                  </div>
                </div>
                <div>
                  <label style={metaLabelStyle}>Planned</label>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {plannedHours > 0 ? plannedHours.toFixed(2) : '—'}
                    {plannedHours > 0 && <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>hrs</span>}
                  </div>
                </div>
              </div>

              <div style={{ padding: '0 1rem 1rem', display: 'flex', gap: '0.5rem' }}>
                {!timerRunning && !timerPaused && (
                  <button
                    onClick={() => timerMutation.mutate('start')}
                    disabled={timerMutation.isPending}
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                  >
                    <Play size={13} /> Start Timer
                  </button>
                )}
                {timerPaused && (
                  <button
                    onClick={() => timerMutation.mutate('start')}
                    disabled={timerMutation.isPending}
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                  >
                    <Play size={13} /> Resume
                  </button>
                )}
                {(timerRunning || timerPaused) && (
                  <>
                    <button
                      onClick={() => timerMutation.mutate('stop')}
                      disabled={timerMutation.isPending}
                      className="btn btn-sm"
                      style={{ flex: 1, background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid transparent', fontWeight: 600 }}
                      title="Stop the timer and log the tracked time"
                    >
                      <Square size={12} /> Stop Timer
                    </button>
                    {timerRunning && (
                      <button
                        onClick={() => timerMutation.mutate('pause')}
                        disabled={timerMutation.isPending}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1 }}
                      >
                        <Pause size={13} /> Pause
                      </button>
                    )}
                    <button
                      onClick={handleResetTimer}
                      disabled={timerMutation.isPending}
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      title="Discard the tracked time without logging it"
                    >
                      <RotateCcw size={13} /> Reset
                    </button>
                  </>
                )}
              </div>

              {plannedHours > 0 && (
                <div style={{ padding: '0 1rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--accent)' }}>{timeProgressPct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 9999, background: 'var(--surface)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                    <div style={{ width: `${timeProgressPct}%`, height: '100%', background: 'var(--accent)', borderRadius: 9999, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                value={editingDescription}
                onChange={(e) => setEditingDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                className="form-input"
                style={{ minHeight: '90px', resize: 'vertical', fontSize: '0.875rem', lineHeight: 1.5 }}
                placeholder="Provide details of work to be completed, visual benchmarks, or technical requirements..."
              />
            </div>

            {/* Completion Slider */}
            <div className="form-group" style={{ background: 'var(--surface-elevated)', padding: '0.875rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Completion Progress</label>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent)' }}>{localCompletionPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={localCompletionPct}
                onChange={(e) => {
                  completionDirtyRef.current = true;
                  setLocalCompletionPct(parseInt(e.target.value));
                }}
                onPointerUp={(e) => {
                  const pct = parseInt((e.target as HTMLInputElement).value);
                  completionDirtyRef.current = false;
                  updateCompletionMutation.mutate(pct);
                }}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer', marginTop: '0.5rem' }}
              />
            </div>

            {/* Tabs Panel */}
            <div style={{ marginTop: '0.25rem' }}>
              {/* Tab buttons */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '1.25rem', marginBottom: '1rem' }}>
                {([
                  { key: 'details', label: 'Subtasks' },
                  { key: 'comments', label: `Comments (${comments.length || task.comments_count || 0})` },
                  { key: 'timelogs', label: 'Time Logs' },
                  { key: 'attachments', label: `Attachments (${attachments.length})` },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      paddingBottom: '0.5rem',
                      color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
                      border: 'none',
                      borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      background: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content: Subtasks */}
              {activeTab === 'details' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Subtasks Checklist
                    <HelpIcon text="Each subtask is its own small task, linked to this one. Checking it off marks it Done; it also shows up in the main Tasks board." />
                  </h4>

                  {/* List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {subtasks.map((sub) => {
                      const isDone = sub.status === 'done';
                      return (
                        <div
                          key={sub.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.5rem 0.75rem',
                            background: 'var(--surface-elevated)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() => handleToggleSubtask(sub)}
                              style={{ width: '15px', height: '15px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                            />
                            <span style={{
                              fontSize: '0.875rem',
                              textDecoration: isDone ? 'line-through' : 'none',
                              color: isDone ? 'var(--text-muted)' : 'var(--text-primary)'
                            }}>
                              {sub.title}
                            </span>
                          </div>
                          <button
                            onClick={() => removeSubtaskMutation.mutate(sub.id)}
                            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                            className="hover:text-danger"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      );
                    })}

                    {subtasks.length === 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '1rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                        No subtasks yet. Add one below to break this task into smaller steps.
                      </div>
                    )}
                  </div>

                  {/* Add form */}
                  <form onSubmit={handleAddSubtask} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <input
                      type="text"
                      placeholder="Add subtask item..."
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      className="form-input"
                      style={{ height: '36px', fontSize: '0.8125rem' }}
                    />
                    <button type="submit" className="btn btn-secondary btn-sm" style={{ height: '36px' }}>
                      <Plus size={14} /> Add
                    </button>
                  </form>
                </div>
              )}

              {/* Tab content: Comments */}
              {activeTab === 'comments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                  {/* Add comment form */}
                  <form onSubmit={handleCommentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--surface-elevated)', padding: '0.875rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <textarea
                      required
                      placeholder="Write a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="form-input"
                      style={{ minHeight: '60px', resize: 'vertical', fontSize: '0.8125rem' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isCommentInternal}
                          onChange={(e) => setIsCommentInternal(e.target.checked)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <Lock size={12} style={{ color: 'var(--warning)' }} />
                        Internal Note (Agency Only)
                      </label>
                      <button type="submit" disabled={addCommentMutation.isPending} className="btn btn-primary btn-sm">
                        Post Comment
                      </button>
                    </div>
                  </form>

                  {/* Comments Timeline */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {comments.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          padding: '0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)',
                          background: c.is_internal ? 'var(--warning-subtle)' : 'transparent',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{c.user?.name || (c as any).user_name || 'User'}</span>
                            {c.is_internal && (
                              <span className="badge badge-warning" style={{ fontSize: '0.55rem', padding: '1px 4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <Lock size={9} /> Internal
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatRelativeTime(c.created_at)}</span>
                        </div>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                          {c.comment}
                        </p>
                      </div>
                    ))}

                    {comments.length === 0 && (
                      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        No comments posted yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab content: Time logs */}
              {activeTab === 'timelogs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                  {/* Log time quick form */}
                  <form onSubmit={handleLogTimeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--surface-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>Quick Log Time</h4>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Date</label>
                        <input
                          type="date"
                          required
                          value={logDate}
                          onChange={(e) => setLogDate(e.target.value)}
                          className="form-input"
                          style={{ height: '34px', fontSize: '0.75rem' }}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Hours Logged</label>
                        <input
                          type="number"
                          step="0.5"
                          required
                          placeholder="e.g. 3.5"
                          value={logHours}
                          onChange={(e) => setLogHours(e.target.value)}
                          className="form-input"
                          style={{ height: '34px', fontSize: '0.75rem' }}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Description</label>
                      <input
                        type="text"
                        required
                        placeholder="What did you work on?"
                        value={logDescription}
                        onChange={(e) => setLogDescription(e.target.value)}
                        className="form-input"
                        style={{ height: '34px', fontSize: '0.75rem' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={logBillable}
                          onChange={(e) => setLogBillable(e.target.checked)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        Billable Time
                      </label>

                      <button type="submit" disabled={logTimeMutation.isPending} className="btn btn-primary btn-sm">
                        Log Hours
                      </button>
                    </div>
                  </form>

                  {/* Time entries list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {timeLogs.map((entry) => (
                      <div
                        key={entry.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.75rem',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{entry.user_name || entry.user?.name || 'Team Member'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {entry.description || 'No description provided'}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {formatDate(entry.date)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.875rem', fontFamily: 'monospace' }}>
                            {entry.hours} hrs
                          </span>
                          <span className={`badge ${entry.billable ? 'badge-success' : 'badge-muted'}`} style={{ fontSize: '0.55rem', padding: '1px 4px' }}>
                            {entry.billable ? 'Billable' : 'Non-Billable'}
                          </span>
                        </div>
                      </div>
                    ))}

                    {timeLogs.length === 0 && (
                      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        No hours logged on this task yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab content: Attachments */}
              {activeTab === 'attachments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Task Attachments</h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Attached documents, briefs, and files for this task.
                    </p>
                  </div>

                  <FileUpload
                    type="attachment"
                    onUploadComplete={(res) => {
                      addAttachmentMutation.mutate({
                        filename: res.filename,
                        file_path: res.file_path,
                        file_size: res.file_size,
                        mime_type: res.mime_type,
                      });
                    }}
                  />

                  {/* Attachments List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-elevated)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                            background: 'var(--surface)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-secondary)', flexShrink: 0
                          }}>
                            <File size={16} />
                          </div>
                          <div style={{ overflow: 'hidden' }}>
                            <div
                              style={{
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap'
                              }}
                              title={att.filename}
                            >
                              {att.filename}
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', marginTop: '2px' }}>
                              <span>{(att.file_size / 1024).toFixed(0)} KB</span>
                              <span>•</span>
                              <span>{att.uploader?.name || 'Uploader'}</span>
                              <span>•</span>
                              <span>{formatDate(att.created_at)}</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <a
                            href={att.file_path && att.file_path.startsWith('http') ? att.file_path : `${process.env.NEXT_PUBLIC_STORAGE_URL || 'http://localhost:8000/storage'}/${att.file_path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              width: 28, height: 28, display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface)', border: '1px solid var(--border)',
                            }}
                            className="hover:text-primary"
                            title="Download File"
                          >
                            <Download size={14} />
                          </a>
                          <button
                            onClick={() => deleteAttachmentMutation.mutate(att.id)}
                            disabled={deleteAttachmentMutation.isPending}
                            style={{
                              width: 28, height: 28, display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface)', border: '1px solid var(--border)',
                              cursor: 'pointer',
                            }}
                            className="hover:text-danger"
                            title="Delete Attachment"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {attachments.length === 0 && (
                      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                        No files attached to this task.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
