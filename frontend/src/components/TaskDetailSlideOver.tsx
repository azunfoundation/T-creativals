'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Calendar, Clock, CheckSquare, MessageSquare,
  Lock, Globe, Play, Plus, Check, ChevronRight, DollarSign, Trash, AlertCircle,
  Paperclip, File, Download
} from 'lucide-react';
import {
  tasks as tasksApi,
  users as usersApi,
  timesheets as timesheetsApi,
  Task, User, TaskComment, Timesheet, TaskAttachment
} from '@/lib/api';
import { formatRelativeTime, formatDate } from '@/lib/utils';
import { FileUpload } from '@/components/ui/FileUpload';
import { HelpIcon } from '@/components/ui/HelpIcon';

interface TaskDetailSlideOverProps {
  open: boolean;
  onClose: () => void;
  taskId: number | null;
}

export default function TaskDetailSlideOver({ open, onClose, taskId }: TaskDetailSlideOverProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'timelogs' | 'attachments'>('details');

  // Form & Inline states
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isCommentInternal, setIsCommentInternal] = useState(false);

  // Time Log Form state
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logHours, setLogHours] = useState('');
  const [logDescription, setLogDescription] = useState('');
  const [logBillable, setLogBillable] = useState(true);

  // New subtask state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

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
    }
  }, [task]);

  // ============================================================
  // Mutations
  // ============================================================

  const updateTaskMutation = useMutation({
    mutationFn: (data: Partial<Task>) => tasksApi.update(taskId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: Task['status']) => tasksApi.updateStatus(taskId!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
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
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      tasksApi.updateStatus(id, done ? 'done' : 'todo'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSubtasks', taskId] });
    },
  });

  const removeSubtaskMutation = useMutation({
    mutationFn: (id: number) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskSubtasks', taskId] });
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

  const handleStatusChange = (status: Task['status']) => {
    updateStatusMutation.mutate(status);
  };

  const handlePriorityChange = (priority: Task['priority']) => {
    updateTaskMutation.mutate({ priority });
  };

  const handleAssigneeChange = (assigneeIdStr: string) => {
    updateTaskMutation.mutate({ assigned_to: assigneeIdStr ? parseInt(assigneeIdStr) : null });
  };

  const handleDueDateChange = (dateStr: string) => {
    updateTaskMutation.mutate({ due_date: dateStr || undefined });
  };

  const handleHoursChange = (hoursStr: string) => {
    const hours = hoursStr ? parseFloat(hoursStr) : null;
    updateTaskMutation.mutate({ estimated_hours: hours || undefined });
  };

  const handleCompletionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    updateCompletionMutation.mutate(val);
  };

  // Subtasks are real Task rows scoped by parent_task_id (see subtasks query above).
  const handleToggleSubtask = (subtask: Task) => {
    toggleSubtaskMutation.mutate({ id: subtask.id, done: subtask.status !== 'done' });
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !task) return;
    addSubtaskMutation.mutate(newSubtaskTitle.trim());
  };

  const handleRemoveSubtask = (subtaskId: number) => {
    removeSubtaskMutation.mutate(subtaskId);
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

  if (!open) return null;

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
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', fontFamily: 'monospace' }}>
              TSK-{taskId}
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Task Details</span>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)' }}
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
          <>
            {/* Scrollable Container */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Title Inline Edit */}
              <div>
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={handleTitleBlur}
                  style={{
                    fontSize: '1.375rem',
                    fontWeight: 700,
                    width: '100%',
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
              </div>

              {/* Status and Priority Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'var(--surface-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(e.target.value as Task['status'])}
                    className="form-input"
                    style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.875rem' }}
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    value={task.priority}
                    onChange={(e) => handlePriorityChange(e.target.value as Task['priority'])}
                    className="form-input"
                    style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.875rem' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Assignee, Due Date & Estimates */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Assignee</label>
                  <select
                    value={task.assigned_to || ''}
                    onChange={(e) => handleAssigneeChange(e.target.value)}
                    className="form-input"
                    style={{ height: '36px', padding: '0 0.5rem', fontSize: '0.8125rem' }}
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
                    value={task.due_date ? task.due_date.split('T')[0] : ''}
                    onChange={(e) => handleDueDateChange(e.target.value)}
                    className="form-input"
                    style={{ height: '36px', fontSize: '0.8125rem' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Est. Hours</label>
                  <input
                    type="number"
                    value={task.estimated_hours || ''}
                    onChange={(e) => handleHoursChange(e.target.value)}
                    className="form-input"
                    placeholder="None"
                    style={{ height: '36px', fontSize: '0.8125rem' }}
                  />
                </div>
              </div>

              {/* Completion Slider */}
              <div className="form-group" style={{ background: 'var(--surface-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Completion Progress</label>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent)' }}>{task.completion_percentage}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={task.completion_percentage}
                  onChange={handleCompletionChange}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer', marginTop: '0.5rem' }}
                />
              </div>

              {/* Description Rich Textarea */}
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  value={editingDescription}
                  onChange={(e) => setEditingDescription(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  className="form-input"
                  style={{ minHeight: '100px', resize: 'vertical', fontSize: '0.875rem', lineHeight: 1.5 }}
                  placeholder="Provide details of work to be completed, visual benchmarks, or technical requirements..."
                />
              </div>

              {/* Tabs Panel */}
              <div style={{ marginTop: '0.5rem' }}>
                {/* Tab buttons */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '1rem', marginBottom: '1rem' }}>
                  <button
                    onClick={() => setActiveTab('details')}
                    style={{
                      paddingBottom: '0.5rem',
                      color: activeTab === 'details' ? 'var(--accent)' : 'var(--text-secondary)',
                      borderBottom: activeTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      fontWeight: 600,
                      fontSize: '0.875rem'
                    }}
                  >
                    Subtasks
                  </button>
                  <button
                    onClick={() => setActiveTab('comments')}
                    style={{
                      paddingBottom: '0.5rem',
                      color: activeTab === 'comments' ? 'var(--accent)' : 'var(--text-secondary)',
                      borderBottom: activeTab === 'comments' ? '2px solid var(--accent)' : '2px solid transparent',
                      fontWeight: 600,
                      fontSize: '0.875rem'
                    }}
                  >
                    Comments ({comments.length || task.comments_count || 0})
                  </button>
                  <button
                    onClick={() => setActiveTab('timelogs')}
                    style={{
                      paddingBottom: '0.5rem',
                      color: activeTab === 'timelogs' ? 'var(--accent)' : 'var(--text-secondary)',
                      borderBottom: activeTab === 'timelogs' ? '2px solid var(--accent)' : '2px solid transparent',
                      fontWeight: 600,
                      fontSize: '0.875rem'
                    }}
                  >
                    Time Logs
                  </button>
                  <button
                    onClick={() => setActiveTab('attachments')}
                    style={{
                      paddingBottom: '0.5rem',
                      color: activeTab === 'attachments' ? 'var(--accent)' : 'var(--text-secondary)',
                      borderBottom: activeTab === 'attachments' ? '2px solid var(--accent)' : '2px solid transparent',
                      fontWeight: 600,
                      fontSize: '0.875rem'
                    }}
                  >
                    Attachments ({attachments.length})
                  </button>
                </div>

                {/* Tab content: Details & Subtasks */}
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
                              onClick={() => handleRemoveSubtask(sub.id)}
                              style={{ color: 'var(--text-muted)' }}
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
                              <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{c.user?.name || 'User'}</span>
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
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{entry.user?.name || 'Team Member'}</div>
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
          </>
        )}
      </div>
    </>
  );
}
