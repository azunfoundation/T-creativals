'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Lock, Save, Eye, EyeOff } from 'lucide-react';
import { auth, getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isPasswordValid = password.length >= 8;

  const changePasswordMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await auth.changePassword(data);
      return res.data;
    },
    onSuccess: (data: any) => {
      setSuccessMsg('Password changed successfully.');
      setErrorMsg(null);
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');

      // Update the auth token in localStorage and Zustand store
      const newToken = data.token;
      if (newToken) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', newToken);
        }
        useAuthStore.setState({ token: newToken });
      }
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => {
      const msg = getApiErrorMessage(err, 'Failed to change password. Please verify current password and try again.');
      setErrorMsg(msg);
      setSuccessMsg(null);
      setTimeout(() => setErrorMsg(null), 5000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    changePasswordMutation.mutate({
      current_password: currentPassword,
      password,
      password_confirmation: confirmPassword,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      
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
        }}>
          {errorMsg}
        </div>
      )}

      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '2rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              padding: '0.5rem',
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
            }}>
              <Lock size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Update Security Password
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.125rem 0 0 0' }}>
                Ensure your account stays secure by using a strong password.
              </p>
            </div>
          </div>
          <HowToUseGuide
            moduleKey="settings_change_password"
            title="How to Change Your Password"
            content={{
              overview: 'Changing your password immediately signs out every other device and browser you\'re logged in on — only this session stays active.',
              sections: [
                {
                  heading: 'Requirements',
                  items: ['At least 8 characters.', 'You must confirm your current password to change it.'],
                },
              ],
            }}
          />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="current-password">Current Password *</label>
            <div style={{ position: 'relative' }}>
              <input
                id="current-password"
                type={showPasswords ? 'text' : 'password'}
                required
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="new-password">New Password *</label>
            <div style={{ position: 'relative' }}>
              <input
                id="new-password"
                type={showPasswords ? 'text' : 'password'}
                required
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </div>
            {password && (
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  backgroundColor: isPasswordValid ? 'var(--success)' : 'var(--text-muted)',
                }} />
                <span style={{ fontSize: '0.75rem', color: isPasswordValid ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {isPasswordValid ? 'Password meets minimum requirements' : 'Password must be at least 8 characters long'}
                </span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirm-new-password">Confirm New Password *</label>
            <input
              id="confirm-new-password"
              type={showPasswords ? 'text' : 'password'}
              required
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <input
              id="show-passwords"
              type="checkbox"
              checked={showPasswords}
              onChange={() => setShowPasswords(!showPasswords)}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <label htmlFor="show-passwords" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
              Show passwords
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Save size={16} />
              {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
