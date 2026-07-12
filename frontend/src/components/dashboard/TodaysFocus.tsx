import React from 'react';
import { CheckSquare, ShieldCheck, Calendar, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { HelpIcon } from '@/components/ui/HelpIcon';

interface TodaysFocusProps {
  mySummary: any;
  attentionCounts: any;
  salesPipeline: any;
}

export default function TodaysFocus({ mySummary, attentionCounts, salesPipeline }: TodaysFocusProps) {
  const router = useRouter();

  const openTasks = mySummary?.open_tasks_count ?? 0;
  const approvals = attentionCounts?.approvals ?? 0;
  
  // Since meetings is not in the dashboard summary payload from the backend, 
  // we default to 0 to keep it honest to real data, but it is ready to receive data.
  const meetings = 0; 
  
  const followups = salesPipeline?.pending_followups ?? 0;
  const lateTasks = mySummary?.overdue_tasks_count ?? 0;

  const items = [
    {
      label: 'Open Tasks',
      value: openTasks,
      sub: 'Due or overdue',
      icon: CheckSquare,
      color: '#7c3aed',
      bg: '#ede9fe',
      route: '/tasks'
    },
    {
      label: 'Approvals',
      value: approvals,
      sub: 'Pending action',
      icon: ShieldCheck,
      color: '#10b981',
      bg: '#d1fae5',
      route: '/timesheets/approvals'
    },
    {
      label: 'Meetings',
      value: meetings,
      sub: 'Scheduled today',
      icon: Calendar,
      color: '#3b82f6',
      bg: '#dbeafe',
      route: '/timesheets'
    },
    {
      label: 'Follow-ups',
      value: followups,
      sub: 'Due today',
      icon: Clock,
      color: '#f59e0b',
      bg: '#fef3c7',
      route: '/crm'
    },
    {
      label: 'Late Tasks',
      value: lateTasks,
      sub: 'Overdue items',
      icon: AlertTriangle,
      color: '#ef4444',
      bg: '#fee2e2',
      route: '/tasks?filter=overdue'
    }
  ];

  return (
    <div className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">
          Today's Focus
          <HelpIcon title="Today's Focus" content={{
            what: 'A high-level tracking strip showing your items requiring attention today.',
            why: 'Consolidates tasks, approvals, meetings, follow-ups, and overdue actions into a single scannable row.',
            when: 'Check this strip throughout the day to prioritize your actions.'
          }} />
        </h2>
        <button
          onClick={() => router.push('/tasks')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600 }}
        >
          View My Day <ArrowRight size={14} />
        </button>
      </div>

      <div className="dash-focus-strip">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <React.Fragment key={i}>
              <div
                className="dash-focus-item"
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(item.route)}
              >
                <div
                  className="dash-focus-icon-wrap"
                  style={{ background: item.bg, color: item.color }}
                >
                  <Icon size={18} />
                </div>
                <div className="dash-focus-content">
                  <span className="dash-focus-value">{item.value}</span>
                  <span className="dash-focus-label">{item.label}</span>
                </div>
              </div>
              {i < items.length - 1 && (
                <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
