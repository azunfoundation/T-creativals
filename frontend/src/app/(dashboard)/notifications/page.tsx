'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Bell, CheckCheck, Info, CheckCircle, AlertTriangle, AlertCircle, X,
  User, CheckSquare, FolderKanban, FileText, Receipt, Shield, Trash2,
  Search, Eye, EyeOff, SlidersHorizontal, RefreshCw, Square, CheckSquare as CheckSquareIcon, Check
} from 'lucide-react';
import { alerts as alertsApi, Alert, getApiErrorMessage } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

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

const FILTERS = [
  { id: 'all', label: 'All', icon: Bell },
  { id: 'unread', label: 'Unread', icon: AlertCircle },
  { id: 'mentions', label: 'Mentions', icon: User },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'crm', label: 'CRM / Leads', icon: User },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'quotes', label: 'Quotes', icon: FileText },
  { id: 'approvals', label: 'Approvals', icon: CheckCircle },
  { id: 'system', label: 'System', icon: Shield },
];

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

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Fetch alerts using React Query
  const { data: alerts = [], isLoading, isError, refetch, isRefetching } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: async () => {
      const res = await alertsApi.list({ filter: 'all' });
      const payload = res.data as any;
      if (payload && Array.isArray(payload.data)) {
        return payload.data;
      }
      return Array.isArray(payload) ? payload : [];
    },
  });

  // Bulk actions mutations
  const markReadMutation = useMutation({
    mutationFn: (id: number) => alertsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => alertsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      showToast('All notifications marked as read.', 'success');
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to mark all as read'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => alertsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const deleteReadMutation = useMutation({
    mutationFn: () => alertsApi.deleteRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      showToast('All read notifications cleared.', 'success');
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to clear read notifications'), 'error'),
  });

  // Client-side filtering logic
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // 1. Apply tab filter
      if (activeFilter === 'unread' && alert.read) return false;
      if (activeFilter === 'mentions' && alert.type !== 'mention') return false;
      if (activeFilter === 'tasks' && !alert.type.startsWith('task_') && alert.type !== 'task') return false;
      if (activeFilter === 'projects' && !alert.type.startsWith('project_')) return false;
      if (activeFilter === 'crm' && !alert.type.startsWith('lead_') && !alert.type.startsWith('crm_')) return false;
      if (activeFilter === 'invoices' && !alert.type.startsWith('invoice_') && alert.type !== 'payment_received') return false;
      if (activeFilter === 'quotes' && !alert.type.startsWith('quote_')) return false;
      if (activeFilter === 'approvals' && !alert.type.includes('approval') && !alert.type.includes('approved') && !alert.type.includes('rejected')) return false;
      if (activeFilter === 'system' && alert.type !== 'system') return false;

      // 2. Apply search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesTitle = alert.title.toLowerCase().includes(query);
        const matchesBody = alert.body.toLowerCase().includes(query);
        return matchesTitle || matchesBody;
      }

      return true;
    });
  }, [alerts, activeFilter, searchQuery]);

  const grouped = useMemo(() => groupAlerts(filteredAlerts), [filteredAlerts]);

  // Tab counts
  const unreadCount = useMemo(() => alerts.filter(a => !a.read).length, [alerts]);
  const mentionCount = useMemo(() => alerts.filter(a => a.type === 'mention').length, [alerts]);

  const handleSelectToggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllToggle = () => {
    if (selectedIds.size === filteredAlerts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAlerts.map((a) => a.id)));
    }
  };

  const handleBulkMarkRead = async () => {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedIds).map(async (id) => {
          const alert = alerts.find((a) => a.id === id);
          if (alert && !alert.read) {
            await markReadMutation.mutateAsync(id);
          }
        })
      );
      setSelectedIds(new Set());
      showToast('Selected notifications marked as read.', 'success');
    } catch {
      showToast('Failed to update some notifications.', 'error');
    }
  };

  const handleBulkMarkUnread = async () => {
    // In backend AlertController, there is markRead(id) and markAllRead() but no explicit markUnread endpoint.
    // However, to keep it functional, we can map this or skip if not supported.
    // If not supported directly, we can explain it, or let's support it if the backend supports toggle/updating is_read.
    // For now, let's keep it simple: we can delete them, or focus on delete/mark read bulk actions which are supported.
    showToast('Marking unread is not supported by the backend, please mark as read or delete.', 'info');
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => deleteMutation.mutateAsync(id))
      );
      setSelectedIds(new Set());
      showToast('Selected notifications deleted.', 'success');
    } catch {
      showToast('Failed to delete some notifications.', 'error');
    }
  };

  const handleNotificationClick = async (alert: Alert) => {
    if (!alert.read) {
      await markReadMutation.mutateAsync(alert.id);
    }
    if (alert.action_url) {
      router.push(alert.action_url);
    }
  };

  const renderListSection = (title: string, list: Alert[]) => {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border)',
          marginBottom: '1rem',
        }}>
          {title}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {list.map((alert) => {
            const config = getAlertConfig(alert.type);
            const Icon = config.icon;
            const isSelected = selectedIds.has(alert.id);

            return (
              <div
                key={alert.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  background: alert.read ? 'transparent' : 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  transition: 'all 0.2s',
                  position: 'relative',
                }}
              >
                {/* Checkbox */}
                <button
                  onClick={() => handleSelectToggle(alert.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    borderRadius: '4px',
                  }}
                >
                  {isSelected ? <CheckSquareIcon size={18} /> : <Square size={18} />}
                </button>

                {/* Icon */}
                <div
                  onClick={() => handleNotificationClick(alert)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: config.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} style={{ color: config.color }} />
                </div>

                {/* Content */}
                <div
                  onClick={() => handleNotificationClick(alert)}
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                >
                  <div style={{
                    fontSize: '0.9375rem',
                    fontWeight: alert.read ? 600 : 700,
                    color: 'var(--text-primary)',
                    marginBottom: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    {alert.title}
                    {!alert.read && (
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: config.color,
                        display: 'inline-block',
                      }} />
                    )}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {alert.body}
                  </div>
                </div>

                {/* Right Area (Time & Delete) */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '0.5rem',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {formatRelativeTime(alert.created_at)}
                  </span>
                  <button
                    onClick={() => deleteMutation.mutate(alert.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      padding: '4px',
                      borderRadius: '4px',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem' }}>
      
      {/* Title Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bell size={24} style={{ color: 'var(--accent)' }} />
            Notification Center
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Manage and view all your system and project notifications in one place.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem' }}
          >
            <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
            Refresh
          </button>

          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.75rem' }}
            >
              <CheckCheck size={14} />
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* Main Page Layout Grid (Split Sidebar and List) */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
        
        {/* Left Filter Sidebar */}
        <div className="card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.5rem',
          }}>
            Filters
          </h2>

          {FILTERS.map((f) => {
            const Icon = f.icon;
            const isActive = activeFilter === f.id;
            const count = f.id === 'unread' ? unreadCount : f.id === 'mentions' ? mentionCount : null;

            return (
              <button
                key={f.id}
                onClick={() => {
                  setActiveFilter(f.id);
                  setSelectedIds(new Set());
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '8px',
                  background: isActive ? 'rgba(124,58,237,0.08)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 700 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--surface-elevated)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.875rem' }}>
                  <Icon size={16} />
                  <span>{f.label}</span>
                </div>
                {count !== null && count > 0 && (
                  <span style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: isActive ? 'var(--accent)' : 'var(--border)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Content Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Search and Bulk Actions Card */}
          <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.5rem 0.5rem 2.25rem',
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            {/* Bulk Toolbar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--border)',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  onClick={handleSelectAllToggle}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}
                >
                  {selectedIds.size === filteredAlerts.length && filteredAlerts.length > 0 ? (
                    <CheckSquareIcon size={16} style={{ color: 'var(--accent)' }} />
                  ) : (
                    <Square size={16} />
                  )}
                  <span>Select All ({selectedIds.size} selected)</span>
                </button>

                {selectedIds.size > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleBulkMarkRead}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                    >
                      <Eye size={12} />
                      Mark Read
                    </button>
                    <button
                      onClick={handleBulkMarkUnread}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                    >
                      <EyeOff size={12} />
                      Mark Unread
                    </button>
                    <button
                      onClick={handleBulkDelete}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--danger)' }}
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={() => deleteReadMutation.mutate()}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  Clear Read Notifications
                </button>
              </div>
            </div>
          </div>

          {/* Grouped Notifications List Card */}
          <div className="card" style={{ padding: '1.5rem', minHeight: '350px', display: 'flex', flexDirection: 'column' }}>
            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse" style={{ background: 'var(--surface-elevated)', height: 70, borderRadius: '8px' }} />
                ))}
              </div>
            ) : isError ? (
              <div style={{ margin: 'auto', textAlign: 'center', padding: '3rem 1rem' }}>
                <AlertTriangle size={48} style={{ color: 'var(--danger)', opacity: 0.5, marginBottom: '1rem' }} />
                <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Failed to Load</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Could not retrieve notifications from the server.</p>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', padding: '4rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: 'var(--surface-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}>
                  <Bell size={24} style={{ opacity: 0.4 }} />
                </div>
                <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>All Clean!</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '280px' }}>
                  There are no notifications matching your search or filters.
                </p>
              </div>
            ) : (
              <div>
                {renderListSection('Today', grouped.today)}
                {renderListSection('Yesterday', grouped.yesterday)}
                {renderListSection('Earlier', grouped.earlier)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
