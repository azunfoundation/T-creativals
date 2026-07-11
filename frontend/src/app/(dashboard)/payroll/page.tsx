'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { useModal } from '@/providers/ModalProvider';
import { useToast } from '@/hooks/useToast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote, Calendar, CheckCircle, Clock, XCircle, X,
  Plus, Users, Award, ShieldAlert, FileText, TrendingUp, Download, AlertCircle, Settings, ExternalLink
} from 'lucide-react';
import {
  payroll as payrollApi,
  users as usersApi,
  employeeCompensationApi,
  compensationTypesApi,
  bonusApi,
  platformSettings,
  getApiErrorMessage,
  PayrollRun,
  PayrollRunItem,
  ProjectCostAllocation,
  EmployeeCompensation,
  CompensationType,
  Bonus,
  User
} from '@/lib/api';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const BONUS_TYPES: Array<{ value: Bonus['type']; label: string }> = [
  { value: 'performance', label: 'Performance' },
  { value: 'festival', label: 'Festival' },
  { value: 'referral', label: 'Referral' },
];

const PAYROLL_HOWTO = {
  overview: 'Payroll compiles a monthly run from each employee\'s salary setup, approved timesheet hours, and any approved bonuses — then routes it for final sign-off before payslips go out.',
  sections: [
    {
      heading: 'Before you can run payroll',
      items: [
        'Every employee needs a compensation record under "Salary Setup" — fixed, hourly, or hybrid — or their payroll line will be ₹0.',
        'Hourly and hybrid pay is calculated from that employee\'s approved timesheet hours for the month, so timesheets must be approved first.',
        'Bonuses must be created and approved under "Bonuses" before generating a run — a run only picks up bonuses already marked approved for that month.',
      ],
    },
    {
      heading: 'Generating and approving a run',
      items: [
        '"Generate Payroll Run" computes base salary, bonuses, and TDS/PF/ESI deductions for every active employee for the chosen month.',
        'A run starts as Draft. Final approval is deliberately restricted to a single sign-off role, separate from whoever prepares the run.',
        'Once approved, payslip PDFs are emailed automatically to employees who opted in under notification preferences.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Generating a run before setting up a new hire\'s compensation — their line will show zero pay.',
        'Forgetting to approve a bonus before running payroll — pending bonuses are silently excluded from that month\'s run.',
      ],
    },
  ],
};

