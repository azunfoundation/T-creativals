'use client';

import { useState } from 'react'; 
import { SkeletonTable } from '@/components/ui/Skeleton'; 
import { EmptyState } from '@/components/ui/EmptyState'; 
import { useToast } from '@/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { 
  FileSpreadsheet, Search, Filter, Calendar, Eye, 
  ChevronLeft, ChevronRight, User, AlertCircle, FileText, 
  MapPin, Laptop, Info, ArrowRight, X, Download
} from 'lucide-react';
import {
  auditLogs as auditsApi,
  users as usersApi,
  AuditLog,
  AuditLogParams
} from '@/lib/api';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const MODULE_OPTIONS = [
  { label: 'All Modules', value: '' },
  { label: 'Project', value: 'App\\Models\\Project' },
  { label: 'Milestone', value: 'App\\Models\\Milestone' },
  { label: 'Task', value: 'App\\Models\\Task' },
  { label: 'Timesheet', value: 'App\\Models\\Timesheet' },
  { label: 'Quote', value: 'App\\Models\\Quote' },
  { label: 'Invoice', value: 'App\\Models\\Invoice' },
  { label: 'Payment', value: 'App\\Models\\Payment' },
  { label: 'Settings', value: 'App\\Models\\CompanySetting' },
  { label: 'User', value: 'App\\Models\\User' },
];

const EVENT_OPTIONS = [
  { label: 'All Events', value: '' },
  { label: 'Created', value: 'created' },
  { label: 'Updated', value: 'updated' },
  { label: 'Deleted', value: 'deleted' },
  { label: 'Restored', value: 'restored' },
];

