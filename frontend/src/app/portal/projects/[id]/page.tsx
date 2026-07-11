'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Zap, ArrowLeft, CheckCircle2, Circle, Clock, AlertTriangle,
  Flag, User, Milestone as MilestoneIcon, Layers,
} from 'lucide-react';
import { portal, PortalProject, PortalMilestone, PortalTask } from '@/lib/api';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

type ClientUser = { id: number; name: string; email: string };

const PORTAL_PROJECT_HOWTO = {
  overview: 'This page shows everything about one of your projects: how complete it is overall, the key milestones along the way, and the individual tasks our team is working on. It updates automatically as work progresses, so you always know where things stand.',
  sections: [
    {
      heading: 'What You Can See Here',
      items: [
        'The completion ring at the top shows overall progress for the whole project.',
        'The Milestones tab lists the major phases of your project in order, each with its own due date and progress bar.',
        'The Tasks tab shows the individual pieces of work, grouped by where they are (To Do, In Progress, Review, Done).',
        'Key dates — when the project started and its deadline — are shown under the project name.',
      ],
    },
    {
      heading: 'Understanding Statuses',
      items: [
        'In Progress — our team is actively working on it.',
        'Review — the work is finished and being quality-checked before it\'s marked done.',
        'Blocked — something is holding this item up; we may reach out if we need input from you.',
        'Overdue — a milestone has passed its due date; our team is aware and on it.',
      ],
    },
    {
      heading: 'Tips',
      items: [
        'Progress updates as our team completes work — no need to ask for status reports.',
        'The small colored dot on each task shows its priority, from green (low) to red (urgent).',
        'Questions about anything you see? Contact your project manager and mention the task or milestone number.',
      ],
    },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusChip({ status, type }: { status: string; type?: 'task' | 'milestone' | 'project' }) {
  const taskMap: Record<string, { bg: string; color: string; label: string }> = {
    todo:        { bg: 'var(--surface-2)', color: 'var(--text-muted)',   label: 'To Do' },
    in_progress: { bg: '#1e3a5f',          color: '#60a5fa',              label: 'In Progress' },
    review:      { bg: '#2a1a3a',          color: '#a78bfa',              label: 'Review' },
    blocked:     { bg: '#2e1a1a',          color: '#f87171',              label: 'Blocked' },
    done:        { bg: '#1a2e1a',          color: '#4ade80',              label: 'Done' },
    cancelled:   { bg: '#2a1a1a',          color: '#6b7280',              label: 'Cancelled' },
  };
  const msMap: Record<string, { bg: string; color: string; label: string }> = {
    pending:     { bg: 'var(--surface-2)', color: 'var(--text-muted)',   label: 'Pending' },
    in_progress: { bg: '#1e3a5f',          color: '#60a5fa',              label: 'In Progress' },
    completed:   { bg: '#1a2e1a',          color: '#4ade80',              label: 'Completed' },
    overdue:     { bg: '#2e1a1a',          color: '#f87171',              label: 'Overdue' },
  };
  const projectMap: Record<string, { bg: string; color: string; label: string }> = {
    planning:    { bg: 'var(--surface-2)', color: 'var(--text-muted)', label: 'Getting Started' },
    in_progress: { bg: '#1e3a5f',          color: '#60a5fa',            label: 'In Progress' },
    active:      { bg: '#1e3a5f',          color: '#60a5fa',            label: 'In Progress' },
    on_hold:     { bg: '#3a2e1a',          color: '#facc15',            label: 'On Hold' },
    completed:   { bg: '#1a2e1a',          color: '#4ade80',            label: 'Completed' },
    cancelled:   { bg: '#2a1a1a',          color: '#6b7280',            label: 'Closed' },
  };
  const map = type === 'milestone' ? msMap : type === 'project' ? projectMap : taskMap;
  const s = map[status] ?? { bg: 'var(--surface-2)', color: 'var(--text-secondary)', label: status };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = { low: '#4ade80', medium: '#facc15', high: '#fb923c', urgent: '#f87171' };
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colors[priority] ?? '#6b7280', flexShrink: 0 }} title={priority} />;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', minWidth: 80, flex: 1 }}>
      <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: 'linear-gradient(90deg, #059669, #34d399)', borderRadius: 4, transition: 'width 0.4s ease' }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PortalProjectDetail() {
  const router    = useRouter();
  const params    = useParams<{ id: string }>();
  const projectId = Number(params?.id);

  const [user, setUser]             = useState<ClientUser | null>(null);
  const [project, setProject]       = useState<PortalProject | null>(null);
  const [milestones, setMilestones] = useState<PortalMilestone[]>([]);
  const [tasks, setTasks]           = useState<PortalTask[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<'milestones' | 'tasks'>('milestones');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('client_user');
    if (!raw || !localStorage.getItem('client_token')) {
      router.replace('/portal/login');
      return;
    }
    try { setUser(JSON.parse(raw)); } catch { /* ignore */ }
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [pRes, tRes] = await Promise.all([
        portal.getProject(projectId),
        portal.getProjectTasks(projectId),
      ]);

      // getProject returns { data: project, milestones: [...] }
      const pPayload = pRes.data as unknown as { data: PortalProject; milestones: PortalMilestone[] } | (PortalProject & { milestones: PortalMilestone[] });
      if ('data' in pPayload && pPayload.data) {
        setProject(pPayload.data);
        setMilestones(pPayload.milestones ?? []);
      } else {
        const raw = pPayload as PortalProject & { milestones?: PortalMilestone[] };
        setProject(raw);
        setMilestones(raw.milestones ?? []);
      }

      const tPayload = tRes.data as unknown as { data: PortalTask[] } | PortalTask[];
      if (Array.isArray(tPayload)) {
        setTasks(tPayload);
      } else {
        setTasks(tPayload.data ?? []);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr?.response?.status === 403) {
        setError('Access denied. This project does not belong to your account.');
      } else {
        setError('Failed to load project details.');
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (user && projectId) fetchData();
  }, [user, projectId, fetchData]);

  // Group tasks by status for a kanban-style view
  const taskGroups: Record<string, { label: string; color: string; tasks: PortalTask[] }> = {
    todo:        { label: 'To Do',       color: 'var(--text-muted)',  tasks: [] },
    in_progress: { label: 'In Progress', color: '#60a5fa',             tasks: [] },
    review:      { label: 'Review',      color: '#a78bfa',             tasks: [] },
    blocked:     { label: 'Blocked',     color: '#f87171',             tasks: [] },
    done:        { label: 'Done',        color: '#4ade80',             tasks: [] },
  };
  tasks.forEach((t) => {
    const key = t.status in taskGroups ? t.status : 'todo';
    taskGroups[key].tasks.push(t);
  });

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--surface-2)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading project…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', flexDirection: 'column', gap: '1rem' }}>
        <AlertTriangle size={36} color="#f87171" />
        <p style={{ color: 'var(--text-secondary)' }}>{error ?? 'Project not found.'}</p>
        <button id="portal-back-btn" onClick={() => router.push('/portal/dashboard')} className="btn btn-secondary">← Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Nav ── */}
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg, #059669, #10b981)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={15} color="#fff" />
          </div>
          <button
            id="portal-back-dashboard"
            onClick={() => router.push('/portal/dashboard')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={15} /> Dashboard
          </button>
          <span style={{ color: 'var(--border)' }}>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>{project.name}</span>
          {user && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}><User size={13} /> {user.name}</span>}
          <HowToUseGuide moduleKey="portal-project-detail" title="How Your Project Page Works" content={PORTAL_PROJECT_HOWTO} />
        </div>
      </header>

      {/* ── Content ── */}
      <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: '2rem 1.5rem' }}>
        {/* Project header */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem 2rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{project.name}</h1>
                <StatusChip status={project.status} type="project" />
                <HelpIcon title="Your Project" content={{
                  what: 'A live view of this project — its overall progress, major milestones, and the tasks our team is working on.',
                  why: 'So you can follow along in real time instead of waiting for status updates.',
                  when: 'Visit any time — everything here refreshes as our team makes progress.',
                }} />
              </div>
              {project.project_number && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{project.project_number}</div>
              )}
              {project.description && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: 640, lineHeight: 1.6 }}>{project.description}</p>
              )}
              {project.manager && (
                <div style={{ marginTop: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.875rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Your account manager:</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>{project.manager.name}</span>
                  {project.manager.email && (
                    <a href={`mailto:${project.manager.email}?subject=${encodeURIComponent('Question about ' + project.name)}`}
                      style={{ fontSize: '0.75rem', fontWeight: 600, color: '#34d399' }}>
                      Send a message →
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Completion ring */}
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto' }}>
                <svg viewBox="0 0 72 72" width={72} height={72} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={36} cy={36} r={28} fill="none" stroke="var(--surface-2)" strokeWidth={7} />
                  <circle
                    cx={36} cy={36} r={28} fill="none"
                    stroke="url(#comp-grad)" strokeWidth={7}
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 28 * project.completion_percentage / 100} ${2 * Math.PI * 28}`}
                  />
                  <defs>
                    <linearGradient id="comp-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#059669" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9375rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {project.completion_percentage}%
                </div>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                Completion
                <HelpIcon size={12} text="How much of the project is finished overall — this fills up as our team completes the work." />
              </div>
            </div>
          </div>

          {/* Meta grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
            {[
              { icon: MilestoneIcon, label: 'Milestones', value: String(project.milestones_count) },
              { icon: Layers,        label: 'Tasks',       value: String(project.tasks_count) },
              { icon: Clock,         label: 'Started',     value: project.start_date ? new Date(project.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
              { icon: Flag,          label: 'Deadline',    value: project.end_date   ? new Date(project.end_date).toLocaleDateString('en-IN',   { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
            ].map((m) => (
              <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <m.icon size={16} color="var(--text-muted)" />
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>{m.label}</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.1rem' }}>{m.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: '0.375rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.25rem', marginBottom: '1.25rem', width: 'fit-content' }}>
          {(['milestones', 'tasks'] as const).map((tab) => (
            <button
              key={tab}
              id={`portal-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                transition: 'all 0.2s',
                background: activeTab === tab ? '#059669' : 'transparent',
                color:      activeTab === tab ? '#fff'    : 'var(--text-secondary)',
              }}
            >
              {tab === 'milestones' ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                  <MilestoneIcon size={14} /> Milestones
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                  <Layers size={14} /> Tasks
                </span>
              )}
            </button>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.375rem' }}>
            <HelpIcon text="Milestones are the big phases of your project; Tasks are the individual work items inside them." />
          </span>
        </div>

        {/* Milestones panel */}
        {activeTab === 'milestones' && (
          <div>
            {milestones.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <MilestoneIcon size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                <p style={{ fontSize: '0.875rem' }}>No milestones defined yet.</p>
              </div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: '2rem' }}>
                {/* Timeline line */}
                <div style={{ position: 'absolute', left: '0.75rem', top: 12, bottom: 12, width: 2, background: 'var(--surface-2)' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {milestones.sort((a, b) => a.sort_order - b.sort_order).map((ms, i) => {
                    const isDone   = ms.status === 'completed';
                    const isOver   = ms.status === 'overdue';
                    const dotColor = isDone ? '#4ade80' : isOver ? '#f87171' : ms.status === 'in_progress' ? '#60a5fa' : 'var(--border)';
                    return (
                      <div key={ms.id} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem', marginLeft: '1rem' }}>
                        {/* Dot on timeline */}
                        <div style={{ position: 'absolute', left: '-1.875rem', top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', background: dotColor, border: `2px solid var(--surface)`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                          {isDone && <CheckCircle2 size={10} color="#1a2e1a" />}
                          {!isDone && <Circle size={7} color={dotColor} fill={dotColor} />}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em' }}>#{i + 1}</span>
                              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>{ms.name}</h3>
                              <StatusChip status={ms.status} type="milestone" />
                            </div>
                            {ms.description && (
                              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.625rem', lineHeight: 1.5 }}>{ms.description}</p>
                            )}
                          </div>
                          {ms.due_date && (
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Due</div>
                              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: isOver ? '#f87171' : 'var(--text-primary)', marginTop: '0.1rem' }}>
                                {new Date(ms.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                          <ProgressBar value={ms.completion_percentage} />
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isDone ? '#4ade80' : 'var(--text-secondary)', minWidth: 36, textAlign: 'right' }}>{ms.completion_percentage}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tasks panel */}
        {activeTab === 'tasks' && (
          <div>
            {tasks.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Layers size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                <p style={{ fontSize: '0.875rem' }}>No tasks assigned to this project yet.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }} className="task-board-grid">
                {Object.entries(taskGroups).map(([key, group]) => (
                  group.tasks.length > 0 && (
                    <div key={key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: `2px solid ${group.color}` }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: group.color }}>{group.label}</span>
                        <span style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600, borderRadius: 20, padding: '1px 7px' }}>{group.tasks.length}</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        {group.tasks.map((task) => (
                          <div
                            key={task.id}
                            id={`task-card-${task.id}`}
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem' }}
                          >
                            {/* Title row */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <PriorityDot priority={task.priority} />
                              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, flex: 1 }}>{task.title}</span>
                            </div>

                            {/* Task number */}
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{task.task_number}</div>

                            {/* Progress */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <ProgressBar value={task.completion_percentage} />
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 28 }}>{task.completion_percentage}%</span>
                            </div>

                            {/* Meta: assignee + due date */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                              {task.assignee_name ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  <User size={11} /> {task.assignee_name}
                                </div>
                              ) : <span />}
                              {task.due_date && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Clock size={10} />
                                  {new Date(task.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          .task-board-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
