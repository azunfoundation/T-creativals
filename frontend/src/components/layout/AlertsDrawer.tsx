'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Bell, CheckCheck, Info, CheckCircle, AlertTriangle, AlertCircle, X,
  User, CheckSquare, FolderKanban, FileText, Receipt, Shield, ArrowRight, SlidersHorizontal
} from 'lucide-react';
import { alerts as alertsApi, Alert } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

interface AlertsDrawerProps {
  open: boolean;
  onClose: () => void;
}

const getAlertConfig = (type: string) => {
  if (type.startsWith('task_') || type === 'task') {
    return { icon: CheckSquare, color: '#7c3aed', bg: 'rgba(124,58,237,0.06)' };
  }
  if (type.startsWith('project_') || type === 'project') {
    return { icon: FolderKanban, color: '#059669', bg: 'rgba(5,150,105,0.06)' };
  }
  if (type.startsWith('lead_') || type.startsWith('crm_')) {
    return { icon: User, color: '#d97706', bg: 'rgba(217,119,6,0.06)' };
  }
  if (type.startsWith('invoice_') || type === 'payment_received' || type === 'invoice_overdue') {
    return { icon: Receipt, color: '#2563eb', bg: 'rgba(37,99,235,0.06)' };
  }
  if (type.startsWith('quote_')) {
    return { icon: FileText, color: '#ec4899', bg: 'rgba(236,72,153,0.06)' };
  }
  if (type.includes('approval') || type.includes('approved') || type.includes('rejected')) {
    return { icon: CheckCircle, color: '#7c3aed', bg: 'rgba(124,58,237,0.06)' };
  }
  if (type === 'mention') {
    return { icon: User, color: '#3b82f6', bg: 'rgba(59,130,246,0.06)' };
  }
  if (type === 'system') {
    return { icon: Shield, color: '#4b5563', bg: 'rgba(75,85,99,0.06)' };
  }
  return { icon: Info, color: '#2563eb', bg: 'rgba(37,99,235,0.06)' };
};

function groupAlerts(alertsList: Alert[]) {
  const today: Alert[] = [];
  const yesterday: Alert[] = [];
  const earlier: Alert[] = [];

  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayStr = yesterdayDate.toDateString();

  alertsList.forEach((alert) => {
    const alertDate = new Date(alert.created_at);
    const alertDateStr = alertDate.toDateString();

    if (alertDateStr === todayStr) {
      today.push(alert);
    } else if (alertDateStr === yesterdayStr) {
      yesterday.push(alert);
    } else {
      earlier.push(alert);
    }
  });

  return { today, yesterday, earlier };
}

export default function AlertsDrawer({ open, onClose }: AlertsDrawerProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'mentions'>('unread');

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Fetch alerts - shares cache with AppShell query key
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // Mutation to mark all alerts as read
  const markAllReadMutation = useMutation({
    mutationFn: () => alertsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const unreadCount = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);

  // Filter alerts by active tab locally
  const filteredAlerts = useMemo(() => {
    if (activeTab === 'unread') {
      return alerts.filter((a) => !a.read);
    }
    if (activeTab === 'mentions') {
      return alerts.filter((a) => a.type === 'mention');
    }
    return alerts;
  }, [alerts, activeTab]);

  const grouped = useMemo(() => groupAlerts(filteredAlerts), [filteredAlerts]);

  if (!open) return null;

  const handleNotificationClick = async (alert: Alert) => {
    if (!alert.read) {
      await markReadMutation.mutateAsync(alert.id);
    }
    if (alert.action_url) {
      router.push(alert.action_url);
      onClose();
    }
  };

  const renderGroup = (title: string, list: Alert[]) => {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          padding: '0 0.5rem 0.5rem',
        }}>
          {title}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {list.map((alert) => {
            const config = getAlertConfig(alert.type);
            const Icon = config.icon;
            return (
              <div
                key={alert.id}
                onClick={() => handleNotificationClick(alert)}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  background: alert.read ? 'transparent' : 'var(--surface-elevated)',
                  border: '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
                className="notification-item-row"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--surface-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.background = alert.read ? 'transparent' : 'var(--surface-elevated)';
                }}
              >
                {/* Icon Container */}
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: '10px',
                  flexShrink: 0,
                  background: config.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={18} style={{ color: config.color }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: alert.read ? 600 : 700,
                    color: 'var(--text-primary)',
                    marginBottom: '0.25rem',
                    lineHeight: 1.3,
                  }}>
                    {alert.title}
                  </div>
                  <div style={{
                    fontSize: '0.8125rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4,
                  }}>
                    {alert.body}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginTop: '0.375rem',
                  }}>
                    {formatRelativeTime(alert.created_at)}
                  </div>
                </div>

                {/* Unread indicator dot */}
                {!alert.read && (
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: config.color,
                    flexShrink: 0,
                    marginTop: '0.375rem',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(3px)',
          zIndex: 60,
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications Drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 61,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header Section */}
        <div style={{
          padding: '1.5rem 1.5rem 1rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(124,58,237,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}>
                <Bell size={18} />
              </div>
              <h2 style={{
                fontSize: '1.125rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}>
                Notifications
                {unreadCount > 0 && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                  }}>
                    {unreadCount}
                  </span>
                )}
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {unreadCount > 0 && (
                <button
                  id="mark-all-read"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--accent)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <CheckCheck size={14} />
                  Mark all as read
                </button>
              )}
              <button
                id="close-alerts-drawer"
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  borderRadius: '50%',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {unreadCount} unread of {alerts.length} total
            </span>
          </div>

          {/* Filter Tabs matching the layout */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            gap: '1rem',
            marginTop: '0.25rem',
          }}>
            {(['all', 'unread', 'mentions'] as const).map((tab) => {
              const label = tab.charAt(0).toUpperCase() + tab.slice(1);
              const isActive = activeTab === tab;
              const count = tab === 'unread' ? unreadCount : tab === 'mentions' ? alerts.filter(a => a.type === 'mention').length : null;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '0.5rem 0.25rem 0.75rem',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s',
                  }}
                >
                  {label}
                  {count !== null && count > 0 && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? '#fff' : 'var(--text-muted)',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Alerts List Container */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem 1.25rem 1rem',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0.5rem' }}>
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{
                    background: 'var(--surface-elevated)',
                    height: 80,
                    borderRadius: '12px',
                  }}
                />
              ))}
            </div>
          ) : isError ? (
            <div style={{
              margin: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              textAlign: 'center',
              padding: '2rem',
            }}>
              <AlertCircle size={32} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Couldn't load notifications.
              </p>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div style={{
              margin: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              textAlign: 'center',
              padding: '2rem',
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--surface-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                marginBottom: '0.25rem',
              }}>
                <Bell size={24} style={{ opacity: 0.4 }} />
              </div>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                All caught up!
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: '220px' }}>
                No notifications right now for this filter.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {renderGroup('Today', grouped.today)}
              {renderGroup('Yesterday', grouped.yesterday)}
              {renderGroup('Earlier', grouped.earlier)}
            </div>
          )}
        </div>

        {/* Footer Area with navigation */}
        <div style={{
          padding: '1.25rem',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => {
              router.push('/notifications');
              onClose();
            }}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'rgba(124,58,237,0.06)',
              border: '1px solid rgba(124,58,237,0.15)',
              borderRadius: '12px',
              color: 'var(--accent)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(124,58,237,0.12)';
              e.currentTarget.style.borderColor = 'rgba(124,58,237,0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(124,58,237,0.06)';
              e.currentTarget.style.borderColor = 'rgba(124,58,237,0.15)';
            }}
          >
            <span>View all notifications</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </>
  );
}
