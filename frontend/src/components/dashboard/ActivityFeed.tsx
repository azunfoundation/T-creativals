import React from 'react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { truncate } from './shared';
import { Activity, Radio } from 'lucide-react';

interface ActivityFeedProps {
  alertsList: any[];
}

export default function ActivityFeed({ alertsList }: ActivityFeedProps) {
  const displayedAlerts = alertsList.slice(0, 6);

  const getDotColor = (type: string) => {
    switch (type) {
      case 'danger':
        return 'var(--danger)';
      case 'warning':
        return 'var(--warning)';
      case 'success':
        return 'var(--success)';
      case 'info':
      default:
        return 'var(--info)';
    }
  };

  return (
    <div className="dash-card" style={{ flex: 1, minHeight: '300px' }}>
      <div className="dash-card-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="dash-card-title" style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Activity Feed
            <HelpIcon title="Activity Feed" content={{
              what: 'A chronological timeline of system updates, client invoice logs, lead changes, or task events.',
              why: 'Ensures everyone is aware of the latest project/invoicing actions.',
              when: 'Check periodically to catch new events without refreshing specific sheets.'
            }} />
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Latest system activities</p>
        </div>
        <Activity size={14} style={{ color: 'var(--text-muted)' }} />
      </div>

      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {alertsList.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <Radio size={24} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: '0.8125rem' }}>No recent activity</p>
          </div>
        ) : (
          <div className="dash-timeline-list">
            {displayedAlerts.map((a: any, idx: number) => {
              const dotColor = getDotColor(a.type);
              
              // Get relative time placeholder if not defined, or clean format if we have dates
              const timeString = a.created_at ? new Date(a.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              }) : 'Just now';

              return (
                <div key={a.id ?? idx} className="dash-timeline-item">
                  <div className="dash-timeline-marker" style={{ background: dotColor }} />
                  <div className="dash-timeline-content">
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.title}</div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{truncate(a.body, 65)}</div>
                  </div>
                  <span className="dash-timeline-time">{timeString}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
