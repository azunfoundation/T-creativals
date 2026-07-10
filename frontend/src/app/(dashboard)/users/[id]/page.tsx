'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/useToast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { users as usersApi, employeeCompensationApi, getApiErrorMessage } from '@/lib/api';
import type { EmployeeCompensation, User } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertCircle } from 'lucide-react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

const USER_DETAIL_HOWTO = {
  overview: 'This page shows one team member\'s account in detail. The Profile tab shows their contact details, and the Compensation tab lets you set the payroll deduction percentages (TDS, PF, ESI) used when their salary is calculated.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Use the Profile tab to check the person\'s email, employee ID, and phone number.',
        'Switch to the Compensation tab to view or update their salary deductions.',
        'Enter TDS, PF, and ESI as percentages (e.g. 12 means 12%) and click "Save Compensation".',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Confirm deduction percentages with Finance or HR before changing them — they change the person\'s take-home pay.',
        'If the Compensation tab says no record exists, set one up from the Payroll module first.',
        'To edit the person\'s name, roles, or department, use the pencil icon on the User Management page.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Typing an amount instead of a percentage — these fields are percentages of salary, not rupee amounts.',
        'Editing deductions for the wrong person — double-check the name at the top of the page.',
        'Forgetting to click "Save Compensation" — changes are not saved until you do.',
      ],
    },
  ],
};

