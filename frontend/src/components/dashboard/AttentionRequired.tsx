import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';
import { toArr } from './shared';

interface InvoiceItem {
  id: string | number;
  invoice_number: string;
  total_amount?: number;
  days_overdue?: number;
  client?: {
    name?: string;
  };
}

interface TaskItem {
  id: string | number;
  title?: string;
  due_date?: string;
  project?: {
    name?: string;
  };
  assignee?: {
    name?: string;
  };
}

interface ProjectItem {
  id: string | number;
  name: string;
  end_date?: string;
  manager?: {
    name?: string;
  };
  client?: {
    name?: string;
  };
}

interface LeadItem {
  id: string | number;
  name?: string;
  company_name?: string;
  source?: string;
  phone?: string;
  email?: string;
}

interface AttentionRequiredProps {
  attentionData: {
    overdue_invoices?: InvoiceItem[];
    overdue_tasks?: TaskItem[];
    delayed_projects?: ProjectItem[];
    stale_leads?: LeadItem[];
  };
}

export default function AttentionRequired({ attentionData }: AttentionRequiredProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const invoices = toArr(attentionData?.overdue_invoices) as InvoiceItem[];
  const tasks = toArr(attentionData?.overdue_tasks) as TaskItem[];
  const projects = toArr(attentionData?.delayed_projects) as ProjectItem[];
  const leads = toArr(attentionData?.stale_leads) as LeadItem[];

  // Map backend items to normalized Alert structures
  const alerts: Array<{
    id: string | number;
    type: 'invoice' | 'task' | 'project' | 'lead';
    title: string;
    subtitle: string;
    value: string | number;
    metaText: string;
    color: string;
    route: string;
  }> = [];

  invoices.forEach((inv: InvoiceItem) => {
    alerts.push({
      id: inv.id,
      type: 'invoice',
      title: `Overdue Invoice ${inv.invoice_number}`,
      subtitle: inv.client?.name || 'Unknown Client',
      value: formatCurrency(inv.total_amount || 0),
      metaText: inv.days_overdue ? `${inv.days_overdue} days overdue` : 'Overdue',
      color: 'var(--danger)',
      route: `/invoices`
    });
  });

  tasks.forEach((tsk: TaskItem) => {
    alerts.push({
      id: tsk.id,
      type: 'task',
      title: tsk.title || 'Untitled Task',
      subtitle: tsk.project?.name ? `Project: ${tsk.project.name}` : 'No Project',
      value: tsk.assignee?.name ? `Assignee: ${tsk.assignee.name}` : 'Unassigned',
      metaText: tsk.due_date ? `Due: ${formatDate(tsk.due_date)}` : 'No due date',
      color: 'var(--warning)',
      route: `/tasks`
    });
  });

  projects.forEach((prj: ProjectItem) => {
    alerts.push({
      id: prj.id,
      type: 'project',
      title: `Delayed Project: ${prj.name}`,
      subtitle: prj.client?.name || 'Unknown Client',
      value: prj.manager?.name ? `PM: ${prj.manager.name}` : 'No PM',
      metaText: prj.end_date ? `Deadline: ${formatDate(prj.end_date)}` : 'Delayed',
      color: 'var(--danger)',
      route: `/projects/${prj.id}`
    });
  });

  leads.forEach((ld: LeadItem) => {
    alerts.push({
      id: ld.id,
      type: 'lead',
      title: `Lead Waiting: ${ld.name || ld.company_name}`,
      subtitle: ld.source ? `Source: ${ld.source}` : 'CRM Lead',
      value: ld.phone || ld.email || 'No contact info',
      metaText: 'No activity',
      color: 'var(--warning)',
      route: `/crm`
    });
  });

  // Sort alerts so red (danger) ones come first, then yellow (warning)
  alerts.sort((a, b) => {
    if (a.color === 'var(--danger)' && b.color !== 'var(--danger)') return -1;
    if (a.color !== 'var(--danger)' && b.color === 'var(--danger)') return 1;
    return 0;
  });

  const displayAlerts = expanded ? alerts : alerts.slice(0, 3);
  const remainingCount = alerts.length - displayAlerts.length;

  return (
    <div className="dash-card" style={{ flex: 1, minHeight: '340px' }}>
      <div className="dash-card-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="dash-card-title" style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Attention Required
            <HelpIcon title="Attention Required" content={{
              what: 'A listing of overdue invoices, overdue tasks, delayed projects, and stale leads.',
              why: 'Acts as an immediate action list for critical bottlenecks.',
              when: 'Review these at the start of your day and resolve them.'
            }} />
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Critical alerts requiring immediate action</p>
        </div>
        {alerts.length > 0 && (
          <span style={{
            fontSize: '0.75rem', fontWeight: 600,
            background: 'var(--danger-subtle)', color: 'var(--danger)',
            padding: '0.125rem 0.5rem', borderRadius: '9999px'
          }}>
            {alerts.length} alerts
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginTop: '0.5rem' }}>
        {alerts.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <AlertCircle size={24} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: '0.8125rem' }}>All quiet! No issues require attention right now.</p>
          </div>
        ) : (
          displayAlerts.map((alert, i) => (
            <div
              key={`${alert.type}-${alert.id}-${i}`}
              className="dash-attention-item"
              style={{ borderLeftColor: alert.color }}
              onClick={() => router.push(alert.route)}
            >
              <div className="dash-attention-info">
                <span className="dash-attention-title">{alert.title}</span>
                <span className="dash-attention-subtitle">{alert.subtitle}</span>
              </div>
              <div className="dash-attention-meta">
                <span className="dash-attention-value">{alert.value}</span>
                <span
                  className="dash-attention-badge"
                  style={{
                    background: alert.color === 'var(--danger)' ? 'var(--danger-subtle)' : 'var(--warning-subtle)',
                    color: alert.color
                  }}
                >
                  {alert.metaText}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {remainingCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            alignSelf: 'center', fontSize: '0.75rem', fontWeight: 600,
            color: 'var(--accent)', marginTop: 'auto', padding: '0.25rem 0.5rem'
          }}
        >
          +{remainingCount} more items
        </button>
      )}

      {expanded && alerts.length > 3 && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            alignSelf: 'center', fontSize: '0.75rem', fontWeight: 600,
            color: 'var(--accent)', marginTop: 'auto', padding: '0.25rem 0.5rem'
          }}
        >
          Show less
        </button>
      )}
    </div>
  );
}
