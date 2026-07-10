'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Save, Loader2, AlertCircle, Mail } from 'lucide-react';
import { notificationPreferences as prefsApi, getApiErrorMessage } from '@/lib/api';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

// Only these 3 events actually have a working notification behind them today
// (TaskController / TimesheetController / PayrollRunController each check the
// saved 'email' preference before sending). Every other event this app can log
// (lead assignment, invoice overdue, payment received) has no email or in-app
// wiring at all yet, and in-app/push channels aren't consulted anywhere in the
// codebase regardless of event — so this page only offers what it can actually
// deliver, instead of presenting toggles that silently do nothing.
const EVENT_TYPES = [
  { key: 'task_assigned', label: 'Task Assignment', desc: 'When a new project task is assigned to you.' },
  { key: 'timesheet_submitted', label: 'Timesheet Submissions', desc: 'When a team member submits a timesheet for your review.' },
  { key: 'payroll_processed', label: 'Payslip Availability', desc: 'When your monthly salary run is approved and payslip is ready.' },
];

export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [emailMap, setEmailMap] = useState<Record<string, boolean>>({});

  // Fetch preferences. Note: the API returns a bare array ({data: [...]} with no
  // pagination meta), which the global axios interceptor unwraps to the array
  // itself — so `res.data` here already IS the preference list, not {data: [...]}.
  const { data: serverPrefs, isLoading, isError } = useQuery({
    queryKey: ['notificationPreferences'],
    queryFn: async () => {
      const res = await prefsApi.get();
      return res.data;
    },
  });

  useEffect(() => {
    const initialMap: Record<string, boolean> = {};
    EVENT_TYPES.forEach(evt => { initialMap[evt.key] = false; });

    if (Array.isArray(serverPrefs)) {
      serverPrefs.forEach(item => {
        if (item.event_type in initialMap) {
          initialMap[item.event_type] = item.email;
        }
      });
    }

    setEmailMap(initialMap);
  }, [serverPrefs]);

  const updatePrefsMutation = useMutation({
    mutationFn: (data: Array<{ event_type: string; email: boolean }>) => prefsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationPreferences'] });
      triggerAlert('Notification preferences saved successfully.');
    },
    onError: (err: any) => {
      triggerError(getApiErrorMessage(err, 'Failed to save notification preferences.'));
    }
  });

  const triggerAlert = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg(null);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = EVENT_TYPES.map(evt => ({
      event_type: evt.key,
      email: emailMap[evt.key] || false,
    }));
    updatePrefsMutation.mutate(payload);
  };

  const guideContent = {
    overview: 'Choose which of the events below should email you. These are the only notifications this app can currently send automatically — everything else on the platform (like a new lead assignment) shows up as an in-app alert only, which is always on and cannot be turned off here.',
    sections: [
      {
        heading: 'What each event covers',
        items: [
          'Task Assignment — emails you when a project task is assigned to you.',
          'Timesheet Submissions — emails whoever needs to review a submitted timesheet.',
          'Payslip Availability — emails you once your monthly payroll run is approved.',
        ],
      },
      {
        heading: 'Good to know',
        items: [
          'These settings only affect your own account — every user manages their own notification preferences.',
          'Emails depend on SMTP being configured correctly (see Mail/SMTP Settings) — test it there if emails aren’t arriving.',
        ],
      },
    ],
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Loading preferences...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {successMsg && (
        <div style={{
          padding: '0.875rem 1.25rem',
          background: 'var(--success-subtle)',
          color: 'var(--success)',
          border: '1px solid var(--success)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}>
          {successMsg}
        </div>
      )}

      {(errorMsg || isError) && (
        <div style={{
          padding: '0.875rem 1.25rem',
          background: 'var(--danger-subtle)',
          color: 'var(--danger)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <AlertCircle size={16} />
          <span>{errorMsg || "Couldn't load your notification preferences. Please refresh and try again."}</span>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Personal Notification Settings</h2>
            <HelpIcon
              title="Email Notifications"
              content={{
                what: 'Turns email delivery on or off per event, for your account only.',
                why: 'Only these 3 events currently trigger an email — other activity (like lead or quote changes) only ever shows as an in-app alert, which is always on.',
              }}
            />
          </div>
          <HowToUseGuide moduleKey="settings_notifications" title="How Notification Settings Work" content={guideContent} />
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Choose which system events should send you an email. In-app alerts for other activity are always on.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '3fr 1fr',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '0.5rem',
              fontWeight: 600,
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
              alignItems: 'center',
            }}>
              <div>Event Activity</div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> Email</span>
              </div>
            </div>

            {EVENT_TYPES.map(evt => (
              <div
                key={evt.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3fr 1fr',
                  padding: '0.75rem 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.875rem',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{evt.label}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{evt.desc}</span>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={emailMap[evt.key] || false}
                    onChange={(e) => setEmailMap(prev => ({ ...prev, [evt.key]: e.target.checked }))}
                    style={{ transform: 'scale(1.25)', cursor: 'pointer' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={updatePrefsMutation.isPending}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {updatePrefsMutation.isPending ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Save size={14} />
              )}
              <span>Save Preferences</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