export default function PayrollDashboard() {
  const { confirm } = useModal();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const canManagePayroll = !!user?.permissions?.includes('payroll.manage');
  const canApprovePayroll = !!user?.permissions?.includes('payroll.approve');

  const [mainView, setMainView] = useState<'runs' | 'salary' | 'bonuses'>('runs');

  // Active view states
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'cost_allocation'>('details');

  // Modal states
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === 'true') {
        setShowGenerateModal(true);
        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      }
    }
  }, []);

  const now = new Date();
  const [formYear, setFormYear] = useState(now.getFullYear());
  const [formMonth, setFormMonth] = useState(now.getMonth() + 1);
  const [formNotes, setFormNotes] = useState('');

  // ============================================================
  // Payroll Runs Queries
  // ============================================================

  const { data: runs = [], isLoading: isLoadingRuns, isError: isRunsError } = useQuery<PayrollRun[]>({
    queryKey: ['payroll-runs'],
    queryFn: async () => {
      const res = await payrollApi.listRuns();
      return res.data.data;
    }
  });

  const selectedRun = useMemo(() => {
    return runs.find(r => r.id === selectedRunId) || null;
  }, [runs, selectedRunId]);

  const { data: runDetails = [], isError: isRunDetailsError } = useQuery<PayrollRunItem[]>({
    queryKey: ['payroll-run-details', selectedRunId],
    enabled: !!selectedRunId,
    queryFn: async () => {
      const res = await payrollApi.getRunDetails(selectedRunId!);
      return res.data.items || [];
    }
  });

  const { data: costAllocations = [], isError: isCostAllocationError } = useQuery<ProjectCostAllocation[]>({
    queryKey: ['payroll-run-cost-allocation', selectedRun?.year, selectedRun?.month],
    enabled: !!selectedRun && activeTab === 'cost_allocation',
    queryFn: async () => {
      const res = await payrollApi.costAllocation({ year: selectedRun!.year, month: selectedRun!.month });
      return res.data;
    }
  });

  const costAllocationTotal = useMemo(
    () => costAllocations.reduce((sum, a) => sum + Number(a.total_labor_cost || 0), 0),
    [costAllocations]
  );

  // ============================================================
  // Salary Setup Queries
  // ============================================================

  const { data: compensations = [], isLoading: isLoadingCompensations, isError: isCompensationsError } = useQuery<EmployeeCompensation[]>({
    queryKey: ['employee-compensations'],
    enabled: mainView === 'salary',
    queryFn: async () => {
      const res = await employeeCompensationApi.list();
      return res.data.data;
    }
  });

  const { data: compensationTypes = [] } = useQuery<CompensationType[]>({
    queryKey: ['compensation-types'],
    enabled: mainView === 'salary' || showCompensationModal,
    queryFn: async () => {
      const res = await compensationTypesApi.list();
      return res.data.data;
    }
  });

  const { data: currencies = [] } = useQuery<Array<{ id: number; code: string; is_active: boolean }>>({
    queryKey: ['payroll-currencies'],
    enabled: mainView === 'salary' || mainView === 'bonuses' || showCompensationModal || showBonusModal,
    queryFn: async () => {
      const res = await platformSettings.get();
      return ((res.data as any)?.currencies || []).filter((c: any) => c.is_active);
    }
  });

  // ============================================================
  // Bonuses Queries
  // ============================================================

  const { data: bonuses = [], isLoading: isLoadingBonuses, isError: isBonusesError } = useQuery<Bonus[]>({
    queryKey: ['bonuses'],
    enabled: mainView === 'bonuses',
    queryFn: async () => {
      const res = await bonusApi.list({ per_page: 100 });
      return res.data.data.data;
    }
  });

  // Shared employee picker (Salary Setup + Bonuses) — excludes client-portal accounts.
  const { data: employees = [] } = useQuery<User[]>({
    queryKey: ['payroll-employees'],
    enabled: mainView === 'salary' || mainView === 'bonuses',
    queryFn: async () => {
      const res = await usersApi.list({ per_page: 200, status: 'active' });
      return res.data.data.filter(u => !u.roles.some(r => (typeof r === 'string' ? r : r?.name) === 'client'));
    }
  });

  const { data: activeHeadcount = 0 } = useQuery<number>({
    queryKey: ['payroll-active-headcount'],
    queryFn: async () => {
      const res = await usersApi.list({ per_page: 1, status: 'active' });
      const payload = res.data as any;
      return payload?.meta?.total ?? (Array.isArray(payload?.data) ? payload.data.length : 0);
    },
  });

  // ============================================================
  // Mutations
  // ============================================================

  const generateRunMutation = useMutation({
    mutationFn: (data: { year: number; month: number; notes?: string }) => payrollApi.generateRun(data),
    onSuccess: (newRun) => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
      setShowGenerateModal(false);
      if (newRun && newRun.data && newRun.data.id) {
        setSelectedRunId(newRun.data.id);
      }
    },
    onError: (err: unknown) => {
      // Payroll is money — a failed run generation must NEVER look successful.
      showToast(getApiErrorMessage(err, 'Failed to generate payroll run.'), 'error');
    }
  });

  const approveRunMutation = useMutation({
    mutationFn: (id: number) => payrollApi.approveRun(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
    },
    onError: (err: unknown) => {
      // Never fake an approval/payment locally when the API rejected it.
      showToast(getApiErrorMessage(err, 'Failed to approve payroll run.'), 'error');
    }
  });

  const createCompensationMutation = useMutation({
    mutationFn: employeeCompensationApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-compensations'] });
      setShowCompensationModal(false);
      showToast('Compensation saved.', 'success');
    },
    onError: (err: unknown) => showToast(getApiErrorMessage(err, 'Failed to save compensation.'), 'error'),
  });

  // In-place correction — fixes a data-entry mistake on the CURRENT record
  // without opening a new versioned entry (the endpoint has existed since
  // the Payroll audit; this is its first UI).
  const correctCompensationMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      employeeCompensationApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-compensations'] });
      setShowCompensationModal(false);
      showToast('Entry corrected — no new salary version was created.', 'success');
    },
    onError: (err: unknown) => showToast(getApiErrorMessage(err, 'Failed to correct the entry.'), 'error'),
  });

  const createBonusMutation = useMutation({
    mutationFn: bonusApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonuses'] });
      setShowBonusModal(false);
      showToast('Bonus created — pending approval.', 'success');
    },
    onError: (err: unknown) => showToast(getApiErrorMessage(err, 'Failed to create bonus.'), 'error'),
  });

  const approveBonusMutation = useMutation({
    mutationFn: (id: number) => bonusApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonuses'] });
      showToast('Bonus approved.', 'success');
    },
    onError: (err: unknown) => showToast(getApiErrorMessage(err, 'Failed to approve bonus.'), 'error'),
  });

  const rejectBonusMutation = useMutation({
    mutationFn: (id: number) => bonusApi.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonuses'] });
      showToast('Bonus rejected.', 'success');
    },
    onError: (err: unknown) => showToast(getApiErrorMessage(err, 'Failed to reject bonus.'), 'error'),
  });

  // ============================================================
  // KPI Calculations
  // ============================================================

  const metrics = useMemo(() => {
    let disbursed = 0;
    let pending = 0;

    runs.forEach(r => {
      if (r.status === 'approved' || r.status === 'processed' || r.status === 'paid') {
        disbursed += r.total_net;
      } else {
        pending += r.total_net;
      }
    });

    return { disbursed, pending, activeCompensations: activeHeadcount };
  }, [runs, activeHeadcount]);

  const handleGenerateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    generateRunMutation.mutate({ year: formYear, month: formMonth, notes: formNotes });
  };

  const handleApprove = async () => {
    if (!selectedRunId || !selectedRun) return;
    if (await confirm({ message: `Approve payroll run ${selectedRun.run_number}? Payslips will be emailed to employees who've opted in.`, variant: 'info' })) {
      approveRunMutation.mutate(selectedRunId);
    }
  };

  // ============================================================
  // Compensation form state
  // ============================================================

  const [compForm, setCompForm] = useState({
    user_id: '', compensation_type_id: '', base_amount: '', currency_id: '',
    expected_monthly_hours: '', hourly_rate: '', tds_percent: '', pf_percent: '', esi_percent: '',
    effective_from: new Date().toISOString().slice(0, 10),
  });

  // When opened from an existing row the modal offers two save modes:
  // a new versioned record (pay change) or an in-place correction (typo fix).
  const [compEditTarget, setCompEditTarget] = useState<EmployeeCompensation | null>(null);
  const [compMode, setCompMode] = useState<'new' | 'correct'>('new');

  const openCompensationModal = (existing?: EmployeeCompensation) => {
    setCompEditTarget(existing ?? null);
    setCompMode('new');
    setCompForm({
      user_id: existing ? String(existing.user_id) : '',
      compensation_type_id: existing ? String(existing.compensation_type_id) : '',
      base_amount: existing ? String(existing.base_amount) : '',
      currency_id: existing ? String(existing.currency_id) : (currencies[0] ? String(currencies[0].id) : ''),
      expected_monthly_hours: existing ? String(existing.expected_monthly_hours ?? '') : '',
      hourly_rate: existing ? String(existing.hourly_rate ?? '') : '',
      tds_percent: existing ? String(existing.tds_percent ?? '') : '',
      pf_percent: existing ? String(existing.pf_percent ?? '') : '',
      esi_percent: existing ? String(existing.esi_percent ?? '') : '',
      effective_from: new Date().toISOString().slice(0, 10),
    });
    setShowCompensationModal(true);
  };

  const handleCompensationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!compForm.user_id || !compForm.compensation_type_id || !compForm.currency_id) {
      showToast('Employee, compensation type, and currency are required.', 'error');
      return;
    }
    if (compMode === 'correct' && compEditTarget) {
      correctCompensationMutation.mutate({
        id: compEditTarget.id,
        data: {
          compensation_type_id: Number(compForm.compensation_type_id),
          base_amount: Number(compForm.base_amount || 0),
          currency_id: Number(compForm.currency_id),
          expected_monthly_hours: compForm.expected_monthly_hours ? Number(compForm.expected_monthly_hours) : undefined,
          hourly_rate: compForm.hourly_rate ? Number(compForm.hourly_rate) : undefined,
          tds_percent: compForm.tds_percent ? Number(compForm.tds_percent) : undefined,
          pf_percent: compForm.pf_percent ? Number(compForm.pf_percent) : undefined,
          esi_percent: compForm.esi_percent ? Number(compForm.esi_percent) : undefined,
        },
      });
      return;
    }
    createCompensationMutation.mutate({
      user_id: Number(compForm.user_id),
      compensation_type_id: Number(compForm.compensation_type_id),
      base_amount: Number(compForm.base_amount || 0),
      currency_id: Number(compForm.currency_id),
      expected_monthly_hours: compForm.expected_monthly_hours ? Number(compForm.expected_monthly_hours) : undefined,
      hourly_rate: compForm.hourly_rate ? Number(compForm.hourly_rate) : undefined,
      tds_percent: compForm.tds_percent ? Number(compForm.tds_percent) : undefined,
      pf_percent: compForm.pf_percent ? Number(compForm.pf_percent) : undefined,
      esi_percent: compForm.esi_percent ? Number(compForm.esi_percent) : undefined,
      effective_from: compForm.effective_from,
    });
  };

  // ============================================================
  // Bonus form state
  // ============================================================

  const [bonusForm, setBonusForm] = useState({
    user_id: '', amount: '', type: 'performance' as Bonus['type'], reason: '',
    effective_date: new Date().toISOString().slice(0, 10),
  });

  const handleBonusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonusForm.user_id || !bonusForm.amount) {
      showToast('Employee and amount are required.', 'error');
      return;
    }
    createBonusMutation.mutate({
      user_id: Number(bonusForm.user_id),
      amount: Number(bonusForm.amount),
      type: bonusForm.type,
      reason: bonusForm.reason || undefined,
      effective_date: bonusForm.effective_date,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem' }}>

      {/* ── Top Header ── */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Payroll Management</h1>
            <HelpIcon title="Payroll Management" content={{
              what: 'Generates monthly payroll runs from each employee\'s salary setup, approved timesheet hours, and approved bonuses, then routes the run for a single, separate sign-off.',
              why: 'Preparing and approving payroll are kept separate so no one person can both build and sign off on their own numbers.',
            }} />
          </div>
          <p className="text-secondary text-sm">
            Generate monthly runs, track resource allocations, verify base & bonus details, and process payouts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <HowToUseGuide moduleKey="payroll" title="How Payroll Works" content={PAYROLL_HOWTO} />
          {mainView === 'runs' && canManagePayroll && (
            <button onClick={() => setShowGenerateModal(true)} className="btn btn-primary">
              <Plus size={16} /> Generate Payroll Run
            </button>
          )}
          {mainView === 'salary' && canManagePayroll && (
            <button onClick={() => openCompensationModal()} className="btn btn-primary">
              <Plus size={16} /> Set Compensation
            </button>
          )}
          {mainView === 'bonuses' && canManagePayroll && (
            <button onClick={() => setShowBonusModal(true)} className="btn btn-primary">
              <Plus size={16} /> Add Bonus
            </button>
          )}
        </div>
      </div>

      {/* ── View Switcher ── */}
      <div className="border-b" style={{ display: 'flex', gap: '1.5rem' }}>
        {([
          ['runs', 'Payroll Runs', Banknote],
          ['salary', 'Salary Setup', Settings],
          ['bonuses', 'Bonuses', Award],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setMainView(key)}
            style={{
              padding: '0.5rem 0',
              borderBottom: mainView === key ? '2px solid var(--accent)' : '2px solid transparent',
              color: mainView === key ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: mainView === key ? 600 : 500,
              fontSize: '0.875rem',
              display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Metrics Grid (Runs view only) ── */}
      {mainView === 'runs' && (
        <div className="kpi-grid kpi-grid-3">
          <div className="kpi-card">
            <div className="flex justify-between items-start">
              <span className="kpi-label">Total Approved (YTD)</span>
              <div style={{ background: 'var(--success-subtle)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
                <CheckCircle size={16} className="text-success" />
              </div>
            </div>
            <span className="kpi-value">{formatCurrency(metrics.disbursed)}</span>
            <div className="flex items-center gap-1 text-xs text-success font-medium">
              <TrendingUp size={12} />
              <span>Signed off</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="flex justify-between items-start">
              <span className="kpi-label">Pending Approval</span>
              <div style={{ background: 'var(--warning-subtle)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
                <Clock size={16} className="text-warning" />
              </div>
            </div>
            <span className="kpi-value">{formatCurrency(metrics.pending)}</span>
            <div className="text-xs text-secondary">Draft runs awaiting sign-off</div>
          </div>

          <div className="kpi-card">
            <div className="flex justify-between items-start">
              <span className="kpi-label">Active Compensations</span>
              <div style={{ background: 'var(--accent-subtle)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
                <Users size={16} className="text-accent" />
              </div>
            </div>
            <span className="kpi-value">{metrics.activeCompensations}</span>
            <div className="text-xs text-secondary">Employees with active contracts</div>
          </div>
        </div>
      )}

      {/* ── RUNS VIEW ── */}
      {mainView === 'runs' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', flex: 1, minHeight: 0 }}>

          {/* Left Side: Runs List */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflowY: 'auto' }}>
            <div className="border-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.5rem' }}>
              <h3 className="font-semibold text-sm">Payroll Run Registry</h3>
              <span className="badge badge-muted">{runs.length} Runs</span>
            </div>

            {isRunsError && (
              <div className="flex items-center gap-2 text-danger text-xs" style={{ padding: '0.5rem' }}>
                <AlertCircle size={14} /> Couldn't load payroll runs. Try refreshing.
              </div>
            )}

            <div className="flex flex-col gap-2">
              {isLoadingRuns ? (
                <SkeletonTable rows={5} cols={1} />
              ) : runs.length === 0 ? (
                <EmptyState
                  title="No payroll runs yet"
                  description={canManagePayroll ? 'Generate the first monthly payroll run once employee compensation is set up.' : 'No payroll runs have been generated yet.'}
                  action={canManagePayroll && (
                    <button onClick={() => setShowGenerateModal(true)} className="btn btn-primary btn-sm">
                      <Plus size={14} /> Generate Payroll Run
                    </button>
                  )}
                />
              ) : runs.map(run => {
                const isSelected = run.id === selectedRunId;
                const statusBadge = run.status === 'draft' ? 'badge-warning' : 'badge-success';

                return (
                  <div
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    style={{
                      padding: '0.875rem',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--accent-subtle)' : 'var(--surface-elevated)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    className="hover:border-accent"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-xs" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {run.run_number}
                      </span>
                      <span className={`badge ${statusBadge}`} style={{ fontSize: '0.55rem', padding: '1px 5px' }}>
                        {run.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-secondary text-xs">
                        {MONTH_NAMES[run.month - 1]} {run.year}
                      </span>
                      <span className="font-semibold text-xs">
                        {formatCurrency(run.total_net)}
                      </span>
                    </div>

                    <Link
                      href={`/payroll/${run.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-accent"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem' }}
                    >
                      <ExternalLink size={11} /> View Full Details
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Side: Run Detail & Cost Allocations */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', minHeight: 0, overflow: 'hidden' }}>
            {selectedRun ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

                {/* Detail Header */}
                <div className="border-b" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem', flexShrink: 0 }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold">{selectedRun.run_number}</h2>
                      <span className={`badge ${selectedRun.status === 'draft' ? 'badge-warning' : 'badge-success'}`}>
                        {selectedRun.status}
                      </span>
                    </div>
                    <p className="text-secondary text-xs mt-1">
                      Created for {MONTH_NAMES[selectedRun.month - 1]} {selectedRun.year} • {selectedRun.notes || 'No description notes'}
                    </p>
                  </div>

                  {/* Approve action / status line */}
                  {selectedRun.status === 'draft' ? (
                    canApprovePayroll ? (
                      <button
                        onClick={handleApprove}
                        disabled={approveRunMutation.isPending}
                        className="btn btn-primary btn-sm"
                        style={{ height: '36px' }}
                      >
                        <CheckCircle size={14} /> Approve Run
                      </button>
                    ) : (
                      <span className="text-xs text-secondary flex items-center gap-1">
                        <Clock size={12} /> Awaiting sign-off
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-secondary flex items-center gap-1">
                      <CheckCircle size={12} className="text-success" />
                      Approved{selectedRun.approver?.name ? ` by ${selectedRun.approver.name}` : ''}
                      {selectedRun.approved_at ? ` on ${formatDate(selectedRun.approved_at)}` : ''}
                    </span>
                  )}

                  <button
                    onClick={async () => {
                      try {
                        const res = await payrollApi.exportRun(selectedRun.id, 'csv');
                        const url = window.URL.createObjectURL(new Blob([res.data as any]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', `payroll-run-${selectedRun.id}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                      } catch {
                        showToast('Failed to export CSV', 'error');
                      }
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Download size={14} /> Export (CSV)
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await payrollApi.exportRun(selectedRun.id, 'pdf');
                        const url = window.URL.createObjectURL(new Blob([res.data as any]));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', `payroll-run-${selectedRun.id}.pdf`);
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                      } catch {
                        showToast('Failed to export PDF', 'error');
                      }
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <FileText size={14} /> Export (PDF)
                  </button>
                </div>

                {/* Tab Selector */}
                <div className="border-b" style={{ display: 'flex', marginBottom: '1rem', flexShrink: 0, gap: '1rem' }}>
                  <button
                    onClick={() => setActiveTab('details')}
                    style={{
                      padding: '0.5rem 0',
                      borderBottom: activeTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeTab === 'details' ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: activeTab === 'details' ? 600 : 500,
                      fontSize: '0.875rem'
                    }}
                  >
                    Employee Slips ({runDetails.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('cost_allocation')}
                    style={{
                      padding: '0.5rem 0',
                      borderBottom: activeTab === 'cost_allocation' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeTab === 'cost_allocation' ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: activeTab === 'cost_allocation' ? 600 : 500,
                      fontSize: '0.875rem'
                    }}
                  >
                    Project Cost Allocations
                  </button>
                </div>

                {/* Tab Body */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  {activeTab === 'details' ? (
                    isRunDetailsError ? (
                      <div className="flex items-center gap-2 text-danger text-xs"><AlertCircle size={14} /> Couldn't load this run's employee slips.</div>
                    ) : (
                    <div className="data-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Employee</th>
                            <th>ID</th>
                            <th style={{ textAlign: 'center' }}>Hours Logged</th>
                            <th style={{ textAlign: 'center' }}>Utilization</th>
                            <th style={{ textAlign: 'right' }}>Base Salary</th>
                            <th style={{ textAlign: 'right' }}>Bonus</th>
                            <th style={{ textAlign: 'right' }}>Deductions</th>
                            <th style={{ textAlign: 'right' }}>Net Pay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runDetails.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <div className="flex items-center gap-2">
                                  <div className="avatar avatar-sm">
                                    {getInitials(item.user?.name || '')}
                                  </div>
                                  <span className="font-semibold text-xs">{item.user?.name}</span>
                                </div>
                              </td>
                              <td className="text-secondary text-xs">{item.user?.employee_id || '—'}</td>
                              <td style={{ textAlign: 'center' }} className="font-bold text-xs">
                                {item.hours_logged}h <span className="text-secondary font-normal">/ {item.expected_hours}h</span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`badge ${
                                  item.utilization_rate >= 100 ? 'badge-success' :
                                  item.utilization_rate >= 85 ? 'badge-info' : 'badge-warning'
                                }`} style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                                  {item.utilization_rate}%
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }} className="text-xs font-semibold">{formatCurrency(item.base_salary)}</td>
                              <td style={{ textAlign: 'right' }} className="text-success text-xs font-semibold">
                                {item.bonus_amount > 0 ? `+${formatCurrency(item.bonus_amount)}` : '—'}
                                {item.bonus_amount > 0 && item.breakdown?.bonuses && item.breakdown.bonuses.length > 0 && (
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 'normal' }}>
                                    {item.breakdown.bonuses.map((b, i) => (
                                      <span key={i} style={{ display: 'block' }}>{b.type}{b.reason ? `: ${b.reason}` : ''}</span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }} className="text-danger text-xs font-semibold">
                                {item.deductions > 0 ? `-${formatCurrency(item.deductions)}` : '—'}
                                {item.deductions > 0 && item.breakdown?.deductions && item.breakdown.deductions.length > 0 && (
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 'normal' }}>
                                    {item.breakdown.deductions.map((d, i) => (
                                      <span key={i} style={{ display: 'block' }}>{d.description}: {formatCurrency(d.amount)}</span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }} className="font-bold text-xs">{formatCurrency(item.net_salary)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )
                  ) : (
                    <div className="flex flex-col gap-4">
                      <p className="text-secondary text-xs">
                        Project labor cost for {MONTH_NAMES[selectedRun.month - 1]} {selectedRun.year}, based on that month's approved timesheet hours.
                      </p>

                      {isCostAllocationError ? (
                        <div className="flex items-center gap-2 text-danger text-xs"><AlertCircle size={14} /> Couldn't load cost allocation data.</div>
                      ) : costAllocations.length === 0 ? (
                        <EmptyState title="No project-linked hours" description="No approved, project-linked timesheets were found for this run's period." />
                      ) : (
                        <div className="data-table-wrap">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Project Scope</th>
                                <th style={{ textAlign: 'center' }}>Logged Hours</th>
                                <th style={{ textAlign: 'center' }}>Allocation %</th>
                                <th style={{ textAlign: 'right' }}>Labor Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {costAllocations.map((alloc, idx) => {
                                const pct = costAllocationTotal > 0 ? (Number(alloc.total_labor_cost) / costAllocationTotal) * 100 : 0;
                                return (
                                  <tr key={idx}>
                                    <td className="font-semibold text-xs">{alloc.project_name}</td>
                                    <td style={{ textAlign: 'center' }} className="text-xs font-bold">{alloc.total_hours}h</td>
                                    <td style={{ textAlign: 'center' }}>
                                      <div className="flex items-center justify-center gap-2">
                                        <div style={{ width: '60px', background: 'var(--border)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                          <div style={{ width: `${pct}%`, background: 'var(--accent)', height: '100%' }} />
                                        </div>
                                        <span className="text-xs font-semibold">{pct.toFixed(0)}%</span>
                                      </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }} className="font-bold text-xs">{formatCurrency(alloc.total_labor_cost)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Total Payout Summary bar */}
                <div className="border-t" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', marginTop: '1rem', flexShrink: 0, flexWrap: 'wrap', gap: '1rem' }}>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-secondary text-xs">Gross Salaries</span>
                      <p className="font-semibold text-sm">{formatCurrency(selectedRun.total_gross)}</p>
                    </div>
                    <div>
                      <span className="text-secondary text-xs">Total Deductions</span>
                      <p className="font-semibold text-sm text-danger">-{formatCurrency(selectedRun.total_deductions)}</p>
                    </div>
                  </div>

                  <div style={{ background: 'var(--surface-elevated)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <span className="text-secondary text-xs">Total Net Disbursements</span>
                    <p className="font-bold text-base text-accent">{formatCurrency(selectedRun.total_net)}</p>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-secondary py-12">
                <ShieldAlert size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p className="font-medium">No payroll run selected</p>
                <p className="text-xs">Select a payroll run from the side panel to view detailed items.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SALARY SETUP VIEW ── */}
      {mainView === 'salary' && (
        <div className="card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Employee Compensation</h3>
            <HelpIcon text="Each employee needs a compensation record before their pay can be calculated. Setting a new one automatically closes out the previous record." />
          </div>

          {isCompensationsError ? (
            <div className="flex items-center gap-2 text-danger text-xs"><AlertCircle size={14} /> Couldn't load compensation records.</div>
          ) : isLoadingCompensations ? (
            <SkeletonTable rows={5} cols={6} />
          ) : compensations.length === 0 ? (
            <EmptyState
              title="No compensation records yet"
              description="Set up salary details for at least one employee before generating a payroll run."
              action={canManagePayroll && (
                <button onClick={() => openCompensationModal()} className="btn btn-primary btn-sm">
                  <Plus size={14} /> Set Compensation
                </button>
              )}
            />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Base Amount</th>
                    <th style={{ textAlign: 'right' }}>Hourly Rate</th>
                    <th style={{ textAlign: 'center' }}>TDS / PF / ESI</th>
                    <th>Effective From</th>
                    {canManagePayroll && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {compensations.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="avatar avatar-sm">{getInitials(c.user?.name || '')}</div>
                          <span className="font-semibold text-xs">{c.user?.name || `User #${c.user_id}`}</span>
                        </div>
                      </td>
                      <td className="text-xs" style={{ textTransform: 'capitalize' }}>{c.compensation_type?.type || '—'}</td>
                      <td style={{ textAlign: 'right' }} className="text-xs font-semibold">{formatCurrency(c.base_amount)}</td>
                      <td style={{ textAlign: 'right' }} className="text-xs">{c.hourly_rate ? formatCurrency(c.hourly_rate) : '—'}</td>
                      <td style={{ textAlign: 'center' }} className="text-xs text-secondary">
                        {c.tds_percent || 0}% / {c.pf_percent || 0}% / {c.esi_percent || 0}%
                      </td>
                      <td className="text-xs text-secondary">{formatDate(c.effective_from)}</td>
                      {canManagePayroll && (
                        <td style={{ textAlign: 'right' }}>
                          <button onClick={() => openCompensationModal(c)} className="btn btn-secondary btn-sm">Update</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── BONUSES VIEW ── */}
      {mainView === 'bonuses' && (
        <div className="card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Bonuses</h3>
            <HelpIcon text="A bonus must be approved here before the month's payroll run picks it up automatically." />
          </div>

          {isBonusesError ? (
            <div className="flex items-center gap-2 text-danger text-xs"><AlertCircle size={14} /> Couldn't load bonuses.</div>
          ) : isLoadingBonuses ? (
            <SkeletonTable rows={5} cols={6} />
          ) : bonuses.length === 0 ? (
            <EmptyState
              title="No bonuses yet"
              description="Create a bonus and approve it so the next payroll run for that month includes it."
              action={canManagePayroll && (
                <button onClick={() => setShowBonusModal(true)} className="btn btn-primary btn-sm">
                  <Plus size={14} /> Add Bonus
                </button>
              )}
            />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Reason</th>
                    <th>Effective Date</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    {canManagePayroll && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {bonuses.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="avatar avatar-sm">{getInitials(b.user?.name || '')}</div>
                          <span className="font-semibold text-xs">{b.user?.name || `User #${b.user_id}`}</span>
                        </div>
                      </td>
                      <td className="text-xs" style={{ textTransform: 'capitalize' }}>{b.type}</td>
                      <td style={{ textAlign: 'right' }} className="text-xs font-semibold">{formatCurrency(b.amount)}</td>
                      <td className="text-xs text-secondary">{b.reason || '—'}</td>
                      <td className="text-xs text-secondary">{formatDate(b.effective_date)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${b.status === 'approved' || b.status === 'paid' ? 'badge-success' : b.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
                          {b.status}
                        </span>
                      </td>
                      {canManagePayroll && (
                        <td style={{ textAlign: 'right' }}>
                          {b.status === 'pending' && (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={async () => {
                                  if (await confirm({ message: `Approve this ${formatCurrency(b.amount)} bonus for ${b.user?.name}?`, variant: 'info' })) {
                                    approveBonusMutation.mutate(b.id);
                                  }
                                }}
                                className="btn btn-secondary btn-sm"
                              ><CheckCircle size={12} /> Approve</button>
                              <button
                                onClick={async () => {
                                  if (await confirm({ message: `Reject this ${formatCurrency(b.amount)} bonus for ${b.user?.name}?`, variant: 'danger' })) {
                                    rejectBonusMutation.mutate(b.id);
                                  }
                                }}
                                className="btn btn-secondary btn-sm"
                              ><XCircle size={12} /> Reject</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Generate Payroll Run Modal ── */}
      {showGenerateModal && (
        <div className="overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2">
                <Calendar size={16} className="text-accent" />
                Generate Payroll Run
              </h3>
              <button onClick={() => setShowGenerateModal(false)} className="btn btn-ghost btn-icon" style={{ padding: '0.25rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleGenerateSubmit}>
              <div className="modal-body flex flex-col gap-4">
                <p className="text-secondary text-xs">
                  This compiles expected hours, approved timesheets, base pay, and approved bonuses for the selected calendar month.
                </p>

                <div className="grid grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Year</label>
                    <select
                      value={formYear}
                      onChange={e => setFormYear(parseInt(e.target.value))}
                      className="form-input text-xs"
                    >
                      {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Month</label>
                    <select
                      value={formMonth}
                      onChange={e => setFormMonth(parseInt(e.target.value))}
                      className="form-input text-xs"
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={idx} value={idx + 1}>{name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Internal Run Notes</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Regular monthly run, festival advance adjustments..."
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    className="form-input text-xs"
                    style={{ resize: 'none' }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowGenerateModal(false)} className="btn btn-secondary btn-sm">
                  Cancel
                </button>
                <button type="submit" disabled={generateRunMutation.isPending} className="btn btn-primary btn-sm">
                  {generateRunMutation.isPending ? 'Generating...' : 'Confirm Generation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Set Compensation Modal ── */}
      {showCompensationModal && (
        <div className="overlay" onClick={() => setShowCompensationModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2">
                <Settings size={16} className="text-accent" /> Set Employee Compensation
              </h3>
              <button onClick={() => setShowCompensationModal(false)} className="btn btn-ghost btn-icon" style={{ padding: '0.25rem' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCompensationSubmit}>
              <div className="modal-body flex flex-col gap-3">
                {compEditTarget && (
                  <div className="form-group" style={{ padding: '0.75rem', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      How should this change be saved?
                      <HelpIcon text="A pay change (raise, new structure) should be a NEW record so payroll history stays accurate. Use 'Correct this entry' only to fix a typo in the current record — it rewrites it in place with no history." />
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.8125rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="radio" name="comp-mode" checked={compMode === 'new'} onChange={() => setCompMode('new')} />
                        New salary record (pay change — keeps history)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="radio" name="comp-mode" checked={compMode === 'correct'} onChange={() => setCompMode('correct')} />
                        Correct this entry (fix a typo — no new version)
                      </label>
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Employee</label>
                  <select className="form-input text-xs" value={compForm.user_id} onChange={e => setCompForm({ ...compForm, user_id: e.target.value })} required disabled={compMode === 'correct'}>
                    <option value="">Select employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Compensation Type</label>
                    <select className="form-input text-xs" value={compForm.compensation_type_id} onChange={e => setCompForm({ ...compForm, compensation_type_id: e.target.value })} required>
                      <option value="">Select...</option>
                      {compensationTypes.map(t => <option key={t.id} value={t.id} style={{ textTransform: 'capitalize' }}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select className="form-input text-xs" value={compForm.currency_id} onChange={e => setCompForm({ ...compForm, currency_id: e.target.value })} required>
                      <option value="">Select...</option>
                      {currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Base Amount <HelpIcon text="Monthly fixed pay. For hourly staff, set to 0." /></label>
                    <input type="number" min="0" step="0.01" className="form-input text-xs" value={compForm.base_amount} onChange={e => setCompForm({ ...compForm, base_amount: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Hourly Rate <HelpIcon text="Leave 0 to derive it from base amount ÷ expected hours." /></label>
                    <input type="number" min="0" step="0.01" className="form-input text-xs" value={compForm.hourly_rate} onChange={e => setCompForm({ ...compForm, hourly_rate: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Expected Monthly Hours</label>
                  <input type="number" min="0" step="0.01" className="form-input text-xs" value={compForm.expected_monthly_hours} onChange={e => setCompForm({ ...compForm, expected_monthly_hours: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">TDS %</label>
                    <input type="number" min="0" max="100" step="0.01" className="form-input text-xs" value={compForm.tds_percent} onChange={e => setCompForm({ ...compForm, tds_percent: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">PF %</label>
                    <input type="number" min="0" max="100" step="0.01" className="form-input text-xs" value={compForm.pf_percent} onChange={e => setCompForm({ ...compForm, pf_percent: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ESI %</label>
                    <input type="number" min="0" max="100" step="0.01" className="form-input text-xs" value={compForm.esi_percent} onChange={e => setCompForm({ ...compForm, esi_percent: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Effective From</label>
                  <input type="date" className="form-input text-xs" value={compForm.effective_from} onChange={e => setCompForm({ ...compForm, effective_from: e.target.value })} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowCompensationModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={createCompensationMutation.isPending || correctCompensationMutation.isPending} className="btn btn-primary btn-sm">
                  {(createCompensationMutation.isPending || correctCompensationMutation.isPending)
                    ? 'Saving...'
                    : compMode === 'correct' ? 'Correct Entry' : 'Save New Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Bonus Modal ── */}
      {showBonusModal && (
        <div className="overlay" onClick={() => setShowBonusModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 className="modal-title flex items-center gap-2">
                <Award size={16} className="text-accent" /> Add Bonus
              </h3>
              <button onClick={() => setShowBonusModal(false)} className="btn btn-ghost btn-icon" style={{ padding: '0.25rem' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleBonusSubmit}>
              <div className="modal-body flex flex-col gap-3">
                <div className="form-group">
                  <label className="form-label">Employee</label>
                  <select className="form-input text-xs" value={bonusForm.user_id} onChange={e => setBonusForm({ ...bonusForm, user_id: e.target.value })} required>
                    <option value="">Select employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Amount</label>
                    <input type="number" min="0.01" step="0.01" className="form-input text-xs" value={bonusForm.amount} onChange={e => setBonusForm({ ...bonusForm, amount: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-input text-xs" value={bonusForm.type} onChange={e => setBonusForm({ ...bonusForm, type: e.target.value as Bonus['type'] })}>
                      {BONUS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Reason</label>
                  <textarea rows={2} className="form-input text-xs" style={{ resize: 'none' }} value={bonusForm.reason} onChange={e => setBonusForm({ ...bonusForm, reason: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Effective Date <HelpIcon text="Payroll picks up approved bonuses whose effective date falls in that run's month." /></label>
                  <input type="date" className="form-input text-xs" value={bonusForm.effective_date} onChange={e => setBonusForm({ ...bonusForm, effective_date: e.target.value })} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowBonusModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={createBonusMutation.isPending} className="btn btn-primary btn-sm">
                  {createBonusMutation.isPending ? 'Saving...' : 'Create Bonus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
