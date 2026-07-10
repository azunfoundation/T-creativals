'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Info, CheckCircle, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { alerts as alertsApi, Alert } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

interface AlertsDrawerProps {
  open: boolean;
  onClose: () => void;
}

const ALERT_CONFIG = {
  info:    { icon: Info,          color: 'var(--info)',    bg: 'var(--info-subtle)' },
  success: { icon: CheckCircle,   color: 'var(--success)', bg: 'var(--success-subtle)' },
  warning: { icon: AlertTriangle, color: 'var(--warning)', bg: 'var(--warning-subtle)' },
  danger:  { icon: AlertCircle,   color: 'var(--danger)',  bg: 'var(--danger-subtle)' },
};

export default function AlertsDrawer({ open, onClose }: AlertsDrawerProps) {
  const queryClient = useQueryClient();

  // Esc key listener
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Fetch alerts with React Query — no mock fallback; a failed fetch surfaces
  // as a real error state instead of masking backend failures with fake data.
  const { data: alerts = [], isLoading, isError } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: async () => {
      const res = await alertsApi.list();
      const payload = res.data as any;
      if (payload && Array.isArray(payload.data)) {
        return payload.data;
      }
      return Array.isArray(payload) ? payload : [];
    },
    enabled: open,
  });

  // Mutation to mark alert as read
  const markReadMutation = useMutation({
    mutationFn: (id: number) => alertsApi.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['alerts'] });
      const previousAlerts = queryClient.getQueryData<Alert[]>(['alerts']);
      if (previousAlerts) {
        queryClient.setQueryData<Alert[]>(
          ['alerts'],
          previousAlerts.map((a) => (a.id === id ? { ...a, read: true } : a))
        );
      }
      return { previousAlerts };
    },
    onError: (err, id, context) => {
      if (context?.previousAlerts) {
        queryClient.setQueryData(['alerts'], context.previousAlerts);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // Mutation to mark all alerts as read
  const markAllReadMutation = useMutation({
    mutationFn: () => alertsApi.markAllRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['alerts'] });
      const previousAlerts = queryClient.getQueryData<Alert[]>(['alerts']);
      if (previousAlerts) {
        queryClient.setQueryData<Alert[]>(
          ['alerts'],
          previousAlerts.map((a) => ({ ...a, read: true }))
        );
      }
      return { previousAlerts };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousAlerts) {
        queryClient.setQueryData(['alerts'], context.previousAlerts);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const unreadCount = alerts.filter((a) => !a.read).length;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 60,
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 400,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 61,
          display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          animation: 'slideInRight 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.25rem 1rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bell size={18} />
              Notifications
              {unreadCount > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 20, height: 20, padding: '0 5px',
                  background: 'var(--accent)',
                  color: '#fff',
                  borderRadius: '9999px',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                }}>
                  {unreadCount}
                </span>
              )}
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {unreadCount} unread of {alerts.length} total
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {unreadCount > 0 && (
              <button
                id="mark-all-read"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                  fontSize: '0.75rem', color: 'var(--accent)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
            <button
              id="close-alerts-drawer"
              onClick={onClose}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)',
                borderRadius: 'var(--radius-sm)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-elevated)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Alerts list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '1rem' }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse" style={{ background: 'var(--surface-elevated)', height: 75, borderRadius: 'var(--radius-md)' }} />
              ))}
            </div>
          ) : isError ? (
            <div style={{ paddingTop: '3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem', textAlign: 'center' }}>
              <AlertCircle size={32} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Couldn't load notifications.</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="empty-state" style={{ paddingTop: '5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <Bell size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
              <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>All caught up!</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No notifications right now.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {alerts.map((alert) => {
                const config = ALERT_CONFIG[alert.type] || ALERT_CONFIG.info;
                const Icon = config.icon;
                return (
                  <div
                    key={alert.id}
                    onClick={() => {
                      if (!alert.read) {
                        markReadMutation.mutate(alert.id);
                      }
                    }}
                    style={{
                      display: 'flex', gap: '0.875rem',
                      padding: '0.875rem',
                      borderRadius: 'var(--radius-md)',
                      background: alert.read ? 'transparent' : 'var(--surface-elevated)',
                      border: '1px solid transparent',
                      cursor: alert.read ? 'default' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: config.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={16} style={{ color: config.color }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.875rem',
                        fontWeight: alert.read ? 400 : 600,
                        color: 'var(--text-primary)',
                        marginBottom: '0.25rem',
                        lineHeight: 1.3,
                      }}>
                        {alert.title}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {alert.body}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
                        {formatRelativeTime(alert.created_at)}
                      </div>
                    </div>

                    {/* Unread dot */}
                    {!alert.read && (
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--accent)', flexShrink: 0,
                        marginTop: '0.375rem',
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <button
            style={{
              width: '100%',
              padding: '0.5rem',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-elevated)'; }}
          >
            View all notifications
          </button>
        </div>
      </div>
    </>
  );
}
