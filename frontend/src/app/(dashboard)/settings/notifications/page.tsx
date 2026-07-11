'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Save, Loader2, AlertCircle, Mail, BellRing } from 'lucide-react';
import { notificationPreferences as prefsApi, getApiErrorMessage } from '@/lib/api';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

// Every event listed here has REAL wiring behind it (see the cross-cutting
// module audit): the email column is consulted before each mail is sent, and
// the in-app column gates the alert for the events that produce one. Events
// without an in-app alert show a dash instead of a decorative checkbox.
const EVENT_TYPES: Array<{ key: string; label: string; desc: string; hasInApp: boolean }> = [
  { key: 'task_assigned', label: 'Task Assignment', desc: 'When a new project task is assigned to you.', hasInApp: false },
  { key: 'timesheet_submitted', label: 'Timesheet Submissions', desc: 'When a team member submits a timesheet for your review.', hasInApp: false },
  { key: 'payroll_processed', label: 'Payslip Availability', desc: 'When your monthly salary run is approved and payslip is ready.', hasInApp: false },
  { key: 'lead_assigned', label: 'Lead Assignment', desc: 'When a CRM lead is assigned or reassigned to you.', hasInApp: true },
  { key: 'invoice_overdue', label: 'Invoice Overdue', desc: 'When an invoice you issued passes its due date unpaid (checked daily).', hasInApp: true },
  { key: 'payment_received', label: 'Payment Received', desc: 'When someone records a client payment on an invoice you issued.', hasInApp: true },
];

export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [emailMap, setEmailMap] = useState<Record<string, boolean>>({});
  const [inAppMap, setInAppMap] = useState<Record<string, boolean>>({});

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
    const emails: Record<string, boolean> = {};
    const inApps: Record<string, boolean> = {};
    EVENT_TYPES.forEach(evt => {
      emails[evt.key] = false;   // email is opt-in
      inApps[evt.key] = true;    // in-app alerts are on unless turned off
    });

    if (Array.isArray(serverPrefs)) {
      serverPrefs.forEach((item: any) => {
        if (item.event_type in emails) {
          emails[item.event_type] = !!item.email;
          if (item.in_app !== undefined && item.in_app !== null) {
            inApps[item.event_type] = !!item.in_app;
          }
        }
      });
    }

    setEmailMap(emails);
    setInAppMap(inApps);
  }, [serverPrefs]);

  const updatePrefsMutation = useMutation({
    mutationFn: (data: Array<{ event_type: string; email: boolean; in_app: boolean }>) => prefsApi.update(data),
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
      in_app: evt.hasInApp ? (inAppMap[evt.key] ?? true) : true,
    }));
    updatePrefsMutation.mutate(payload);
  };

  const guideContent = {
    overview: 'Choose how each event notifies you. Email is off unless you turn it on; in-app alerts (the bell) are on unless you turn them off. Events showing a dash in the In-App column never produce an alert — only an email — so there is nothing to toggle.',
    sections: [
      {
        heading: 'What each event covers',
        items: [
          'Task Assignment — emails you when a project task is assigned to you.',
          'Timesheet Submissions — emails whoever needs to review a submitted timesheet.',
          'Payslip Availability — emails you once your monthly payroll run is approved.',
          'Lead Assignment — alerts (and optionally emails) you when a CRM lead is assigned or reassigned to you.',
          'Invoice Overdue — alerts (and optionally emails) you when an invoice you issued goes past due; a daily sweep checks every morning.',
          'Payment Received — alerts (and optionally emails) you when someone else records a payment on your invoice.',
        ],
      },
      {
        heading: 'Good to know',
        items: [
          'These settings only affect your own account — every user manages their own notification preferences.',
          'Other activity (quote approvals, lead stage changes) always shows as an in-app alert and can\'t be turned off here.',
          'Emails depend on SMTP being configured correctly (see Mail/SMTP Settings) — test it there if emails aren\'t arriving.',
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
              title="Notifications"
              content={{
                what: 'Per-event control over how you\'re notified: Email (off unless enabled) and In-App alerts (on unless disabled).',
                why: 'Every toggle here is honored by the code that sends the notification — a dash means that event never produces that kind of notification.',
              }}
            />
          </div>
          <HowToUseGuide moduleKey="settings_notifications" title="How Notification Settings Work" content={guideContent} />
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Choose how each event notifies you. Alerts for other activity (quote approvals, stage changes) are always on.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '3fr 1fr 1fr',
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
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BellRing size={12} /> In-App</span>
              </div>
            </div>

            {EVENT_TYPES.map(evt => (
              <div
                key={evt.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3fr 1fr 1fr',
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

                <div style={{ textAlign: 'center' }}>
                  {evt.hasInApp ? (
                    <input
                      type="checkbox"
                      checked={inAppMap[evt.key] ?? true}
                      onChange={(e) => setInAppMap(prev => ({ ...prev, [evt.key]: e.target.checked }))}
                      style={{ transform: 'scale(1.25)', cursor: 'pointer' }}
                    />
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }} title="This event sends an email only — it doesn't create an in-app alert.">—</span>
                  )}
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
