'use client';

import { useState } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useModal } from '@/providers/ModalProvider';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, DollarSign, Clock, Users, CheckSquare, Plus,
  ChevronRight, ArrowLeft, MoreHorizontal, UserPlus, CheckCircle2,
  AlertTriangle, Play, HelpCircle, Eye, LogIn, TrendingUp, Info, X,
  File, Download, Trash
} from 'lucide-react';
import Link from 'next/link';
import {
  projects as projectsApi,
  users as usersApi,
  tasks as tasksApi,
  getApiErrorMessage,
  Project, User, Task, Timesheet, Milestone, ProjectProfitability, ProjectDocument
} from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import TaskDetailSlideOver from '@/components/TaskDetailSlideOver';
import ApplyTemplateModal from '../components/ApplyTemplateModal';
import { FileUpload } from '@/components/ui/FileUpload';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const PROJECT_DETAIL_HOWTO = {
  overview: 'This page is mission control for one project: its team, timeline, tasks, milestones, hours, and money.',
  sections: [
    {
      heading: 'Tabs',
      items: [
        'Overview — description, timeline, and milestone progress.',
        'Tasks — a board of every task, grouped by status. Click a card to open its details.',
        'Timesheets — hours logged by the team against this project.',
        'Profitability — revenue vs. cost so far, and the resulting margin.',
        'Documents — files shared for this project (briefs, assets, deliverables).',
      ],
    },
    {
      heading: 'Managing the team',
      items: [
        'Use "Add" under Members to bring a teammate onto the project.',
        'The Manager is fixed when the project is created and cannot be removed here.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Update task status as work moves — the Tasks Done and Completion % figures are calculated from it, not typed in manually.',
        'Check the Profitability tab before making scope or timeline changes — it shows if the project is still on budget.',
      ],
    },
  ],
};