export default function AuditLogsPage() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [filterUser, setFilterUser] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterEvent, setFilterEvent] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Fetch Users for Filter dropdown
  const { data: usersData } = useQuery({
    queryKey: ['auditUsers'],
    queryFn: async () => {
      try {
        const res = await usersApi.list({ per_page: 100 });
        return res.data;
      } catch {
        return [];
      }
    }
  });

  const activeFilters: AuditLogParams = {
    page,
    per_page: 15,
    user_id: filterUser ? parseInt(filterUser, 10) : undefined,
    auditable_type: filterModule || undefined,
    event: filterEvent || undefined,
    from: filterFrom || undefined,
    to: filterTo || undefined,
  };

  // Fetch Audit Logs
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auditLogs', activeFilters],
    queryFn: async () => {
      const res = await auditsApi.list(activeFilters);
      return res.data;
    }
  });

  const logs = (data as any)?.data as AuditLog[] || [];
  const meta = (data as any)?.meta || { current_page: 1, last_page: 1, per_page: 15, total: 0 };

  const handleExportCsv = async () => {
    try {
      const response = await auditsApi.exportCsv(activeFilters);
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      showToast('CSV export failed. Please try again.', 'error');
    }
  };

  const resetFilters = () => {
    setFilterUser('');
    setFilterModule('');
    setFilterEvent('');
    setFilterFrom('');
    setFilterTo('');
    setPage(1);
  };

  const getEventBadge = (event: string) => {
    let color = 'var(--info)';
    if (event === 'created') color = 'var(--success)';
    if (event === 'updated') color = 'var(--warning)';
    if (event === 'deleted') color = 'var(--danger)';
    if (event === 'restored') color = '#7c3aed';

    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '9999px',
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color: color,
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`
      }}>
        {event}
      </span>
    );
  };

  const getModuleLabel = (type: string) => {
    const parts = type.split('\\');
    return parts[parts.length - 1] || type;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileSpreadsheet size={18} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Audit Logs</h1>
          <HelpIcon
            title="Audit Logs"
            content={{
              what: 'A permanent, unfiltered record of who created, updated, deleted, or restored a record across the platform, plus when and from what IP address.',
              why: 'Lets founders and directors trace exactly what changed on any record and who did it — useful for investigating a mistake or a disputed change.',
              when: 'Use the filters to narrow down to a specific person, module, action type, or date range before exporting.',
            }}
          />
        </div>
        <HowToUseGuide
          moduleKey="settings_audit_logs"
          title="How to Use Audit Logs"
          content={{
            overview: 'Every create, update, delete, and restore action across the platform is logged here automatically — nothing needs to be turned on.',
            sections: [
              {
                heading: 'Finding what you need',
                items: [
                  'Filter by who triggered the change, which module it touched, the action type, or a date range.',
                  'Click the eye icon on any row to see exactly which fields changed, before and after.',
                  'Export CSV downloads the currently filtered results, not the entire log.',
                ],
              },
              {
                heading: 'Who can see this',
                items: ['Only founders and directors have access to Audit Logs.'],
              },
            ],
          }}
        />
      </div>

      {isError && (
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
          <span>Couldn't load audit logs. Please refresh and try again.</span>
        </div>
      )}

      {/* Search and Filters panel */}
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>

          {/* User Selector */}
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={12} /> Triggered By
            </label>
            <select
              value={filterUser}
              onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}
              className="form-input"
            >
              <option value="">All Users</option>
              {(usersData as any)?.data?.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Module Selector */}
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Filter size={12} /> Module Section
            </label>
            <select
              value={filterModule}
              onChange={(e) => { setFilterModule(e.target.value); setPage(1); }}
              className="form-input"
            >
              {MODULE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Event Selector */}
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label className="form-label">Action Type</label>
            <select
              value={filterEvent}
              onChange={(e) => { setFilterEvent(e.target.value); setPage(1); }}
              className="form-input"
            >
              {EVENT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Date Picker - From */}
          <div className="form-group" style={{ flex: '1 1 150px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={12} /> From Date
            </label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
              className="form-input"
            />
          </div>

          {/* Date Picker - To */}
          <div className="form-group" style={{ flex: '1 1 150px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={12} /> To Date
            </label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
              className="form-input"
            />
          </div>

          {/* Reset Filters */}
          <button 
            type="button" 
            onClick={resetFilters} 
            className="btn btn-secondary"
            style={{ height: '38px', minWidth: '100px' }}
          >
            Reset
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn btn-primary"
            style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

        </div>
      </div>

      {/* Grid List */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <FileText size={18} style={{ color: 'var(--accent)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>System Audit Timeline</h2>
        </div>

        <div className="data-table-wrap">
          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading audit trails...
            </div>
          ) : logs && logs.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Module</th>
                  <th>Target ID</th>
                  <th>IP Address</th>
                  <th style={{ textAlign: 'right' }}>Payload</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    {/* Timestamp */}
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>

                    {/* User */}
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {log.user?.name || `System (User #${log.user_id})`}
                    </td>

                    {/* Action badge */}
                    <td>{getEventBadge(log.event)}</td>

                    {/* Module */}
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {getModuleLabel(log.auditable_type)}
                    </td>

                    {/* Target ID */}
                    <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {log.auditable_id > 0 ? `#${log.auditable_id}` : '-'}
                    </td>

                    {/* IP Address */}
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {log.ip_address || 'Internal'}
                    </td>

                    {/* Details Trigger */}
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="btn btn-ghost btn-sm btn-icon"
                          title="View Change Diff"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={32} style={{ opacity: 0.3 }} />
              <span>No audit logs matching search parameters.</span>
            </div>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.last_page > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--border)',
            paddingTop: '1rem',
            marginTop: '1rem'
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Showing {logs.length} logs of {meta.total} total record(s)
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="btn btn-secondary btn-sm btn-icon"
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.75rem', fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                Page {page} of {meta.last_page}
              </span>
              <button
                disabled={page === meta.last_page}
                onClick={() => setPage(p => p + 1)}
                className="btn btn-secondary btn-sm btn-icon"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
          AUDIT DETAILS MODAL (BEFORE/AFTER DIFFERENCES VISUALIZER)
          ============================================================ */}
      {selectedLog && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 100 }}
            onClick={() => setSelectedLog(null)}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            maxWidth: '850px',
            maxHeight: '85vh',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)',
            zIndex: 101,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface-elevated)'
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Audit Trail Detail #{selectedLog.id}
                </span>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {getModuleLabel(selectedLog.auditable_type)} ({selectedLog.event})
                </h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="btn btn-ghost btn-icon" style={{ padding: '0.25rem' }}>
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Metadata Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', padding: '1rem', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actioned By</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{selectedLog.user?.name || `User #${selectedLog.user_id}`}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Date & Time</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{new Date(selectedLog.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.75rem', color: 'var(--text-muted)' }}><MapPin size={10} /> IP Address</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{selectedLog.ip_address || 'Internal'}</span>
                </div>
                <div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.75rem', color: 'var(--text-muted)' }}><Laptop size={10} /> Browser Agent</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedLog.user_agent || 'Console CLI'}>
                    {selectedLog.user_agent || 'Console CLI'}
                  </span>
                </div>
              </div>

              {/* Before/After Diff Viewer */}
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Info size={14} style={{ color: 'var(--accent)' }} /> Changed Attributes Diff
                </h4>
                
                {selectedLog.metadata?.old || selectedLog.metadata?.new ? (
                  <div className="data-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <table className="data-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Property Key</th>
                          <th>Before Modification (Old)</th>
                          <th style={{ width: '40px' }} />
                          <th>After Modification (New)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys({
                          ...(selectedLog.metadata.old || {}),
                          ...(selectedLog.metadata.new || {})
                        }).map((key) => {
                          const oldVal = selectedLog.metadata?.old?.[key];
                          const newVal = selectedLog.metadata?.new?.[key];
                          const hasChanged = oldVal !== newVal;

                          return (
                            <tr key={key} style={{ background: hasChanged ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'transparent' }}>
                              {/* Key */}
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                                {key}
                              </td>

                              {/* Old Value */}
                              <td style={{
                                color: 'var(--danger)',
                                background: oldVal !== undefined ? 'var(--danger-subtle)' : 'transparent',
                                textDecoration: oldVal !== undefined ? 'line-through' : 'none',
                                fontFamily: 'monospace',
                                fontSize: '0.8125rem',
                                padding: '6px 10px',
                                borderRadius: '4px'
                              }}>
                                {oldVal !== undefined ? String(oldVal) : '(Not Set)'}
                              </td>

                              {/* Arrow icon */}
                              <td style={{ textAlign: 'center' }}>
                                {hasChanged && <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />}
                              </td>

                              {/* New Value */}
                              <td style={{
                                color: 'var(--success)',
                                background: newVal !== undefined ? 'var(--success-subtle)' : 'transparent',
                                fontWeight: hasChanged ? 600 : 400,
                                fontFamily: 'monospace',
                                fontSize: '0.8125rem',
                                padding: '6px 10px',
                                borderRadius: '4px'
                              }}>
                                {newVal !== undefined ? String(newVal) : '(Deleted)'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 ? (
                  <div style={{ padding: '1rem', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Extended Action Details</span>
                    <pre style={{ margin: 0, padding: 0, fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
                    No change diff metadata payload logged for this action.
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'var(--surface-elevated)'
            }}>
              <button onClick={() => setSelectedLog(null)} className="btn btn-secondary">
                Close Viewer
              </button>
            </div>

          </div>
        </>
      )}

    </div>
  );
}
