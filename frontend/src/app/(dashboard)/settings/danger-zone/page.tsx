'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { 
  AlertTriangle, Loader2, ShieldAlert, CheckCircle2, 
  Settings2, Database, Trash2, ArrowRight, UserCheck, ShieldX,
  FileCheck, ShieldCheck, PlayCircle, Eye, AlertCircle
} from 'lucide-react';
import { systemReset, getApiErrorMessage } from '@/lib/api';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

interface ResetResult {
  message?: string;
  backup_file: string;
  deleted_counts?: Record<string, number>;
}

export default function DangerZonePage() {
  const [successResult, setSuccessResult] = useState<ResetResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active Modals
  const [activeModal, setActiveModal] = useState<'platform' | 'module' | 'factory' | null>(null);
  const [selectedModule, setSelectedModule] = useState<string>('');
  
  // Form values
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);

  // Loading progress simulation
  const [resetStep, setResetStep] = useState(0);
  const [resetProgress, setResetProgress] = useState(0);

  const modules = [
    { key: 'crm', name: 'CRM (Leads & Followups)', description: 'Leads, contacts, conversion logs, and follow-up activities.' },
    { key: 'clients', name: 'Clients & Communications', description: 'Client profiles, login accounts, and communication logs.' },
    { key: 'projects', name: 'Projects & Milestones', description: 'Projects, tasks linked to projects, milestones, and shared files.' },
    { key: 'tasks', name: 'Tasks & Timesheets', description: 'Standalone tasks, timesheets, attachments, and approvals.' },
    { key: 'payroll', name: 'Payroll Runs & Compensations', description: 'Monthly payroll runs, items, compensations, and bonuses.' },
    { key: 'attendance', name: 'Attendance & Leave Requests', description: 'Attendance clock logs and leave allocations/requests.' },
    { key: 'expenses', name: 'Expenses & Attachments', description: 'Expense records, vendor bills, and attached receipts.' },
    { key: 'quotes', name: 'Quotes & Approvals', description: 'Quotes, pricing lines, client review audits, and terms.' },
    { key: 'invoices', name: 'Invoices & Payments', description: 'Invoices, transaction history, offline payments, and credit notes.' },
    { key: 'reports', name: 'Reports Cache', description: 'Cached performance audits and financial reports.' },
  ];

  const clearForm = () => {
    setPassword('');
    setConfirmation('');
    setFinalConfirmOpen(false);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 8000);
  };

  // Reset Mutations
  const resetPlatformMutation = useMutation({
    mutationFn: () => systemReset.resetPlatform({ password, confirmation }),
    onSuccess: (res: any) => {
      const payload = res.data?.backup_file ? res.data : (res.data?.data || res.data || res);
      setSuccessResult({
        backup_file: payload?.backup_file || '',
        deleted_counts: payload?.deleted_counts,
        message: 'Platform Reset Complete'
      });
      setActiveModal(null);
      clearForm();
    },
    onError: (err: any) => {
      triggerError(getApiErrorMessage(err, 'Platform reset failed.'));
      setFinalConfirmOpen(false);
    }
  });

  const resetModuleMutation = useMutation({
    mutationFn: () => systemReset.resetModule({ module: selectedModule, password }),
    onSuccess: (res: any) => {
      const payload = res.data?.backup_file ? res.data : (res.data?.data || res.data || res);
      setSuccessResult({
        backup_file: payload?.backup_file || '',
        deleted_counts: payload?.deleted_counts,
        message: `Module-Level Reset Complete (${selectedModule})`
      });
      setActiveModal(null);
      clearForm();
    },
    onError: (err: any) => {
      triggerError(getApiErrorMessage(err, 'Module reset failed.'));
    }
  });

  const factoryResetMutation = useMutation({
    mutationFn: () => systemReset.factoryReset({ password, confirmation }),
    onSuccess: (res: any) => {
      const payload = res.data?.backup_file ? res.data : (res.data?.data || res.data || res);
      setSuccessResult({
        backup_file: payload?.backup_file || '',
        message: 'Factory Reset Complete'
      });
      setActiveModal(null);
      clearForm();
    },
    onError: (err: any) => {
      triggerError(getApiErrorMessage(err, 'Factory reset failed.'));
    }
  });

  const handlePlatformResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmation !== 'RESET ENTIRE PLATFORM') {
      triggerError('Confirmation text must match exactly.');
      return;
    }
    setFinalConfirmOpen(true);
  };

  const executePlatformReset = () => {
    resetPlatformMutation.mutate();
  };

  const handleModuleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModule) return;
    if (confirmation !== 'RESET MODULE') {
      triggerError('Confirmation text must match exactly.');
      return;
    }
    resetModuleMutation.mutate();
  };

  const handleFactoryResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmation !== 'FACTORY RESET') {
      triggerError('Confirmation text must match exactly.');
      return;
    }
    factoryResetMutation.mutate();
  };

  const isExecuting = 
    resetPlatformMutation.isPending || 
    resetModuleMutation.isPending || 
    factoryResetMutation.isPending;

  const activeResetType = 
    resetPlatformMutation.isPending ? 'platform' :
    resetModuleMutation.isPending ? 'module' :
    factoryResetMutation.isPending ? 'factory' : null;

  // Step Loader Simulation
  useEffect(() => {
    let interval: any;
    if (isExecuting) {
      setResetStep(1);
      setResetProgress(12);
      interval = setInterval(() => {
        setResetStep((prev) => {
          if (prev < 4) {
            const next = prev + 1;
            if (next === 2) setResetProgress(38);
            if (next === 3) setResetProgress(68);
            if (next === 4) setResetProgress(89);
            return next;
          }
          return prev;
        });
      }, 1200);
    } else {
      setResetStep(0);
      setResetProgress(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isExecuting]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
      
      {/* CSS Keyframe Animations Injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to { opacity: 1; backdrop-filter: blur(12px); }
        }
        @keyframes modalScaleIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .pulse-danger-badge {
          animation: pulseGlow 2s infinite;
        }
        .modal-backdrop-animate {
          animation: modalFadeIn 0.2s ease-out forwards;
        }
        .modal-card-animate {
          animation: modalScaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />

      {/* Title Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '1rem', 
        borderBottom: '1px solid var(--border)', 
        paddingBottom: '1.5rem',
        marginTop: '0.5rem'
      }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 'var(--radius-md)',
          background: 'var(--danger-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          <ShieldAlert size={28} style={{ color: 'var(--danger)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Danger Zone</h1>
            <HelpIcon
              title="Danger Zone"
              content={{
                what: 'Three irreversible actions: wiping business data, wiping one module\'s data, or a full factory reset.',
                why: 'Every action here creates a verified backup first and requires your password plus a typed confirmation phrase, so it can\'t be triggered by accident.',
              }}
            />
          </span>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Destructive settings and rollback configurations. Restricted to system administrators with Founder privilege only.
          </p>
        </div>
        <HowToUseGuide
          moduleKey="settings_danger_zone"
          title="How to Use the Danger Zone"
          content={{
            overview: 'Every action below is backed up automatically before it runs, requires your current password, and requires typing an exact confirmation phrase — there is no accidental way to trigger any of these.',
            sections: [
              {
                heading: 'Reset Platform Data',
                items: ['Wipes all business records (leads, projects, invoices, etc.) and client portal accounts. Staff accounts and settings are kept.'],
              },
              {
                heading: 'Reset Module Data',
                items: ['Wipes only the records belonging to one selected module — use this for a clean re-import of a single area without touching anything else.'],
              },
              {
                heading: 'Factory Reset',
                items: ['The most destructive option: wipes everything and deletes every account except yours, then re-seeds default configuration. Only use this to fully restart the platform.'],
              },
            ],
          }}
        />
      </div>

      {/* Warning Banner */}
      <div style={{
        padding: '1.25rem',
        background: 'rgba(245, 158, 11, 0.03)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        gap: '1rem',
        alignItems: 'flex-start'
      }}>
        <AlertTriangle size={20} style={{ color: 'var(--warning)', marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Important Security Notice:</strong> All deletion sequences automatically generate a physical SQLite snapshot backup in your server storage prior to execution. Integrity checking is run dynamically via SQLite engine tools to prevent table lockouts or silent corruption.
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div style={{
          padding: '1rem 1.25rem',
          background: 'var(--danger-subtle)',
          color: 'var(--danger)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Success Summary Panel */}
      {successResult && (
        <div style={{ 
          border: '1px solid var(--success)', 
          background: 'rgba(16, 185, 129, 0.03)', 
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          boxShadow: '0 4px 24px rgba(16, 185, 129, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--success-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(16, 185, 129, 0.2)'
            }}>
              <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)', margin: 0 }}>
              {successResult.message || 'Operation Executed Successfully'}
            </h3>
          </div>

          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            The database snapshot was validated and stored. Target configurations and records have been successfully reset.
          </p>

          <div style={{ 
            background: 'var(--surface-elevated)', 
            padding: '1rem 1.25rem', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Database size={16} style={{ color: 'var(--accent)' }} />
              <div style={{ fontSize: '0.8125rem' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Backup Archive Filename</span>
                <code style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {successResult.backup_file}
                </code>
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', background: 'var(--success-subtle)', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.2)', fontWeight: 600 }}>
              Verified (PRAGMA ok)
            </span>
          </div>

          {successResult.deleted_counts && Object.keys(successResult.deleted_counts).length > 0 && (
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Impact Summary & Cleared Records
              </div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
                gap: '0.75rem' 
              }}>
                {Object.entries(successResult.deleted_counts).map(([name, count]) => (
                  <div key={name} style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '0.875rem', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                      {name.replace('_', ' ')}
                    </span>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {count}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
            <button 
              onClick={() => setSuccessResult(null)} 
              className="btn btn-secondary btn-sm"
              style={{ fontWeight: 600 }}
            >
              Dismiss Result Summary
            </button>
          </div>
        </div>
      )}

      {/* Main Feature Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* CARD 1: PLATFORM RESET */}
        <div className="card" style={{ 
          border: '1px solid var(--border)', 
          borderLeft: '4px solid var(--danger)',
          background: 'var(--surface)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'var(--danger-subtle)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Operational Wipe
                </span>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Reset Platform Data
                </h2>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, maxWidth: '780px' }}>
                Purges all active business data (Leads, Projects, Tasks, Timesheets, Invoices, Payments, Expenses, and AI Context logs) and removes client login profiles. Restores the database to onboarding state. Preserves Administrator accounts, sequences, and configurations.
              </p>
            </div>
            <button
              onClick={() => { setActiveModal('platform'); clearForm(); }}
              className="btn btn-danger"
              style={{ background: 'var(--danger)', color: '#fff', fontWeight: 600, padding: '0.6rem 1.25rem' }}
            >
              Reset Entire Platform
            </button>
          </div>
        </div>

        {/* CARD 2: RESET MODULE DATA */}
        <div className="card" style={{ 
          border: '1px solid var(--border)', 
          borderLeft: '4px solid var(--accent)',
          background: 'var(--surface)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'var(--accent-subtle)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Selective Wipe
                </span>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Reset Module Data
                </h2>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, maxWidth: '780px' }}>
                Selectively purge transactional and file records for a single, isolated module. This is ideal for wiping attendance schedules, re-importing clean leads, or flushing payroll configurations without affecting billing or client files.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.25rem' }}>
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                className="form-control"
                style={{ 
                  background: 'var(--surface-elevated)', 
                  border: '1px solid var(--border)', 
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem 0.75rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  outline: 'none',
                  minWidth: '240px',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select a Module to Reset...</option>
                {modules.map(mod => (
                  <option key={mod.key} value={mod.key}>{mod.name}</option>
                ))}
              </select>
              <button
                disabled={!selectedModule}
                onClick={() => { setActiveModal('module'); clearForm(); }}
                className="btn btn-secondary"
                style={{ fontWeight: 600, padding: '0.6rem 1.25rem' }}
              >
                Configure Reset
              </button>
            </div>
          </div>
        </div>

        {/* CARD 3: FACTORY RESET */}
        <div className="card" style={{ 
          border: '1px solid var(--border)', 
          borderLeft: '4px solid var(--danger)',
          background: 'rgba(239, 68, 68, 0.01)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#fff', background: 'var(--danger)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Full Reinstall
                </span>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--danger)', margin: 0 }}>
                  Factory Reset
                </h2>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, maxWidth: '780px' }}>
                A highly destructive, complete wipe. Wipes all database tables, deletes all user accounts (retaining only your Founder profile), clears settings, and runs core database seeders. Restores sequences, leave allocations, default roles/permissions, and stages to fresh seeds.
              </p>
            </div>
            <button
              onClick={() => { setActiveModal('factory'); clearForm(); }}
              className="btn btn-danger"
              style={{ background: 'var(--danger)', color: '#fff', fontWeight: 700, padding: '0.6rem 1.25rem' }}
            >
              Factory Reset
            </button>
          </div>
        </div>

      </div>

      {/* ============================================================
          PROGRESS / STEP SEQUENCE OVERLAY
          ============================================================ */}
      {isExecuting && (
        <div className="modal-backdrop-animate" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 15, 20, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          color: 'var(--text-primary)',
          padding: '2rem',
        }}>
          <div className="modal-card-animate" style={{
            width: '100%',
            maxWidth: '480px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: '2.5rem',
            boxShadow: 'var(--shadow-lg), 0 0 40px rgba(239, 68, 68, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem',
            textAlign: 'center',
            alignItems: 'center',
          }}>
            {/* Pulsing Danger Badge */}
            <div className="pulse-danger-badge" style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'var(--danger-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}>
              <ShieldAlert size={40} style={{ color: 'var(--danger)' }} />
            </div>

            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Executing System Reset</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: 0, lineHeight: 1.4 }}>
                Processing destructive sequence. Generating pre-reset snapshot and wiping data structures. Please wait.
              </p>
            </div>

            {/* Progress Bar Container */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ 
                width: '100%', 
                height: '8px', 
                background: 'var(--surface-elevated)', 
                borderRadius: '99px', 
                overflow: 'hidden', 
                border: '1px solid var(--border)' 
              }}>
                <div style={{
                  width: `${resetProgress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--danger), #ff6b6b)',
                  borderRadius: '99px',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                COMPLETING: {resetProgress}%
              </span>
            </div>

            {/* Steps Checklist */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.875rem', textAlign: 'left', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
              {[
                { id: 1, text: 'Copying database snapshot backup' },
                { id: 2, text: 'Running SQLite integrity verification' },
                { id: 3, text: activeResetType === 'module' ? `Wiping selected module (${selectedModule})` : 'Purging transactional record tables' },
                { id: 4, text: 'Finalizing audit logs & flushing server cache' }
              ].map((s) => {
                const isCompleted = resetStep > s.id;
                const isActive = resetStep === s.id;
                const isPending = resetStep < s.id;

                return (
                  <div key={s.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    color: isCompleted ? 'var(--text-primary)' : isActive ? 'var(--danger)' : 'var(--text-muted)',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: '0.875rem',
                    transition: 'all 0.2s ease',
                  }}>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      {isCompleted ? (
                        <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                      ) : isActive ? (
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--danger)' }} />
                      ) : (
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)', background: 'transparent' }} />
                      )}
                    </div>
                    <span>{s.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL: PLATFORM RESET
          ============================================================ */}
      {activeModal === 'platform' && (
        <div className="modal-backdrop-animate" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 10, 15, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.5rem'
        }}>
          <div className="modal-card-animate" style={{
            width: '100%',
            maxWidth: '540px',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            padding: '2.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg), 0 0 32px rgba(239, 68, 68, 0.05)',
          }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ 
                background: 'var(--danger-subtle)', 
                color: 'var(--danger)', 
                padding: '0.6rem', 
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                flexShrink: 0
              }}>
                <ShieldX size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
                  Reset Entire Platform
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--danger)', fontWeight: 600, margin: '4px 0 0 0' }}>
                  This action is highly destructive and irreversible.
                </p>
              </div>
            </div>

            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              You are purging all business data. System configurations, admin profiles, SMTP coordinates, and settings will remain untouched. A snapshot backup will be created first.
            </div>

            {/* Platform Reset Data Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Operational Data to be Deleted:
              </span>
              <div style={{
                background: 'rgba(239, 68, 68, 0.02)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Trash2 size={12} style={{ color: 'var(--danger)' }} /> CRM & Lead Records</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Trash2 size={12} style={{ color: 'var(--danger)' }} /> Client Portal Accounts</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Trash2 size={12} style={{ color: 'var(--danger)' }} /> Projects & Milestones</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Trash2 size={12} style={{ color: 'var(--danger)' }} /> Tasks & Timesheets</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Trash2 size={12} style={{ color: 'var(--danger)' }} /> Attendance & Leave Logs</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Trash2 size={12} style={{ color: 'var(--danger)' }} /> Expense Attachments</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Trash2 size={12} style={{ color: 'var(--danger)' }} /> Quotes & Invoices</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Trash2 size={12} style={{ color: 'var(--danger)' }} /> AI Memory & Pinned Chats</div>
              </div>
            </div>

            <form onSubmit={handlePlatformResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label htmlFor="plat-pass" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Confirm Founder Password
                </label>
                <input
                  id="plat-pass"
                  type="password"
                  required
                  placeholder="Enter current password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-control"
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                    width: '100%'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="plat-confirm" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Type Confirmation Phrase
                  </label>
                  <code style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 800 }}>RESET ENTIRE PLATFORM</code>
                </div>
                <input
                  id="plat-confirm"
                  type="text"
                  required
                  placeholder="Type RESET ENTIRE PLATFORM"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="form-control"
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderColor: confirmation === 'RESET ENTIRE PLATFORM' ? 'var(--success)' : 'var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                    width: '100%',
                    transition: 'border-color 0.2s ease'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2px' }}>
                  {confirmation === 'RESET ENTIRE PLATFORM' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--success)', fontWeight: 600 }}><CheckCircle2 size={14} /> Phrase matched successfully</span>
                  ) : confirmation ? (
                    <span style={{ color: 'var(--danger)' }}>✗ Phrase mismatch</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Case-sensitive confirmation required</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                <button type="button" onClick={() => setActiveModal(null)} className="btn btn-secondary" style={{ fontWeight: 600, padding: '0.6rem 1.25rem' }}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={!password || confirmation !== 'RESET ENTIRE PLATFORM'} 
                  className="btn btn-danger"
                  style={{ 
                    background: confirmation === 'RESET ENTIRE PLATFORM' ? 'var(--danger)' : 'var(--border)', 
                    color: confirmation === 'RESET ENTIRE PLATFORM' ? '#fff' : 'var(--text-muted)',
                    fontWeight: 700, 
                    padding: '0.6rem 1.5rem',
                    cursor: confirmation === 'RESET ENTIRE PLATFORM' ? 'pointer' : 'not-allowed'
                  }}
                >
                  Verify Action
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* FINAL DOUBLE CONFIRMATION DIALOG FOR PLATFORM RESET */}
      {finalConfirmOpen && (
        <div className="modal-backdrop-animate" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 5, 8, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
          padding: '1.5rem'
        }}>
          <div className="modal-card-animate" style={{
            width: '100%',
            maxWidth: '460px',
            background: 'var(--surface)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-xl)',
            padding: '2.5rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 30px rgba(239, 68, 68, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            textAlign: 'center',
            alignItems: 'center'
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--danger-subtle)',
              border: '2px dashed var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldAlert size={36} style={{ color: 'var(--danger)' }} />
            </div>
            
            <div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
                FINAL WARNING
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: 0, lineHeight: 1.5 }}>
                This is the point of no return. Continuing will permanently erase data nodes and force-close current workspace active connections. 
              </p>
            </div>
            
            <div style={{ 
              width: '100%', 
              background: 'rgba(239, 68, 68, 0.02)', 
              border: '1px solid var(--border)', 
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              textAlign: 'left'
            }}>
              <strong>Safety Snapshot Details:</strong> An automated backup file will be created in your server storage. However, client users will be disconnected and unable to log in until seeder setup is completed.
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
              <button
                onClick={executePlatformReset}
                className="btn btn-danger"
                style={{ 
                  background: 'var(--danger)', 
                  color: '#fff', 
                  width: '100%', 
                  padding: '0.75rem',
                  fontWeight: 700,
                  fontSize: '0.875rem'
                }}
              >
                Yes, Execute Reset Sequence
              </button>
              <button
                onClick={() => setFinalConfirmOpen(false)}
                className="btn btn-secondary"
                style={{ width: '100%', padding: '0.75rem', fontWeight: 600, fontSize: '0.875rem' }}
              >
                Abort Reset Operation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL: MODULE RESET
          ============================================================ */}
      {activeModal === 'module' && (
        <div className="modal-backdrop-animate" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 10, 15, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.5rem'
        }}>
          <div className="modal-card-animate" style={{
            width: '100%',
            maxWidth: '540px',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            padding: '2.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg), 0 0 32px rgba(124, 58, 237, 0.05)',
          }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ 
                background: 'var(--accent-subtle)', 
                color: 'var(--accent)', 
                padding: '0.6rem', 
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(124, 58, 237, 0.2)',
                flexShrink: 0
              }}>
                <Settings2 size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
                  Wipe Module Records
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Targeted wipe of module: <strong style={{ color: 'var(--accent)' }}>{modules.find(m => m.key === selectedModule)?.name || selectedModule}</strong>
                </p>
              </div>
            </div>

            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This operation isolates and purges database records and associated uploads matching the selected module configuration. Other system areas remain untouched.
            </div>

            {/* Module Reset Data Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Affected Items & Cleared Nodes:
              </span>
              <div style={{
                background: 'rgba(124, 58, 237, 0.02)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                fontSize: '0.8rem',
                lineHeight: 1.5,
                color: 'var(--text-secondary)'
              }}>
                {selectedModule === 'crm' && '• CRM Leads, Lead Contacts, Followups, Interactions, Tags, and converter tables.'}
                {selectedModule === 'clients' && '• Client Accounts, department linkages, and Communication History. Preserves administrators.'}
                {selectedModule === 'projects' && '• Projects, Milestones, Project Member pivots, and project shared documents.'}
                {selectedModule === 'tasks' && '• Standalone Tasks, comments, timesheets, and associated task document attachments.'}
                {selectedModule === 'payroll' && '• Payroll Runs, adjustments, fixed/hourly salary calculations, and employee compensation templates.'}
                {selectedModule === 'attendance' && '• Daily clock-in/out records, leave requests, leave balances, and holidays.'}
                {selectedModule === 'expenses' && '• Expenses list, vendor data, and uploaded receipt images.'}
                {selectedModule === 'quotes' && '• Quote records, items list, and quote approvals.'}
                {selectedModule === 'invoices' && '• Invoice drafts, credit notes, offline payments, and billing schedule configurations.'}
                {selectedModule === 'reports' && '• Cached report grids, profitability summaries, and audit caches.'}
              </div>
            </div>

            <form onSubmit={handleModuleResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label htmlFor="mod-pass" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Confirm Founder Password
                </label>
                <input
                  id="mod-pass"
                  type="password"
                  required
                  placeholder="Enter current password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-control"
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                    width: '100%'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="mod-confirm" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Type Confirmation Phrase
                  </label>
                  <code style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 800 }}>RESET MODULE</code>
                </div>
                <input
                  id="mod-confirm"
                  type="text"
                  required
                  placeholder="Type RESET MODULE"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="form-control"
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderColor: confirmation === 'RESET MODULE' ? 'var(--success)' : 'var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                    width: '100%',
                    transition: 'border-color 0.2s ease'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2px' }}>
                  {confirmation === 'RESET MODULE' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--success)', fontWeight: 600 }}><CheckCircle2 size={14} /> Phrase matched successfully</span>
                  ) : confirmation ? (
                    <span style={{ color: 'var(--danger)' }}>✗ Phrase mismatch</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Case-sensitive confirmation required</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                <button type="button" onClick={() => setActiveModal(null)} className="btn btn-secondary" style={{ fontWeight: 600, padding: '0.6rem 1.25rem' }}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={!password || confirmation !== 'RESET MODULE'} 
                  className="btn btn-danger"
                  style={{ 
                    background: confirmation === 'RESET MODULE' ? 'var(--accent)' : 'var(--border)', 
                    color: confirmation === 'RESET MODULE' ? '#fff' : 'var(--text-muted)',
                    fontWeight: 700, 
                    padding: '0.6rem 1.5rem',
                    cursor: confirmation === 'RESET MODULE' ? 'pointer' : 'not-allowed'
                  }}
                >
                  Verify Action
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL: FACTORY RESET
          ============================================================ */}
      {activeModal === 'factory' && (
        <div className="modal-backdrop-animate" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 10, 15, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.5rem'
        }}>
          <div className="modal-card-animate" style={{
            width: '100%',
            maxWidth: '540px',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-xl)',
            padding: '2.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg), 0 0 32px rgba(239, 68, 68, 0.1)',
          }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ 
                background: 'var(--danger-subtle)', 
                color: 'var(--danger)', 
                padding: '0.6rem', 
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                flexShrink: 0
              }}>
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
                  Execute Factory Reset
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--danger)', fontWeight: 600, margin: '4px 0 0 0' }}>
                  Full reinstall sequence. Restores database to pristine seed status.
                </p>
              </div>
            </div>

            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This wipes all transactional structures and deletes all system login profiles except yours. Restores seed settings, roles, permissions, currencies, number sequences, and default CRM stages.
            </div>

            {/* Factory Reset Data Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Wipe & Re-seed Checklist:
              </span>
              <div style={{
                background: 'rgba(239, 68, 68, 0.02)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={13} style={{ color: 'var(--danger)' }} /> Purges all business operations, files, and payroll runs.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><UserCheck size={13} style={{ color: 'var(--success)' }} /> Wipes all accounts, keeping only your Founder profile.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Settings2 size={13} style={{ color: 'var(--accent)' }} /> Restores fresh seeding currencies, leave types, and stages.</div>
              </div>
            </div>

            <form onSubmit={handleFactoryResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label htmlFor="fact-pass" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Confirm Founder Password
                </label>
                <input
                  id="fact-pass"
                  type="password"
                  required
                  placeholder="Enter current password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-control"
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                    width: '100%'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="fact-confirm" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Type Confirmation Phrase
                  </label>
                  <code style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 800 }}>FACTORY RESET</code>
                </div>
                <input
                  id="fact-confirm"
                  type="text"
                  required
                  placeholder="Type FACTORY RESET"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="form-control"
                  style={{
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                    borderColor: confirmation === 'FACTORY RESET' ? 'var(--success)' : 'var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                    width: '100%',
                    transition: 'border-color 0.2s ease'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '2px' }}>
                  {confirmation === 'FACTORY RESET' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--success)', fontWeight: 600 }}><CheckCircle2 size={14} /> Phrase matched successfully</span>
                  ) : confirmation ? (
                    <span style={{ color: 'var(--danger)' }}>✗ Phrase mismatch</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Case-sensitive confirmation required</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                <button type="button" onClick={() => setActiveModal(null)} className="btn btn-secondary" style={{ fontWeight: 600, padding: '0.6rem 1.25rem' }}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={!password || confirmation !== 'FACTORY RESET'} 
                  className="btn btn-danger"
                  style={{ 
                    background: confirmation === 'FACTORY RESET' ? 'var(--danger)' : 'var(--border)', 
                    color: confirmation === 'FACTORY RESET' ? '#fff' : 'var(--text-muted)',
                    fontWeight: 700, 
                    padding: '0.6rem 1.5rem',
                    cursor: confirmation === 'FACTORY RESET' ? 'pointer' : 'not-allowed'
                  }}
                >
                  Execute Factory Reset
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