export default function ProjectDetailPage() {
  const { confirm, prompt } = useModal();
  const { showToast } = useToast();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = parseInt(params.id as string) || 1;

  // UI Tabs State
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'timesheets' | 'profitability' | 'documents'>('overview');

  // Slide-over task detail panel
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  // New task inline form toggle
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState<'todo' | 'in_progress' | 'review' | 'blocked' | 'done'>('todo');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskEstimate, setNewTaskEstimate] = useState('');

  // Add Member inline toggle
  const [showAddMemberForm, setShowAddMemberForm] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedMemberRole, setSelectedMemberRole] = useState('member');

  // Add Milestone inline toggle
  const [showAddMilestoneForm, setShowAddMilestoneForm] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState('');

  // ============================================================
  // Queries
  // ============================================================

  // No mock default — a fake project must never be shown/edited when the API
  // fails. Loading and error states are rendered explicitly below.
  const { data: project, isLoading: isProjectLoading, isError: isProjectError } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const res = await projectsApi.get(projectId);
      const data = res.data;
      if (!data) throw new Error('Project not found.');
      data.budget = data.budget_amount !== undefined ? parseFloat(data.budget_amount as any) : data.budget;
      return data;
    }
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['projectTasks', projectId],
    queryFn: async () => {
      const res = await projectsApi.tasks(projectId);
      return res.data;
    }
  });

  const { data: timesheets = [] } = useQuery<Timesheet[]>({
    queryKey: ['projectTimesheets', projectId],
    queryFn: async () => {
      try {
        const res = await projectsApi.timesheets(projectId);
        const list = Array.isArray(res.data) ? res.data : [];
        return list.map((t: any) => ({
          ...t,
          hours: parseFloat(t.hours_logged) || parseFloat(t.hours) || 0,
          billable: t.is_billable !== undefined ? !!t.is_billable : (t.billable !== undefined ? !!t.billable : true)
        }));
      } catch {
        return [];
      }
    }
  });

  const { data: milestones = [] } = useQuery<Milestone[]>({
    queryKey: ['projectMilestones', projectId],
    queryFn: async () => {
      const res = await projectsApi.milestones(projectId);
      return res.data;
    }
  });

  // Zeroed default — showing fabricated profit numbers on API failure is worse
  // than showing zeros.
  const { data: profitability = {
    project_id: 0, project_name: '', budget_amount: 0, revenue: 0,
    labor_cost: 0, expense_cost: 0, total_cost: 0, net_profit: 0, margin_percentage: 0,
  } } = useQuery<ProjectProfitability>({
    queryKey: ['projectProfitability', projectId],
    queryFn: async () => {
      const res = await projectsApi.profitability(projectId);
      return res.data;
    }
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await usersApi.list({ per_page: 100 });
      return res.data.data;
    }
  });

  const { data: documents = [] } = useQuery<ProjectDocument[]>({
    queryKey: ['projectDocuments', projectId],
    queryFn: async () => {
      try {
        const res = await projectsApi.listDocuments(projectId);
        return res.data;
      } catch {
        return [];
      }
    },
    enabled: !!projectId,
  });

  // ============================================================
  // Mutations
  // ============================================================

  // Previously this mutation NEVER called the task API — it faked the insert in
  // the query cache, so tasks created here silently vanished on reload.
  const createTaskMutation = useMutation({
    mutationFn: (data: any) => tasksApi.create({ ...data, project_id: projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
      setShowCreateTaskModal(false);
      resetTaskForm();
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to create task.'), 'error');
    }
  });

  const addMemberMutation = useMutation({
    mutationFn: (data: { user_id: number; role?: string }) => projectsApi.addMember(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowAddMemberForm(false);
      setSelectedMemberId('');
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to add member.'), 'error');
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => projectsApi.removeMember(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    }
  });

  const createMilestoneMutation = useMutation({
    mutationFn: (data: { name: string; due_date?: string }) => projectsApi.createMilestone(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMilestones', projectId] });
      setShowAddMilestoneForm(false);
      setNewMilestoneName('');
      setNewMilestoneDueDate('');
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to add milestone.'), 'error');
    }
  });

  const toggleMilestoneMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      projectsApi.updateMilestone(id, {
        status: completed ? 'completed' : 'in_progress',
        completion_percentage: completed ? 100 : 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMilestones', projectId] });
    }
  });

  const addDocumentMutation = useMutation({
    mutationFn: (data: { filename: string; file_path: string; file_size?: number; mime_type?: string }) =>
      projectsApi.addDocument(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectDocuments', projectId] });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: number) =>
      projectsApi.deleteDocument(projectId, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectDocuments', projectId] });
    },
  });

  // ============================================================
  // Handlers
  // ============================================================

  const resetTaskForm = () => {
    setNewTaskTitle('');
    setNewTaskStatus('todo');
    setNewTaskPriority('medium');
    setNewTaskAssigneeId('');
    setNewTaskDueDate('');
    setNewTaskEstimate('');
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    createTaskMutation.mutate({
      title: newTaskTitle,
      status: newTaskStatus,
      priority: newTaskPriority,
      // Backend field is assigned_to (assignee_id is silently ignored)
      assigned_to: newTaskAssigneeId ? parseInt(newTaskAssigneeId) : undefined,
      due_date: newTaskDueDate || undefined,
      estimated_hours: parseFloat(newTaskEstimate) || undefined
    });
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId) return;
    addMemberMutation.mutate({
      user_id: parseInt(selectedMemberId),
      role: selectedMemberRole
    });
  };

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMilestoneName.trim()) return;
    createMilestoneMutation.mutate({
      name: newMilestoneName.trim(),
      due_date: newMilestoneDueDate || undefined,
    });
  };

  const handleCardClick = (taskId: number) => {
    setSelectedTaskId(taskId);
    setTaskDetailOpen(true);
  };

  // Calculations for sidebar
  const completion_percentage = project?.completion_percentage || 0;
  
  // Budget stats
  const budgetVal = project?.budget || 0;
  const hoursBudgeted = project?.budget_hours || 0;
  
  // Tasks stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'done').length;
  
  // Milestones stats
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;

  // Calculate actual hours spent
  const hoursSpent = timesheets
    .filter(t => t.status === 'approved')
    .reduce((sum, t) => sum + (t.hours || 0), 0);

  // Real cost incurred so far (labor + expenses), from the Profitability tab's own data source.
  const amountSpent = profitability.total_cost || 0;

  const membersCount = project?.members?.length || 0;

  // Kanban Card borders mapping
  const PRIORITY_BORDERS = {
    urgent: 'border-l-4 border-l-red-500',
    high: 'border-l-4 border-l-orange-500',
    medium: 'border-l-4 border-l-blue-500',
    low: 'border-l-4 border-l-gray-500'
  };

  const PRIORITY_BADGES = {
    urgent: 'badge-danger',
    high: 'badge-warning',
    medium: 'badge-info',
    low: 'badge-muted'
  };

  const STATUS_PILLS = {
    todo: 'badge-muted',
    in_progress: 'badge-info',
    review: 'badge-warning',
    blocked: 'badge-danger',
    done: 'badge-success'
  };

  if (isProjectError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '0.75rem' }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Couldn&apos;t load this project</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          It may have been deleted, or the server is unreachable.
        </div>
        <Link href="/projects" className="btn btn-secondary" style={{ marginTop: '0.5rem' }}>
          Back to Projects
        </Link>
      </div>
    );
  }

  if (isProjectLoading || !project) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div style={{ color: 'var(--text-muted)' }}>Loading project details...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* ── Breadcrumb Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexShrink: 0 }}>
        <button
          onClick={() => router.push('/projects')}
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
          className="hover:text-primary"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Projects <ChevronRight size={10} /> Detail
          </span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {project?.project_number}: {project?.name}
          </h2>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <HowToUseGuide moduleKey="project_detail" title="How This Project Page Works" content={PROJECT_DETAIL_HOWTO} />
        </div>
      </div>

      {/* ── Split Layout ── */}
      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        
        {/* ============================================================
            LEFT SIDEBAR (STATISTICS & DETAILS)
            ============================================================ */}
        <div style={{
          width: '320px',
          minWidth: '320px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '1.5rem',
          gap: '1.5rem',
          flexShrink: 0
        }}>
          {/* Quick Header */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span className={`badge ${
                project?.status === 'completed' ? 'badge-success' :
                (project?.status === 'active' || project?.status === 'in_progress') ? 'badge-accent' :
                project?.status === 'planning' ? 'badge-info' :
                project?.status === 'on_hold' ? 'badge-warning' :
                'badge-danger'
              }`} style={{ fontSize: '0.7rem', textTransform: 'capitalize' }}>
                {project?.status === 'in_progress' ? 'In Progress' : (project?.status || 'Planning')}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {project?.project_number}
              </span>
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>{project?.name}</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Client:{' '}
              {project?.client?.id ? (
                <Link href={`/clients/${project.client.id}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {project.client.name}
                </Link>
              ) : (
                project?.client?.name || 'Walk-in Client'
              )}
            </p>
          </div>

          <div className="divider" style={{ margin: 0 }} />

          {/* Progress Circle */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <span className="form-label" style={{ alignSelf: 'flex-start' }}>Completion Percentage</span>
            <div style={{ position: 'relative', width: 120, height: 120, margin: '0.5rem 0' }}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="transparent" stroke="var(--border)" strokeWidth="8" />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="transparent"
                  stroke="var(--accent)"
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={2 * Math.PI * 50 * (1 - completion_percentage / 100)}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dashoffset 0.35s ease' }}
                />
                <text x="60" y="66" textAnchor="middle" fill="var(--text-primary)" fontSize="18" fontWeight="bold">
                  {completion_percentage}%
                </text>
              </svg>
            </div>
          </div>

          <div className="divider" style={{ margin: 0 }} />

          {/* Budget & Time Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <span className="form-label">Resource Consumption</span>
            
            {/* Hours */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Hours Burned</span>
                <span style={{ fontWeight: 600 }}>{hoursSpent} / {hoursBudgeted} hrs</span>
              </div>
              <div style={{ height: '6px', background: 'var(--surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (hoursSpent / (hoursBudgeted || 1)) * 100)}%`, background: 'var(--accent)' }} />
              </div>
            </div>

            {/* Financial Amount */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Budget Burned</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(amountSpent)} / {formatCurrency(budgetVal)}</span>
              </div>
              <div style={{ height: '6px', background: 'var(--surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (amountSpent / (budgetVal || 1)) * 100)}%`, background: 'var(--success)' }} />
              </div>
            </div>
          </div>

          <div className="divider" style={{ margin: 0 }} />

          {/* Quick Stats list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span className="form-label">Project Stats</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tasks Done</span>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckSquare size={13} style={{ color: 'var(--accent)' }} />
                  {completedTasks} / {totalTasks}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Team Members</span>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Users size={13} style={{ color: 'var(--info)' }} />
                  {membersCount}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Milestones Hit</span>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} style={{ color: 'var(--success)' }} />
                  {completedMilestones} / {totalMilestones}
                </span>
              </div>
            </div>
          </div>

          <div className="divider" style={{ margin: 0 }} />

          {/* Members List with Role Badges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="form-label">Members</span>
              <button
                onClick={() => setShowAddMemberForm(!showAddMemberForm)}
                style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '2px' }}
              >
                <UserPlus size={13} /> Add
              </button>
            </div>

            {/* Add Member inline form */}
            {showAddMemberForm && (
              <form onSubmit={handleAddMember} style={{ background: 'var(--surface-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <select
                  required
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="form-input"
                  style={{ height: '30px', padding: '0 0.5rem', fontSize: '0.75rem' }}
                >
                  <option value="">Select User</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <select
                  value={selectedMemberRole}
                  onChange={(e) => setSelectedMemberRole(e.target.value)}
                  className="form-input"
                  style={{ height: '30px', padding: '0 0.5rem', fontSize: '0.75rem' }}
                >
                  <option value="manager">Manager</option>
                  <option value="lead">Lead</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                  <button type="button" onClick={() => setShowAddMemberForm(false)} className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: '0.6875rem' }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '2px 6px', fontSize: '0.6875rem' }}>
                    Save
                  </button>
                </div>
              </form>
            )}

            {/* Members List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(project?.members || []).map((member) => {
                const isManager = member.user?.id === project.manager_id;
                const roleLabel = member.role.charAt(0).toUpperCase() + member.role.slice(1);
                const badgeClass = member.role === 'manager' ? 'badge-danger' : member.role === 'lead' ? 'badge-warning' : 'badge-muted';
                const name = member.user?.name || 'Unknown user';

                return (
                  <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="avatar avatar-sm">
                        {getInitials(name)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{name}</span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{member.user?.email?.split('@')[0] || ''}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className={`badge ${badgeClass}`} style={{ fontSize: '0.55rem', padding: '1px 4px' }}>
                        {roleLabel}
                      </span>
                      {!isManager && (
                        <button
                          onClick={async () => { if (member.user && await confirm({ message: `Remove ${name} from project?`, variant: 'danger' })) removeMemberMutation.mutate(member.user.id); }}
                          style={{ color: 'var(--text-muted)', background: 'none' }}
                          className="hover:text-danger"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ============================================================
            RIGHT MAIN CONTENT AREA (TABS FOR OVERVIEW, KANBAN, TIMESHEETS)
            ============================================================ */}
        <div style={{
          flex: 1,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Tabs bar */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            padding: '0 1.5rem',
            background: 'var(--surface-elevated)',
            flexShrink: 0,
            justifyContent: 'space-between',
            alignItems: 'center',
            height: '48px'
          }}>
            <div style={{ display: 'flex', gap: '1.5rem', height: '100%' }}>
              {(['overview', 'tasks', 'timesheets', 'profitability', 'documents'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    textTransform: 'capitalize'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Quick Context actions */}
            {activeTab === 'tasks' && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setShowApplyTemplateModal(true)}
                  className="btn btn-secondary btn-sm"
                  style={{ height: '30px' }}
                  title="Create this project's standard task list from a saved template"
                >
                  Apply Template
                </button>
                <button
                  onClick={() => setShowCreateTaskModal(true)}
                  className="btn btn-primary btn-sm"
                  style={{ height: '30px' }}
                >
                  <Plus size={14} /> Add Task
                </button>
              </div>
            )}
          </div>

          {/* Tabs Content body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            
            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Description */}
                <div>
                  <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>Project Description</h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {project?.description || 'No description provided.'}
                  </p>
                </div>

                {/* Timeline */}
                <div>
                  <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.75rem' }}>Key Timeline</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-elevated)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Calendar size={18} style={{ color: 'var(--accent)' }} />
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Start Date</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{formatDate(project?.start_date || '')}</div>
                      </div>
                    </div>
                    <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-elevated)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Calendar size={18} style={{ color: 'var(--warning)' }} />
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target End Date</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{formatDate(project?.end_date || '')}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Milestones list with completion bars */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
                      Milestones Schedule
                      <HelpIcon text="Milestones are the big checkpoints for this project (e.g. 'Design Approved', 'Beta Launch'). Check one off once it's delivered." />
                    </h4>
                    <button onClick={() => setShowAddMilestoneForm((v) => !v)} className="btn btn-secondary btn-sm">
                      <Plus size={13} /> Add Milestone
                    </button>
                  </div>

                  {showAddMilestoneForm && (
                    <form onSubmit={handleAddMilestone} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', background: 'var(--surface-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                      <input
                        type="text"
                        required
                        placeholder="Milestone name, e.g. Design Approved"
                        value={newMilestoneName}
                        onChange={(e) => setNewMilestoneName(e.target.value)}
                        className="form-input"
                        style={{ flex: 1 }}
                      />
                      <input
                        type="date"
                        value={newMilestoneDueDate}
                        onChange={(e) => setNewMilestoneDueDate(e.target.value)}
                        className="form-input"
                        style={{ width: '160px' }}
                      />
                      <button type="submit" disabled={createMilestoneMutation.isPending} className="btn btn-primary btn-sm">
                        Save
                      </button>
                    </form>
                  )}

                  {milestones.length === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                      No milestones yet. Click &quot;Add Milestone&quot; to map out the key checkpoints for this project.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {milestones.map((ms) => {
                        const isDone = ms.status === 'completed';
                        return (
                          <div key={ms.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0.875rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                  onClick={() => toggleMilestoneMutation.mutate({ id: ms.id, completed: !isDone })}
                                  title={isDone ? 'Mark as not yet complete' : 'Mark as complete'}
                                  style={{ color: isDone ? 'var(--success)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: isDone ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                  {ms.name}
                                </span>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                Due: {formatDate(ms.due_date)}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ flex: 1, height: '4px', background: 'var(--surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${ms.completion_percentage}%`, background: isDone ? 'var(--success)' : 'var(--accent)' }} />
                              </div>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, width: '30px', textAlign: 'right' }}>{ms.completion_percentage}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── KANBAN TASKS TAB ── */}
            {activeTab === 'tasks' && (
              <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', alignItems: 'flex-start', minHeight: '400px' }}>
                {(['todo', 'in_progress', 'review', 'blocked', 'done'] as const).map((colStatus) => {
                  const colTasks = tasks.filter(t => t.status === colStatus);
                  const labels = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', blocked: 'Blocked', done: 'Done' };
                  
                  return (
                    <div
                      key={colStatus}
                      style={{
                        width: '240px',
                        minWidth: '240px',
                        background: 'var(--surface-elevated)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        maxHeight: 'calc(100vh - 220px)',
                        overflowY: 'auto'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>{labels[colStatus]}</span>
                        <span style={{ fontSize: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '999px', padding: '1px 6px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {colTasks.length}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {colTasks.map((tsk) => (
                          <div
                            key={tsk.id}
                            onClick={() => handleCardClick(tsk.id)}
                            style={{
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.5rem',
                              transition: 'border-color 0.15s ease'
                            }}
                            className={`hover:border-purple-500 ${PRIORITY_BORDERS[tsk.priority]}`}
                          >
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                              {tsk.title}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className={`badge ${PRIORITY_BADGES[tsk.priority]}`} style={{ fontSize: '0.55rem', padding: '1px 4px' }}>
                                {tsk.priority}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {tsk.due_date ? formatDate(tsk.due_date).split(' ')[0] + ' ' + formatDate(tsk.due_date).split(' ')[1] : 'No date'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ flex: 1, height: '3px', background: 'var(--surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${tsk.completion_percentage}%`, background: 'var(--accent)' }} />
                              </div>
                              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600 }}>{tsk.completion_percentage}%</span>
                            </div>

                            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.375rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                              <span>Est: {tsk.estimated_hours || 0}h</span>
                              {(tsk.assignee?.name || tsk.assignee_name) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <div className="avatar avatar-sm" style={{ width: 16, height: 16, fontSize: '0.5rem' }}>
                                    {getInitials(tsk.assignee?.name || tsk.assignee_name || '')}
                                  </div>
                                  <span>{(tsk.assignee?.name || tsk.assignee_name)!.split(' ')[0]}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {colTasks.length === 0 && (
                          <div style={{ padding: '1.5rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                            Empty column
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── TIMESHEETS TAB ── */}
            {activeTab === 'timesheets' && (
              <div className="data-table-wrap">
                {timesheets.length === 0 ? (
                  <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>No timesheet logs for this project yet.</p>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Task / Scope</th>
                        <th>Date</th>
                        <th>Hours Logged</th>
                        <th>Billable</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timesheets.map((entry) => {
                        let statusColor = 'badge-muted';
                        if (entry.status === 'approved') statusColor = 'badge-success';
                        if (entry.status === 'submitted') statusColor = 'badge-info';
                        if (entry.status === 'rejected') statusColor = 'badge-danger';

                        return (
                          <tr key={entry.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div className="avatar avatar-sm">
                                  {getInitials(entry.user?.name || 'User')}
                                </div>
                                <span style={{ fontWeight: 500 }}>{entry.user?.name || 'Unknown'}</span>
                              </div>
                            </td>
                            <td>
                              <div>
                                <div style={{ fontWeight: 500 }}>{entry.task?.title || 'General / Scope Work'}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{entry.description}</div>
                              </div>
                            </td>
                            <td>{formatDate(entry.date)}</td>
                            <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{entry.hours} hrs</td>
                            <td>
                              <span className={`badge ${entry.billable ? 'badge-success' : 'badge-muted'}`} style={{ fontSize: '0.625rem', padding: '2px 6px' }}>
                                {entry.billable ? 'Billable' : 'Non-Billable'}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${statusColor}`}>
                                {entry.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── PROFITABILITY TAB ── */}
            {activeTab === 'profitability' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <Info size={18} style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      About these numbers
                      <HelpIcon text="Revenue comes from this project's budget or linked invoices. Cost is labor (hours × rate) plus logged expenses. Profit = Revenue − Cost." />
                    </h4>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.5 }}>
                      These figures update automatically as timesheets and expenses are logged against this project — no manual entry needed.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  {/* Revenue Card */}
                  <div className="card-elevated" style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                    <span className="kpi-label" style={{ fontSize: '0.7rem' }}>Projected Revenue</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)', marginTop: '0.25rem' }}>
                      {formatCurrency(profitability.revenue)}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>From accepted invoices or budget</span>
                  </div>

                  {/* Cost Card */}
                  <div className="card-elevated" style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                    <span className="kpi-label" style={{ fontSize: '0.7rem' }}>Incurred Cost</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)', marginTop: '0.25rem' }}>
                      {formatCurrency(profitability.total_cost)}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Labor: {formatCurrency(profitability.labor_cost)} · Expenses: {formatCurrency(profitability.expense_cost)}</span>
                  </div>

                  {/* Profit Card */}
                  <div className="card-elevated" style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                    <span className="kpi-label" style={{ fontSize: '0.7rem' }}>Calculated Profit</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', marginTop: '0.25rem' }}>
                      {formatCurrency(profitability.net_profit)}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Margin of {profitability.margin_percentage}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── DOCUMENTS TAB ── */}
            {activeTab === 'documents' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Project Documents</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Upload and manage project assets, templates, briefs, and client deliverables.
                  </p>
                </div>

                <FileUpload
                  type="attachment"
                  onUploadComplete={(res) => {
                    addDocumentMutation.mutate({
                      filename: res.filename,
                      file_path: res.file_path,
                      file_size: res.file_size,
                      mime_type: res.mime_type,
                    });
                  }}
                />

                {/* Documents list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
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
                            title={doc.filename}
                          >
                            {doc.filename}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', marginTop: '2px' }}>
                            <span>{(doc.file_size / 1024).toFixed(0)} KB</span>
                            <span>•</span>
                            <span>{doc.uploader?.name || 'Uploader'}</span>
                            <span>•</span>
                            <span>{formatDate(doc.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <a
                          href={doc.file_path && doc.file_path.startsWith('http') ? doc.file_path : `${process.env.NEXT_PUBLIC_STORAGE_URL || 'http://localhost:8000/storage'}/${doc.file_path}`}
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
                          onClick={async () => {
                            if (await confirm({ message: 'Are you sure you want to delete this document?', variant: 'danger' })) {
                              deleteDocumentMutation.mutate(doc.id);
                            }
                          }}
                          disabled={deleteDocumentMutation.isPending}
                          style={{
                            width: 28, height: 28, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)',
                            background: 'var(--surface)', border: '1px solid var(--border)',
                            cursor: 'pointer',
                          }}
                          className="hover:text-danger"
                          title="Delete Document"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {documents.length === 0 && (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                      No documents uploaded for this project yet.
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* ── Task Details Slide-Over Panel ── */}
      <TaskDetailSlideOver
        open={taskDetailOpen}
        onClose={() => setTaskDetailOpen(false)}
        taskId={selectedTaskId}
      />

      {/* ── Create Task Inline Dialog ── */}
      {showApplyTemplateModal && project && (
        <ApplyTemplateModal
          projectId={project.id}
          isRecurringProject={!!project.is_recurring}
          onClose={() => setShowApplyTemplateModal(false)}
          onApplied={() => {
            setShowApplyTemplateModal(false);
            queryClient.invalidateQueries({ queryKey: ['projectTasks', projectId] });
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}

      {showCreateTaskModal && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Task</h3>
              <button onClick={() => setShowCreateTaskModal(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            
            <form onSubmit={handleCreateTask}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div className="form-group">
                  <label className="form-label">Task Title *</label>
                  <input
                    type="text"
                    required
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="form-input"
                    placeholder="e.g. Design client review wireframes"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Column Status</label>
                    <select
                      value={newTaskStatus}
                      onChange={(e) => setNewTaskStatus(e.target.value as any)}
                      className="form-input"
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
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as any)}
                      className="form-input"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Assignee</label>
                  <select
                    value={newTaskAssigneeId}
                    onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Unassigned</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Due Date</label>
                    <input
                      type="date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Est. Hours</label>
                    <input
                      type="number"
                      placeholder="e.g. 15"
                      value={newTaskEstimate}
                      onChange={(e) => setNewTaskEstimate(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowCreateTaskModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
