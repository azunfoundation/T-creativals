'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Save, Loader2, AlertCircle, Shield, Send } from 'lucide-react';
import { platformSettings as settingsApi, getApiErrorMessage, SystemSettings } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

export default function SmtpSettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpEncryption, setSmtpEncryption] = useState('tls');

  // Fetch Settings
  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data;
    },
  });

  // Load state when data is loaded
  useEffect(() => {
    if (settings && settings.company) {
      setSmtpHost((settings.company as any).smtp_host || '');
      setSmtpPort((settings.company as any).smtp_port || '587');
      setSmtpUsername((settings.company as any).smtp_username || '');
      setSmtpFromName((settings.company as any).smtp_from_name || '');
      setSmtpFromEmail((settings.company as any).smtp_from_email || '');
      setSmtpEncryption((settings.company as any).smtp_encryption || 'tls');
    }
  }, [settings]);

  // Mutations
  const updateSmtpMutation = useMutation({
    mutationFn: (data: any) => settingsApi.updateSmtp(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      triggerAlert('SMTP settings saved successfully.');
      setSmtpPassword(''); // Clear password field after save
    },
    onError: (err: any) => {
      triggerError(getApiErrorMessage(err, 'Failed to save SMTP settings.'));
    }
  });

  const testEmailMutation = useMutation({
    mutationFn: () => settingsApi.sendTestEmail(),
    onSuccess: (res) => {
      triggerAlert(
        (res.data as { message?: string })?.message || 'Test email sent. Check your inbox (and spam folder).'
      );
    },
    onError: (err: any) => {
      triggerError(getApiErrorMessage(err, 'Test email failed. Check the SMTP settings.'));
    },
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSmtpMutation.mutate({
      smtp_host: smtpHost,
      smtp_port: parseInt(smtpPort) || 587,
      smtp_username: smtpUsername,
      smtp_password: smtpPassword || undefined, // only send if not blank
      smtp_from_name: smtpFromName,
      smtp_from_email: smtpFromEmail,
      smtp_encryption: smtpEncryption,
    });
  };

  // Check roles
  const userRoles = user?.roles.map((r: any) => typeof r === 'string' ? r : r?.name || '') || [];
  const isAdmin = userRoles.includes('founder') || userRoles.includes('director');

  if (!isAdmin) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '1rem', textAlign: 'center' }}>
        <Shield size={40} style={{ color: 'var(--danger)' }} />
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Access Restricted</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '360px' }}>
          Only agency founders and directors may view or update system mail configuration.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Loading mail parameters...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Notifications */}
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

      {errorMsg && (
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
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Mail/SMTP Settings</h2>
            <HelpIcon
              title="Mail/SMTP Settings"
              content={{
                what: 'The outgoing mail server this app uses to send welcome emails, quotes, invoices, payslips, and notification emails.',
                why: 'Without a working SMTP configuration, none of those emails leave the server — always send a test email after changing anything here.',
              }}
            />
          </div>
          <HowToUseGuide
            moduleKey="settings_smtp"
            title="How to Configure Mail/SMTP"
            content={{
              overview: 'These settings take effect immediately after saving — no server restart needed.',
              sections: [
                {
                  heading: 'Setting it up',
                  items: [
                    'Get the host, port, username, and password from your email provider (e.g. Gmail, Mailgun, SES).',
                    'Leave the password field blank when editing to keep the currently saved password.',
                    'Always click "Send Test Email" after saving — a saved config with a typo will fail silently otherwise.',
                  ],
                },
                {
                  heading: 'Who can do this',
                  items: ['Only founders and directors can view or change mail settings.'],
                },
              ],
            }}
          />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Configure the default outgoing SMTP server used by Creativals OS to dispatch onboarding credentials, quotes, invoice notices, and payslip alerts.
          </p>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group">
              <label className="form-label">SMTP Host *</label>
              <input
                required
                type="text"
                placeholder="e.g. smtp.mailgun.org"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">SMTP Port *</label>
              <input
                required
                type="number"
                placeholder="e.g. 587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group">
              <label className="form-label">SMTP Username *</label>
              <input
                required
                type="text"
                placeholder="e.g. postmaster@yourdomain.com"
                value={smtpUsername}
                onChange={(e) => setSmtpUsername(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">SMTP Password</label>
              <input
                type="password"
                placeholder="Leave blank to keep current password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '2fr 1fr' }}>
            <div className="form-group">
              <label className="form-label">Sender Email Address *</label>
              <input
                required
                type="email"
                placeholder="e.g. notifications@creativals.com"
                value={smtpFromEmail}
                onChange={(e) => setSmtpFromEmail(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Encryption Protocol *</label>
              <select
                value={smtpEncryption}
                onChange={(e) => setSmtpEncryption(e.target.value)}
                className="form-input"
              >
                <option value="tls">TLS (Recommended)</option>
                <option value="ssl">SSL</option>
                <option value="starttls">STARTTLS</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Sender Display Name *</label>
            <input
              required
              type="text"
              placeholder="e.g. Creativals Studio"
              value={smtpFromName}
              onChange={(e) => setSmtpFromName(e.target.value)}
              className="form-input"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => testEmailMutation.mutate()}
              disabled={testEmailMutation.isPending}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              title="Sends a test email to your own address using the saved SMTP settings"
            >
              {testEmailMutation.isPending ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Send size={14} />
              )}
              <span>Send Test Email</span>
            </button>
            <button
              type="submit"
              disabled={updateSmtpMutation.isPending}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {updateSmtpMutation.isPending ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Save size={14} />
              )}
              <span>Save SMTP Settings</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
