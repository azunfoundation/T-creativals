'use client';

import { useToast } from '@/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { EmptyState } from '@/components/ui/EmptyState';
import { payroll as payrollApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const PAYSLIPS_HOWTO = {
  overview: 'A history of your own approved payslips — every month your payroll run was approved shows up here with a downloadable PDF.',
  sections: [
    {
      heading: 'Why a month might be missing',
      items: [
        'Only approved payroll runs appear here — a draft run isn\'t final yet, so it\'s intentionally excluded.',
        'If a month is missing entirely, no payroll run may have been generated or approved for it yet — check with Finance/HR.',
      ],
    },
  ],
};

export default function MyPayslipsPage() {
  const { showToast } = useToast();
  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: ['payroll-history'],
    queryFn: async () => {
      const res = await payrollApi.myHistory();
      return res.data.data;
    },
  });

  const handleDownload = async (itemId: number) => {
    try {
      const response = await payrollApi.downloadPayslip(itemId);
      const url = window.URL.createObjectURL(new Blob([response.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payslip-${itemId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to download payslip', err);
      showToast('Failed to download payslip', 'error');
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)' }}>My Payslips</h1>
            <HelpIcon text="Only approved payroll runs show up here — a draft run in progress isn't final yet." />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            View and download your historical payslips.
          </p>
        </div>
        <HowToUseGuide moduleKey="payroll_history" title="How Payslip History Works" content={PAYSLIPS_HOWTO} />
      </div>

      {isError ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--danger)' }}>Couldn't load your payslip history. Try refreshing.</div>
      ) : (
        <div className="table-container">
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : items.length === 0 ? (
            <EmptyState title="No payslips yet" description="Once a payroll run covering you is approved, it will appear here with a downloadable PDF." />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Base Salary</th>
                  <th>Bonuses</th>
                  <th>Deductions</th>
                  <th>Net Salary</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.payroll_run ? `${MONTH_NAMES[item.payroll_run.month - 1]} ${item.payroll_run.year}` : 'N/A'}</td>
                    <td>{formatCurrency(item.base_salary)}</td>
                    <td>{formatCurrency(item.bonus_amount)}</td>
                    <td>{formatCurrency(item.deductions)}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(item.net_salary)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleDownload(item.id)}
                      >
                        <Download size={14} style={{ marginRight: '0.25rem' }} /> Download Payslip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
