'use client';

import { useState, useEffect } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState';
import { useMutation, useQuery } from '@tanstack/react-query';
import { User as UserIcon, Mail, Phone, Loader2, Save, AlertCircle, Building2, BadgeCheck, Clock, MapPin, Monitor } from 'lucide-react';
import { users as usersApi, auth as authApi, getApiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { FileUpload } from '@/components/ui/FileUpload';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch login activity log
  const { data: activityData, isLoading: activityLoading, isError: activityError } = useQuery<any>({
    queryKey: ['loginActivity'],
    queryFn: async () => {
      const res = await authApi.loginActivity();
      return res.data;
    },
    enabled: !!user,
  });

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [imageError, setImageError] = useState(false);

  // Load state when user is loaded
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user]);

  useEffect(() => {
    setImageError(false);
  }, [avatarUrl]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: { name: string; phone: string; avatar_url: string }) => {
      if (!user) throw new Error('No authenticated user');
      return usersApi.update(user.id, data);
    },
    onSuccess: (res) => {
      const updatedUser = res.data;
      if (updatedUser) {
        setUser(updatedUser as any);
      }
      triggerAlert('Profile updated successfully.');
    },
    onError: (err: any) => {
      triggerError(getApiErrorMessage(err, 'Failed to update profile.'));
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      name,
      phone,
      avatar_url: avatarUrl,
    });
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Loading user session...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      
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
            <UserIcon size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>My Profile Details</h2>
          </div>
          <HowToUseGuide
            moduleKey="settings_profile"
            title="How to Use My Profile"
            content={{
              overview: 'This page covers your personal account details and a record of recent sign-ins to your account.',
              sections: [
                {
                  heading: 'Profile Details',
                  items: [
                    'Name, phone, and profile picture are yours to update at any time.',
                    'Email and Employee ID are set by an administrator and can\'t be changed here.',
                  ],
                },
                {
                  heading: 'Login Session History',
                  items: [
                    'Shows every sign-in attempt to your account, successful or not, with its IP address and device.',
                    'If you see a sign-in you don\'t recognize, change your password immediately from the Change Password page.',
                  ],
                },
              ],
            }}
          />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Avatar Preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1rem', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
            <div className="avatar avatar-lg" style={{ width: 64, height: 64, fontSize: '1.5rem', fontWeight: 600, flexShrink: 0 }}>
              {avatarUrl && !imageError ? (
                <img 
                  src={avatarUrl} 
                  alt={name} 
                  onError={() => setImageError(true)} 
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                />
              ) : (
                name ? name.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U'
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Profile Picture</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', marginBottom: '0.75rem' }}>
                Upload a JPEG, PNG, WEBP, or GIF image (max 2MB).
              </div>
              <FileUpload
                type="avatar"
                onUploadComplete={(res) => {
                  setAvatarUrl(res.url);
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                required
                type="text"
                placeholder="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address (Locked)</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  disabled
                  type="email"
                  value={user.email}
                  className="form-input"
                  style={{ paddingLeft: '2.25rem', opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={14} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.25rem' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Employee ID (Locked)</label>
              <input
                disabled
                type="text"
                value={user.employee_id || 'N/A'}
                className="form-input"
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Avatar Image URL</label>
            <input
              type="url"
              placeholder="https://example.com/avatar.jpg"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="form-input"
            />
          </div>

          {/* User Roles & Departments Info */}
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <BadgeCheck size={14} style={{ color: 'var(--accent)' }} /> Assigned Roles
              </label>
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
                {user.roles.map((r: any) => (
                  <span
                    key={r.id || r}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: 'var(--accent-subtle)',
                      color: 'var(--accent)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {r.display_name || r}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Building2 size={14} style={{ color: 'var(--accent)' }} /> Departments
              </label>
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
                {user.departments && user.departments.length > 0 ? (
                  user.departments.map((d: any) => (
                    <span
                      key={d.id}
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: 'var(--surface-elevated)',
                        color: 'var(--text-secondary)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {d.name}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {updateProfileMutation.isPending ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Save size={14} />
              )}
              <span>Save Profile Changes</span>
            </button>
          </div>

        </form>
      </div>

      {/* Login Session History Card */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <Clock size={18} style={{ color: 'var(--accent)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Login Session History</h2>
          <HelpIcon text="A record of every sign-in attempt to your account — successful or not, with IP and device." />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Review your recently active sessions. If you see any suspicious activity, please change your password immediately.
        </p>
        {activityLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--accent)' }} />
          </div>
        ) : activityError ? (
          <div style={{
            padding: '1rem 1.25rem',
            background: 'var(--danger-subtle)',
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8125rem',
            fontWeight: 500,
          }}>
            Couldn't load your login history. Please refresh and try again.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Logged At</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>IP Address</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Location</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Device</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {activityData?.data && activityData.data.length > 0 ? (
                  activityData.data.map((act: any) => (
                    <tr key={act.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-primary)' }}>
                        {act.logged_at ? new Date(act.logged_at).toLocaleString() : 'N/A'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {act.ip_address}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                        {act.location || 'Unknown'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={act.user_agent}>
                        {act.device_type ? act.device_type.toUpperCase() : 'Unknown'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: act.status === 'success' ? 'var(--success-subtle)' : 'var(--danger-subtle)',
                          color: act.status === 'success' ? 'var(--success)' : 'var(--danger)',
                        }}>
                          {act.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '2rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No recent login activity records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
