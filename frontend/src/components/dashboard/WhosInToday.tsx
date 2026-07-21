import React from 'react';
import { useRouter } from 'next/navigation';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { getInitials } from '@/lib/utils';
import { UsersRound, AlertCircle } from 'lucide-react';

interface WhosInTodayProps {
  presenceData: any[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  canViewTeamAttendance: boolean;
  isProjectScoped?: boolean;
}

export default function WhosInToday({
  presenceData,
  isLoading,
  isError,
  onRetry,
  canViewTeamAttendance,
  isProjectScoped = false
}: WhosInTodayProps) {
  const router = useRouter();

  if (!canViewTeamAttendance) {
    return null; // Gated behind attendance permission
  }

  const team = presenceData || [];
  const present = team.filter(m => m.attendance && ['present', 'partial'].includes(m.attendance.status));
  const onLeave = team.filter(m => m.attendance?.status === 'leave');
  const notIn = team.filter(m => !m.attendance || !['present', 'partial', 'leave'].includes(m.attendance.status));

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ height: '36px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)' }} />
          <div style={{ height: '14px', background: 'var(--surface-elevated)', borderRadius: '4px', width: '60%' }} />
        </div>
      );
    }

    if (isError) {
      return (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <AlertCircle size={13} />
          Failed to load attendance.
          <button onClick={onRetry} style={{ color: 'var(--accent)', fontWeight: 600 }}>Retry</button>
        </div>
      );
    }

    const overflowCount = present.length > 5 ? present.length - 5 : 0;
    const displayedPresent = present.slice(0, 5);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem', flex: 1, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
            {present.length} online
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)' }} />
            {onLeave.length} away
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
            {notIn.length} not in yet
          </span>
        </div>

        {/* Overlapping Avatar Group */}
        {present.length === 0 ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
            Nobody has clocked in yet today.
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', margin: '0.25rem 0' }}>
            <div className="dash-avatar-group">
              {displayedPresent.map((m, i) => (
                <div
                  key={m.id || i}
                  className="dash-avatar-item"
                  title={`${m.name} (In at ${m.attendance?.check_in_at || ''})`}
                  style={{ border: '2px solid var(--surface)' }}
                >
                  {getInitials(m.name)}
                </div>
              ))}
              {overflowCount > 0 && (
                <div
                  className="dash-avatar-item"
                  style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)', fontSize: '0.75rem', border: '2px solid var(--surface)' }}
                  onClick={() => router.push('/attendance')}
                  title="View all team attendance"
                >
                  +{overflowCount}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
          {present.length === 0 ? 'Nobody is checked in.' : 'Active team presence live summary.'}
        </div>
      </div>
    );
  };

  return (
    <div className="dash-card" style={{ flex: 1, minHeight: '300px' }}>
      <div className="dash-card-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="dash-card-title" style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Who's In Today {isProjectScoped && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>(Org-wide)</span>}
            <HelpIcon title="Who's In Today" content={{
              what: 'Visual indicator of team attendance check-in status for today.',
              why: 'Allows management to see which staff members are currently clocked in.',
              when: 'Review before setting daily sync meetings or routing emergency client tasks.'
            }} />
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Attendance registry headcount</p>
        </div>
        <UsersRound size={14} style={{ color: 'var(--text-muted)' }} />
      </div>

      {renderContent()}
    </div>
  );
}