export default function UserProfilePage() {
  const { showToast } = useToast();
  const params = useParams();
  const userId = Number(params?.id);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('profile');
  const [tds, setTds] = useState<number | ''>('');
  const [pf, setPf] = useState<number | ''>('');
  const [esi, setEsi] = useState<number | ''>('');

  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const res = await usersApi.show(userId);
      // The global axios interceptor already unwraps response.data.data -> response.data
      // when there's no pagination meta, so res.data is already the flat User object
      // (the declared `{ data: User }` return type reflects the pre-interceptor shape).
      return res.data as unknown as User;
    },
    enabled: !!userId,
  });

  // Fetch this employee's compensation history so the Deductions form can be
  // prefilled from (and saved back to) the real Payroll compensation record,
  // instead of the User model, which has no tds/pf/esi columns.
  const {
    data: compensationHistory = [],
    isLoading: isCompensationLoading,
    isError: isCompensationError,
  } = useQuery({
    queryKey: ['employee-compensation', userId],
    queryFn: async () => {
      const res = await employeeCompensationApi.list({ user_id: userId });
      const payload = res.data as any;
      const list = Array.isArray(payload) ? payload : (payload?.data ?? []);
      return list as EmployeeCompensation[];
    },
    enabled: !!userId,
  });

  const currentCompensation = compensationHistory.find(c => c.is_current) || compensationHistory[0] || null;

  // Prefill the deductions form once the current compensation record loads.
  useEffect(() => {
    if (currentCompensation) {
      setTds(currentCompensation.tds_percent ?? '');
      setPf(currentCompensation.pf_percent ?? '');
      setEsi(currentCompensation.esi_percent ?? '');
    }
  }, [currentCompensation]);

  const updateMutation = useMutation({
    mutationFn: (data: { tds_percent: number; pf_percent: number; esi_percent: number }) => {
      if (!currentCompensation) {
        throw new Error('No compensation record found for this employee.');
      }
      return employeeCompensationApi.update(currentCompensation.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-compensation', userId] });
      showToast('Compensation updated successfully!', 'success');
    },
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to update compensation.'), 'error');
    }
  });

  const handleSaveCompensation = () => {
    if (!currentCompensation) {
      showToast('No compensation record exists yet for this employee. Set it up from the Payroll module first.', 'error');
      return;
    }
    updateMutation.mutate({
      tds_percent: Number(tds) || 0,
      pf_percent: Number(pf) || 0,
      esi_percent: Number(esi) || 0,
    });
  };

  if (isLoading) return <div style={{ padding: '2rem' }}>Loading...</div>;

  if (isError) {
    return (
      <div style={{ padding: '2rem' }}>
        <EmptyState
          icon={<AlertCircle size={32} />}
          title="Couldn't load this user"
          description="Something went wrong fetching this user's details. Check your connection and try again."
          action={<button className="btn btn-primary btn-sm" onClick={() => refetch()}>Retry</button>}
        />
      </div>
    );
  }

  if (!user) return <div style={{ padding: '2rem' }}>User not found</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {user.name}'s Profile
          <HelpIcon title="User Profile" content={{
            what: 'One team member\'s account details: contact info on the Profile tab, and payroll deductions (TDS, PF, ESI) on the Compensation tab.',
            why: 'The deduction percentages set here are used by Payroll when this person\'s salary is calculated.',
            when: 'Open this page to check someone\'s details or to update their salary deductions after HR/Finance confirms new figures.',
          }} />
        </h1>
        <HowToUseGuide moduleKey="user-detail" title="How This Profile Page Works" content={USER_DETAIL_HOWTO} />
      </div>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('profile')}
          style={{ padding: '0.5rem 1rem', borderBottom: activeTab === 'profile' ? '2px solid var(--accent)' : 'none', fontWeight: activeTab === 'profile' ? 600 : 400 }}
        >
          Profile
        </button>
        <button
          onClick={() => setActiveTab('compensation')}
          style={{ padding: '0.5rem 1rem', borderBottom: activeTab === 'compensation' ? '2px solid var(--accent)' : 'none', fontWeight: activeTab === 'compensation' ? 600 : 400 }}
        >
          Compensation
        </button>
      </div>

      {activeTab === 'profile' && (
        <div>
          <p>Email: {user.email}</p>
          <p>Employee ID: {user.employee_id || 'N/A'}</p>
          <p>Phone: {user.phone || 'N/A'}</p>
        </div>
      )}

      {activeTab === 'compensation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 400 }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Deductions
            <HelpIcon title="Salary Deductions" content={{
              what: 'The percentages taken out of this employee\'s salary each pay run: TDS (tax), PF (provident fund), and ESI (state insurance).',
              why: 'Payroll uses these figures to work out the person\'s take-home pay, so they must match what Finance/HR has agreed.',
              when: 'Update them when the employee\'s tax or statutory deduction rates change — after confirming the new figures.',
            }} />
          </h2>

          {isCompensationLoading ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading compensation record...</p>
          ) : isCompensationError ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)',
              borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8125rem'
            }}>
              <AlertCircle size={16} />
              Couldn't load this employee's compensation record. Check your connection and refresh the page.
            </div>
          ) : !currentCompensation ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--warning-subtle)', border: '1px solid var(--warning)', color: 'var(--warning)',
              borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8125rem'
            }}>
              <AlertCircle size={16} />
              No compensation record has been set up for this employee yet. Set one up from the Payroll module first.
            </div>
          ) : null}

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              TDS (%)
              <HelpIcon text="Tax Deducted at Source — the income-tax percentage withheld from this employee's salary each month." />
            </label>
            <input
              type="number"
              className="form-input"
              value={tds}
              onChange={e => setTds(e.target.value ? Number(e.target.value) : '')}
              placeholder="e.g. 10"
              disabled={!currentCompensation}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              PF (%)
              <HelpIcon text="Provident Fund — the retirement-savings percentage deducted from salary (commonly 12%)." />
            </label>
            <input
              type="number"
              className="form-input"
              value={pf}
              onChange={e => setPf(e.target.value ? Number(e.target.value) : '')}
              placeholder="e.g. 12"
              disabled={!currentCompensation}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              ESI (%)
              <HelpIcon text="Employee State Insurance — a small health-insurance percentage deducted for eligible employees (commonly 0.75–1.75%)." />
            </label>
            <input
              type="number"
              className="form-input"
              value={esi}
              onChange={e => setEsi(e.target.value ? Number(e.target.value) : '')}
              placeholder="e.g. 1.75"
              disabled={!currentCompensation}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveCompensation}
            disabled={updateMutation.isPending || !currentCompensation}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Compensation'}
          </button>
        </div>
      )}
    </div>
  );
}
