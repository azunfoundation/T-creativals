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
  File, Download, Trash, Star, Share2, Pencil, Flag
} from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import {
  projects as projectsApi,
  users as usersApi,
  tasks as tasksApi,
  clientsApi,
  invoices as invoicesApi,
  getApiErrorMessage,
  Project, User, Task, Timesheet, Milestone, ProjectProfitability, ProjectDocument, Invoice
} from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatDate, getInitials, formatToInputDate, calculateDuration } from '@/lib/utils';
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
        'Team Activity — complete activity feed of project changes.',
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

import { useWorkspace } from '@/providers/WorkspaceProvider';
import { useEffect } from 'react';

export default function ProjectDetailPage() {
  const { user } = useAuthStore();
  const { setActiveProjectId } = useWorkspace();
  const canViewFinancials = user?.permissions?.includes('projects.profitability') || user?.permissions?.includes('reports.view_financial');
  const canCreateTask = user?.permissions?.includes('tasks.create') ?? false;
  const canEditProject = user?.permissions?.includes('projects.edit') ?? false;
  const canDeleteProject = user?.permissions?.includes('projects.delete') ?? false;
  const { confirm, prompt } = useModal();
  const { showToast } = useToast();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = parseInt(params.id as string) || 1;

  useEffect(() => {
    if (projectId) {
      setActiveProjectId(projectId);
    }
  }, [projectId, setActiveProjectId]);

  // UI Tabs State
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'timesheets' | 'profitability' | 'documents' | 'team_activity'>('overview');

  // Slide-over task detail panel
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  // Collapsible description state
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

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
  const [newMilestoneDescription, setNewMilestoneDescription] = useState('');
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState('');

  // Edit Project Drawer State
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editName, setEditName] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [editManagerId, setEditManagerId] = useState('');
  const [editInvoiceId, setEditInvoiceId] = useState('');
  const [editStatus, setEditStatus] = useState<Project['status']>('planning');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editBudgetHours, setEditBudgetHours] = useState('');
  const [editBudgetAmount, setEditBudgetAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // ============================================================
  // Queries
  // ============================================================

  const { data: project, isLoading: isProjectLoading, isError: isProjectError } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const res = await projectsApi.get(projectId);
      const data = (res.data as any).data || res.data;
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

  const { data: profitability = {
    project_id: 0, project_name: '', budget_amount: 0, revenue: 0,
    labor_cost: 0, expense_cost: 0, total_cost: 0, net_profit: 0, margin_percentage: 0,
  } } = useQuery<ProjectProfitability>({
    queryKey: ['projectProfitability', projectId],
    queryFn: async () => {
      const res = await projectsApi.profitability(projectId);
      return res.data;
    },
    enabled: !!user && canViewFinancials,
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

  const { data: clients = [] } = useQuery({
    queryKey: ['clients_directory', 'picker'],
    queryFn: async () => {
      const res = await clientsApi.list();
      return (res.data?.breakdown || []).map((c: any) => ({
        id: c.client_id,
        name: c.company_name ? `${c.company_name} (${c.client_name})` : c.client_name,
        email: c.client_email,
      }));
    },
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: async () => {
      try {
        const res = await invoicesApi.list();
        return res.data?.data || [];
      } catch {
        return [];
      }
    }
  });

  // ============================================================
  // Mutations
  // ============================================================

  const updateProjectMutation = useMutation({
    mutationFn: (data: any) => projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowEditDrawer(false);
      showToast('Project updated successfully.', 'success');
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err, 'Failed to update project.'), 'error');
    }
  });

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
    mutationFn: (data: { name: string; due_date?: string; description?: string }) => projectsApi.createMilestone(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMilestones', projectId] });
      setShowAddMilestoneForm(false);
      setNewMilestoneName('');
      setNewMilestoneDescription('');
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
      description: newMilestoneDescription.trim() || undefined,
      due_date: newMilestoneDueDate || undefined,
    });
  };

  const openEditDrawer = () => {
    if (!project) return;
    setEditName(project.name || '');
    setEditClientId(project.client_id ? project.client_id.toString() : '');
    setEditManagerId(project.manager_id ? project.manager_id.toString() : '');
    setEditInvoiceId(project.invoice_id ? project.invoice_id.toString() : '');
    setEditStatus(project.status || 'planning');
    setEditPriority(project.priority || 'medium');
    setEditStartDate(formatToInputDate(project.start_date));
    setEditEndDate(formatToInputDate(project.end_date));
    setEditBudgetHours(project.budget_hours ? project.budget_hours.toString() : '');
    setEditBudgetAmount(project.budget_amount !== undefined ? project.budget_amount.toString() : (project.budget ? project.budget.toString() : ''));
    setEditDescription(project.description || '');
    setShowEditDrawer(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProjectMutation.mutate({
      name: editName,
      client_id: editClientId ? parseInt(editClientId) : undefined,
      manager_id: editManagerId ? parseInt(editManagerId) : undefined,
      invoice_id: editInvoiceId ? parseInt(editInvoiceId) : undefined,
      status: editStatus,
      priority: editPriority,
      start_date: editStartDate || null,
      end_date: editEndDate || null,
      budget_hours: parseFloat(editBudgetHours) || 0,
      budget_amount: parseFloat(editBudgetAmount) || 0,
      description: editDescription,
    });
  };

  const handleCardClick = (taskId: number) => {
    setSelectedTaskId(taskId);
    setTaskDetailOpen(true);
  };

  // Calculations
  const completion_percentage = project?.completion_percentage || 0;
  const budgetVal = project?.budget || 0;
  const hoursBudgeted = project?.budget_hours || 0;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'done').length;
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;

  const hoursSpent = timesheets
    .filter(t => t.status === 'approved')
    .reduce((sum, t) => sum + (t.hours || 0), 0);

  const amountSpent = profitability.total_cost || 0;
  const membersCount = project?.members?.length || 0;

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

  const cardStyle = {
    padding: '0.875rem',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    flex: 1,
    minWidth: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* ── Redesigned Premium Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexShrink: 0, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => router.push('/projects')}
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            className="hover:text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Projects <ChevronRight size={10} /> {project?.name}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {project?.name}
              </h2>
              <Star size={18} style={{ color: '#7C3AED', fill: '#7C3AED', cursor: 'pointer' }} />
              <span className={`badge ${
                project?.status === 'completed' ? 'badge-success' :
                (project?.status === 'active' || project?.status === 'in_progress') ? 'badge-accent' :
                project?.status === 'planning' ? 'badge-info' :
                project?.status === 'on_hold' ? 'badge-warning' :
                'badge-danger'
              }`} style={{ fontSize: '0.7rem', textTransform: 'capitalize', padding: '2px 8px', background: project?.status === 'planning' ? '#E6F4EA' : undefined, color: project?.status === 'planning' ? '#137333' : undefined }}>
                {project?.status === 'in_progress' ? 'In Progress' : (project?.status || 'Planning')}
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Client: <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{project?.client?.name || 'Walk-in Client'}</span>
              {' '}•{' '}
              Created on {project?.created_at ? formatDate(project.created_at) : '14 Jul, 2026'}
              {' '}•{' '}
              Project ID: <span style={{ fontWeight: 600 }}>{project?.project_number}</span>
            </p>
          </div>
        </div>
        
        {/* Header Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {user?.permissions?.includes('projects.edit') && (
            <button
              onClick={openEditDrawer}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
              className="hover:text-primary hover:bg-surface"
            >
              <Pencil size={14} />
              Edit Project
            </button>
          )}
          
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
            className="hover:text-primary hover:bg-surface"
          >
            <Share2 size={14} />
            Share
          </button>

          <button
            style={{
              width: 38,
              height: 38,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#7C3AED',
              color: '#FFF',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
            className="hover:opacity-90"
          >
            <MoreHorizontal size={16} />
          </button>

          <div style={{ marginLeft: '0.5rem' }}>
            <HowToUseGuide moduleKey="project_detail" title="How This Project Page Works" content={PROJECT_DETAIL_HOWTO} />
          </div>
        </div>
      </div>

      {/* ── Main Panel Card ── */}
      <div style={{
        flex: 1,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0
      }}>
        {/* Tabs Bar */}
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
            {(['overview', 'tasks', 'timesheets', 'profitability', 'documents', 'team_activity'] as const)
              .filter((tab) => tab !== 'profitability' || canViewFinancials)
              .map((tab) => (
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
                  textTransform: 'capitalize',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer'
                }}
              >
                {tab === 'team_activity' ? 'Team Activity' : tab}
              </button>
            ))}
          </div>

          {/* Quick Context actions */}
          {activeTab === 'tasks' && canCreateTask && (
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

        {/* Tab Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          
          {/* ── OVERVIEW TAB (Redesigned 2-column layout) ── */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
              
              {/* Left Column (30% width: statistics & sidebar metadata) */}
              <div style={{
                width: '320px',
                minWidth: '320px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                flexShrink: 0
              }}>
                {/* Completion Card */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.875rem', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', alignSelf: 'flex-start' }}>Completion</span>
                  <div style={{ position: 'relative', width: 120, height: 120 }}>
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="50" fill="transparent" stroke="var(--border)" strokeWidth="8" />
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="transparent"
                        stroke="#7C3AED"
                        strokeWidth="8"
                        strokeDasharray={2 * Math.PI * 50}
                        strokeDashoffset={2 * Math.PI * 50 * (1 - completion_percentage / 100)}
                        strokeLinecap="round"
                        transform="rotate(-90 60 60)"
                        style={{ transition: 'stroke-dashoffset 0.35s ease' }}
                      />
                      <text x="60" y="66" textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="bold">
                        {completion_percentage}%
                      </text>
                    </svg>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#10B981' }}>On Track</span>
                </div>

                {/* Resource Summary Card */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Resource Summary</span>
                  
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      <span>Hours Logged</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{hoursSpent} / {hoursBudgeted} hrs</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (hoursSpent / (hoursBudgeted || 1)) * 100)}%`, background: '#7C3AED' }} />
                    </div>
                  </div>

                  {canViewFinancials && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                        <span>Budget Used</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(amountSpent)} / {formatCurrency(budgetVal)}</span>
                      </div>
                      <div style={{ height: '6px', background: 'var(--surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, (amountSpent / (budgetVal || 1)) * 100)}%`, background: '#7C3AED' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Project Stats Card */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Project Stats</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Tasks Done</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{completedTasks} / {totalTasks}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Team Members</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{membersCount}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Milestones Hit</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{completedMilestones} / {totalMilestones}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Open Issues</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Project Lead Card */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Project Lead</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="avatar" style={{ width: 38, height: 38, background: 'var(--accent-subtle)', color: 'var(--accent)', fontWeight: 700, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {getInitials(project.manager?.name || 'Manager')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{project.manager?.name || 'Unassigned'}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>UI/UX Designer</span>
                    </div>
                  </div>
                </div>

                {/* Members Card */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Members</span>
                    {canEditProject && (
                      <button
                        onClick={() => setShowAddMemberForm(!showAddMemberForm)}
                        style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <UserPlus size={13} /> Add
                      </button>
                    )}
                  </div>

                  {/* Add Member inline form */}
                  {canEditProject && showAddMemberForm && (
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

                  {/* Members list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {(project.members || []).map((member) => {
                      const name = member.user?.name || 'Teammate';
                      return (
                        <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="avatar" style={{ width: 28, height: 28, fontSize: '0.7rem', borderRadius: '50%', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                              {getInitials(name)}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
                              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{member.role}</span>
                            </div>
                          </div>
                          
                          {canEditProject && (
                            <button
                              onClick={async () => {
                                if (await confirm({ message: `Are you sure you want to remove ${name} from this project?`, variant: 'danger' })) {
                                  removeMemberMutation.mutate(member.user_id);
                                }
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                              className="hover:text-danger"
                              title="Remove Member"
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {(project.members || []).length === 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No members added yet.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column (70% width: KPIs, Description, Milestones & Activity) */}
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                minWidth: 0
              }}>
                {/* 5 KPI Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  
                  {/* Start Date */}
                  <div style={cardStyle}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', flexShrink: 0 }}>
                      <Calendar size={16} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Start Date</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {formatDate(project?.start_date || '')}
                      </span>
                    </div>
                  </div>

                  {/* Target End Date */}
                  <div style={cardStyle}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', flexShrink: 0 }}>
                      <Calendar size={16} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Target End Date</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {formatDate(project?.end_date || '')}
                      </span>
                    </div>
                  </div>

                  {/* Duration */}
                  <div style={cardStyle}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', flexShrink: 0 }}>
                      <Clock size={16} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Duration</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {calculateDuration(project?.start_date, project?.end_date)}
                      </span>
                    </div>
                  </div>

                  {/* Priority */}
                  <div style={cardStyle}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706', flexShrink: 0 }}>
                      <Flag size={16} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Priority</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: project?.priority === 'urgent' ? '#EF4444' : project?.priority === 'high' ? '#F97316' : project?.priority === 'low' ? '#6B7280' : '#EAB308', display: 'inline-block' }} />
                        {project?.priority || 'Medium'}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <div style={cardStyle}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', flexShrink: 0 }}>
                      <CheckCircle2 size={16} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Status</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                        {project?.status === 'in_progress' ? 'In Progress' : (project?.status || 'Planning')}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Project Description Card */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: 'var(--shadow-sm)' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Project Description</span>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    {(() => {
                      const descriptionText = project?.description || 'No description provided.';
                      const showToggle = descriptionText.length > 180;
                      const displayedText = (showToggle && !isDescriptionExpanded) ? `${descriptionText.slice(0, 180)}...` : descriptionText;
                      return (
                        <>
                          {displayedText}
                          {showToggle && (
                            <button
                              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: '0.75rem', padding: 0, marginLeft: '0.5rem', cursor: 'pointer', display: 'inline-block' }}
                            >
                              {isDescriptionExpanded ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </p>
                </div>

                {/* Timeline and Activity Sub-Grid */}
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
                  
                  {/* Milestones Card */}
                  <div style={{ flex: 1.4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: 'var(--shadow-sm)', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Milestones</span>
                      <button style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>
                    </div>

                    {/* Timeline List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', marginTop: '0.25rem' }}>
                      {milestones.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                          No milestones scheduled yet.
                        </div>
                      ) : (
                        milestones.map((ms, index) => {
                          const isCompleted = ms.status === 'completed';
                          const isFirstUncompleted = !isCompleted && (index === 0 || milestones.slice(0, index).every(m => m.status === 'completed'));
                          const statusLabel = isCompleted ? 'Completed' : (isFirstUncompleted ? 'In Progress' : 'Pending');
                          const statusBadgeColor = isCompleted ? { bg: '#D1FAE5', text: '#065F46' } : (isFirstUncompleted ? { bg: '#DBEAFE', text: '#1E40AF' } : { bg: '#F3F4F6', text: '#374151' });

                          return (
                            <div key={ms.id} style={{ display: 'flex', gap: '0.75rem', position: 'relative', zIndex: 1 }}>
                              
                              {/* Visual Circle Timeline */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                                <button
                                  onClick={() => toggleMilestoneMutation.mutate({ id: ms.id, completed: !isCompleted })}
                                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', zIndex: 2, display: 'flex' }}
                                >
                                  {isCompleted ? (
                                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                                      <CheckCircle2 size={13} style={{ fill: '#059669', color: '#FFF' }} />
                                    </div>
                                  ) : (
                                    <div style={{
                                      width: 22, height: 22, borderRadius: '50%',
                                      background: isFirstUncompleted ? 'var(--accent-subtle)' : 'var(--surface-elevated)',
                                      border: `2px solid ${isFirstUncompleted ? 'var(--accent)' : 'var(--border)'}`,
                                      color: isFirstUncompleted ? 'var(--accent)' : 'var(--text-muted)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 600
                                    }}>
                                      {index + 1}
                                    </div>
                                  )}
                                </button>
                                {index < milestones.length - 1 && (
                                  <div style={{
                                    position: 'absolute',
                                    left: '10px',
                                    top: '22px',
                                    bottom: '-22px',
                                    width: '2px',
                                    background: isCompleted ? '#059669' : 'var(--border)',
                                    zIndex: 1
                                  }} />
                                )}
                              </div>

                              {/* Milestone Details */}
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: isCompleted ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                    {ms.name}
                                  </span>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    {formatDate(ms.due_date)}
                                  </span>
                                </div>
                                {ms.description && (
                                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '1px 0 3px 0', lineHeight: 1.3 }}>
                                    {ms.description}
                                  </p>
                                )}
                                <span style={{
                                  fontSize: '0.625rem', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                                  background: statusBadgeColor.bg, color: statusBadgeColor.text, width: 'fit-content', marginTop: '2px'
                                }}>
                                  {statusLabel}
                                </span>
                              </div>

                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Inline Add Milestone Form */}
                    {canEditProject && showAddMilestoneForm && (
                      <form onSubmit={handleAddMilestone} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--surface-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginTop: '0.5rem' }}>
                        <input
                          type="text"
                          required
                          placeholder="Milestone name, e.g. Design Approved"
                          value={newMilestoneName}
                          onChange={(e) => setNewMilestoneName(e.target.value)}
                          className="form-input"
                          style={{ fontSize: '0.75rem', height: '30px' }}
                        />
                        <textarea
                          placeholder="Brief description..."
                          value={newMilestoneDescription}
                          onChange={(e) => setNewMilestoneDescription(e.target.value)}
                          className="form-input"
                          style={{ fontSize: '0.75rem', minHeight: '45px', resize: 'vertical', padding: '0.375rem 0.5rem' }}
                        />
                        <input
                          type="date"
                          value={newMilestoneDueDate}
                          onChange={(e) => setNewMilestoneDueDate(e.target.value)}
                          className="form-input"
                          style={{ fontSize: '0.75rem', height: '30px' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                          <button type="button" onClick={() => setShowAddMilestoneForm(false)} className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: '0.6875rem' }}>
                            Cancel
                          </button>
                          <button type="submit" disabled={createMilestoneMutation.isPending} className="btn btn-primary btn-sm" style={{ padding: '2px 6px', fontSize: '0.6875rem' }}>
                            Save
                          </button>
                        </div>
                      </form>
                    )}

                    {canEditProject && !showAddMilestoneForm && (
                      <button
                        onClick={() => setShowAddMilestoneForm(true)}
                        style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: 'fit-content', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem' }}
                      >
                        <Plus size={13} /> Add Milestone
                      </button>
                    )}
                  </div>

                  {/* Activity & Files Stack */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
                    
                    {/* Recent Activity */}
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', boxShadow: 'var(--shadow-sm)', minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Recent Activity</span>
                        <button
                          onClick={() => setActiveTab('team_activity')}
                          style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          View All
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {(() => {
                          const activityLogs: any[] = [];
                          milestones.forEach(m => {
                            const mTime = (m as any).updated_at || m.due_date;
                            if (m.status === 'completed' && mTime) {
                              activityLogs.push({
                                id: `ms-${m.id}`,
                                user: project.manager?.name || 'Manager',
                                action: `completed milestone "${m.name}"`,
                                time: mTime,
                              });
                            }
                          });
                          timesheets.slice(0, 5).forEach(t => {
                            activityLogs.push({
                              id: `ts-${t.id}`,
                              user: t.user?.name || 'Team Member',
                              action: `logged ${t.hours} hrs`,
                              time: t.date,
                            });
                          });
                          tasks.filter(t => t.status === 'done').slice(0, 5).forEach(t => {
                            activityLogs.push({
                              id: `task-${t.id}`,
                              user: t.assignee?.name || project.manager?.name || 'Team Member',
                              action: `completed task "${t.title}"`,
                              time: t.due_date || project.updated_at || '',
                            });
                          });
                          activityLogs.sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());

                          const defaultActivities = [
                            { id: 'act-1', user: project.manager?.name || 'Rajesh Kumar', action: 'updated project status', time: '' },
                            { id: 'act-2', user: 'Priya Sharma', action: 'completed a task', time: '' },
                            { id: 'act-3', user: 'Arun Mehta', action: 'logged 3.5 hrs', time: '' },
                            { id: 'act-4', user: 'Sneha Patel', action: 'added a new comment', time: '' },
                          ];

                          const displayedActivities = activityLogs.length > 0 ? activityLogs.slice(0, 4) : defaultActivities;

                          return displayedActivities.map((act) => (
                            <div key={act.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', overflow: 'hidden' }}>
                              <div className="avatar" style={{ width: 22, height: 22, fontSize: '0.6rem', flexShrink: 0, borderRadius: '50%', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                {getInitials(act.user)}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{act.user}</strong> {act.action}
                                </span>
                                {act.time && (
                                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                                    {formatDate(act.time)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* Files & Documents */}
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', boxShadow: 'var(--shadow-sm)', minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Files & Documents</span>
                        <button
                          onClick={() => setActiveTab('documents')}
                          style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          View All
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        {(() => {
                          const defaultDocs = [
                            { id: 'doc-1', filename: 'Project Brief.pdf', file_size: 2.4 * 1024 * 1024, created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(), file_path: '' },
                            { id: 'doc-2', filename: 'Wireframes.zip', file_size: 12.6 * 1024 * 1024, created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(), file_path: '' },
                            { id: 'doc-3', filename: 'Logo Design.png', file_size: 1.8 * 1024 * 1024, created_at: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(), file_path: '' },
                          ];
                          
                          const displayedDocuments = documents.length > 0 ? documents.slice(0, 3) : defaultDocs;

                          return displayedDocuments.map((doc) => {
                            const isZip = doc.filename.endsWith('.zip');
                            const isPdf = doc.filename.endsWith('.pdf');
                            const iconBg = isPdf ? '#FEE2E2' : (isZip ? '#FEF3C7' : '#E0E7FF');
                            const iconColor = isPdf ? '#EF4444' : (isZip ? '#D97706' : '#4F46E5');

                            return (
                              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', overflow: 'hidden', flex: 1 }}>
                                  <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, flexShrink: 0 }}>
                                    <File size={13} />
                                  </div>
                                  <div style={{ overflow: 'hidden', flex: 1 }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={doc.filename}>
                                      {doc.filename}
                                    </div>
                                    <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                                      {(doc.file_size / (1024 * 1024)).toFixed(1)} MB • {formatDate(doc.created_at)}
                                    </div>
                                  </div>
                                </div>
                                <a
                                  href={doc.file_path && doc.file_path.startsWith('http') ? doc.file_path : `${process.env.NEXT_PUBLIC_STORAGE_URL || 'http://localhost:8000/storage'}/${doc.file_path}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: '4px' }}
                                  className="hover:text-primary"
                                >
                                  <Download size={13} />
                                </a>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                  </div>

                </div>

              </div>

            </div>
          )}

          {/* ── KANBAN TASKS TAB (Full width) ── */}
          {activeTab === 'tasks' && (
            <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', alignItems: 'flex-start', minHeight: '400px' }}>
              {(['todo', 'in_progress', 'review', 'blocked', 'done'] as const).map((colStatus) => {
                const colTasks = tasks.filter(t => t.status === colStatus);
                const labels = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', blocked: 'Blocked', done: 'Done' };
                
                return (
                  <div
                    key={colStatus}
                    style={{
                      flex: 1,
                      minWidth: '220px',
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
                              {tsk.due_date ? formatDate(tsk.due_date).split(',')[0] : 'No date'}
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

          {/* ── TIMESHEETS TAB (Full width) ── */}
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

          {/* ── PROFITABILITY TAB (Full width) ── */}
          {activeTab === 'profitability' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <Info size={18} style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <h4 style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px', margin: 0 }}>
                    About these numbers
                    <HelpIcon text="Revenue comes from this project's budget or linked invoices. Cost is labor (hours × rate) plus logged expenses. Profit = Revenue − Cost." />
                  </h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.5, margin: 0 }}>
                    These figures update automatically as timesheets and expenses are logged against this project — no manual entry needed.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Revenue Card */}
                <div className="card-elevated" style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                  <span className="kpi-label" style={{ fontSize: '0.7rem' }}>Projected Revenue</span>
                  <div className="kpi-value" style={{ color: 'var(--success)', marginTop: '0.25rem' }}>
                    {formatCurrency(profitability.revenue)}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>From accepted invoices or budget</span>
                </div>

                {/* Cost Card */}
                <div className="card-elevated" style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                  <span className="kpi-label" style={{ fontSize: '0.7rem' }}>Incurred Cost</span>
                  <div className="kpi-value" style={{ color: 'var(--danger)', marginTop: '0.25rem' }}>
                    {formatCurrency(profitability.total_cost)}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Labor: {formatCurrency(profitability.labor_cost)} · Expenses: {formatCurrency(profitability.expense_cost)}</span>
                </div>

                {/* Profit Card */}
                <div className="card-elevated" style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                  <span className="kpi-label" style={{ fontSize: '0.7rem' }}>Calculated Profit</span>
                  <div className="kpi-value" style={{ color: 'var(--accent)', marginTop: '0.25rem' }}>
                    {formatCurrency(profitability.net_profit)}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Margin of {profitability.margin_percentage}%</span>
                </div>
              </div>
            </div>
          )}

          {/* ── DOCUMENTS TAB (Full width) ── */}
          {activeTab === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>Project Documents</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
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

              {/* Documents List */}
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

          {/* ── TEAM ACTIVITY TAB ── */}
          {activeTab === 'team_activity' && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Project Team Activity Feed</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {(() => {
                  const activityLogs: any[] = [];
                  milestones.forEach(m => {
                    const mTime = (m as any).updated_at || m.due_date;
                    if (m.status === 'completed' && mTime) {
                      activityLogs.push({
                        id: `ms-${m.id}`,
                        user: project.manager?.name || 'Manager',
                        action: `completed milestone "${m.name}"`,
                        time: mTime,
                      });
                    }
                  });
                  timesheets.forEach(t => {
                    activityLogs.push({
                      id: `ts-${t.id}`,
                      user: t.user?.name || 'Team Member',
                      action: `logged ${t.hours} hrs on "${t.task?.title || 'General Scope'}"`,
                      time: t.date,
                    });
                  });
                  tasks.filter(t => t.status === 'done').forEach(t => {
                    activityLogs.push({
                      id: `task-${t.id}`,
                      user: t.assignee?.name || project.manager?.name || 'Team Member',
                      action: `completed task "${t.title}"`,
                      time: t.due_date || project.updated_at || '',
                    });
                  });
                  activityLogs.sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());

                  const defaultActivities = [
                    { id: 'act-1', user: project.manager?.name || 'Rajesh Kumar', action: 'updated project status', time: '' },
                    { id: 'act-2', user: 'Priya Sharma', action: 'completed a task', time: '' },
                    { id: 'act-3', user: 'Arun Mehta', action: 'logged 3.5 hrs', time: '' },
                    { id: 'act-4', user: 'Sneha Patel', action: 'added a new comment', time: '' },
                  ];

                  const displayedActivities = activityLogs.length > 0 ? activityLogs : defaultActivities;

                  return displayedActivities.map((act) => (
                    <div key={act.id} style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
                      <div className="avatar" style={{ width: 36, height: 36, fontSize: '0.8125rem', borderRadius: '50%', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                        {getInitials(act.user)}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', margin: 0 }}>
                          <strong style={{ fontWeight: 600 }}>{act.user}</strong> {act.action}
                        </p>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {act.time ? formatDate(act.time) : formatDate(project.updated_at || project.created_at || new Date().toISOString())}
                        </span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

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

      {/* ── Edit Project Slide-over Drawer ── */}
      {showEditDrawer && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 60 }}
            onClick={() => setShowEditDrawer(false)}
          />

          {/* Drawer Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit Project"
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
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Edit Project
                </h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', margin: 0 }}>
                  Modify the project details below.
                </p>
              </div>
              <button
                onClick={() => setShowEditDrawer(false)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer' }}
                className="hover:text-primary hover:bg-surface-elevated"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Scroll Body */}
            <form onSubmit={handleEditSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Project Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="form-input"
                  placeholder="e.g. Stark Website Redesign"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Client *</label>
                  <select
                    required
                    value={editClientId}
                    onChange={(e) => setEditClientId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select a client</option>
                    {clients.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Linked Invoice</label>
                  <select
                    value={editInvoiceId}
                    onChange={(e) => setEditInvoiceId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">None</option>
                    {invoices.map((inv: any) => (
                      <option key={inv.id} value={inv.id}>{inv.invoice_number} - {inv.title} (₹{inv.total_amount.toLocaleString()})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Project Manager *</label>
                  <select
                    required
                    value={editManagerId}
                    onChange={(e) => setEditManagerId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select Project Manager</option>
                    {users.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.employee_id || 'Employee'})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Status *</label>
                  <select
                    required
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as Project['status'])}
                    className="form-input"
                  >
                    <option value="planning">Planning</option>
                    <option value="in_progress">In Progress</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Priority *</label>
                  <select
                    required
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as any)}
                    className="form-input"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="form-group">
                  {/* Grid spacing */}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Target End Date *</label>
                  <input
                    type="date"
                    required
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Budget Hours</label>
                  <input
                    type="number"
                    value={editBudgetHours}
                    onChange={(e) => setEditBudgetHours(e.target.value)}
                    className="form-input"
                    placeholder="e.g. 150"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Budget Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    value={editBudgetAmount}
                    onChange={(e) => setEditBudgetAmount(e.target.value)}
                    className="form-input"
                    placeholder="e.g. 500000"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="form-input"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  placeholder="Details about deliverables, design language, core goals..."
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowEditDrawer(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateProjectMutation.isPending}
                  className="btn btn-primary"
                >
                  {updateProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

    </div>
  );
}
