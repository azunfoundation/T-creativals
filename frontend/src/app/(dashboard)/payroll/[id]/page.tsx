'use client';

import { useToast } from '@/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Download, FileText } from 'lucide-react';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { payroll as payrollApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const RUN_DETAIL_HOWTO = {
  overview: 'A line-by-line breakdown of one payroll run — every employee\'s base pay, bonuses, and TDS/PF/ESI deductions for that month.',
  sections: [
    {
      heading: 'Reading this page',
      items: [
        'Deductions expand to show TDS, PF, and ESI amounts individually, based on each employee\'s compensation setup.',
        'Bonuses expand to show which approved bonus(es) were folded into that month\'s run.',
      ],
    },
    {
      heading: 'Exporting',
      items: ['CSV is best for spreadsheets/accounting import; PDF is a formatted document for record-keeping.'],
    },
  ],
};

export default function PayrollRunDetailsPage() {
  const { showToast } = useToast();
  const params = useParams();
  const runId = Number(params?.id);

  const { data: runResponse, isLoading, isError } = useQuery({
    queryKey: ['payroll-run', runId],
    queryFn: () => payrollApi.getRunDetails(runId),
    enabled: !!runId,
  });

  const run = runResponse?.data;

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      const response = await payrollApi.exportRun(runId, format);
      const url = window.URL.createObjectURL(new Blob([response.data as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payroll-run-${runId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast(`Failed to export ${format.toUpperCase()}. Please try again.`, 'error');
    }
  };

  if (isLoading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading payroll run…</div>;
  if (isError) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--danger)' }}>Couldn't load this payroll run. Please go back and try again.</div>;
  if (!run) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Payroll run not found.</div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Payroll Run #{run.id}</h1>
            <HelpIcon text="TDS/PF/ESI and bonus lines expand automatically wherever they apply to a row." />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Period: {run.month}/{run.year} | Status: <span style={{ textTransform: 'capitalize' }}>{run.status}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <HowToUseGuide moduleKey="payroll_run_detail" title="How This Page Works" content={RUN_DETAIL_HOWTO} />
          <button className="btn btn-secondary" onClick={() => handleExport('csv')}>
            <Download size={16} style={{ marginRight: '0.25rem' }} /> Export (CSV)
          </button>
          <button className="btn btn-secondary" onClick={() => handleExport('pdf')}>
            <FileText size={16} style={{ marginRight: '0.25rem' }} /> Export (PDF)
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Base Salary</th>
              <th>Bonus</th>
              <th>Deductions</th>
              <th>Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {(run.items || []).map((item) => (
              <tr key={item.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{item.user?.name || `User #${item.user_id}`}</div>
                </td>
                <td>{formatCurrency(item.base_salary)}</td>
                <td>
                  {formatCurrency(item.bonus_amount)}
                  {item.breakdown?.bonuses && item.breakdown.bonuses.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {item.breakdown.bonuses.map((b, i) => (
                        <span key={i}>{b.type}{b.reason ? `: ${b.reason}` : ''}{i < item.breakdown!.bonuses!.length - 1 ? ', ' : ''}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ color: 'var(--danger)' }}>
                    -{formatCurrency(item.deductions)}
                    {item.breakdown?.deductions && item.breakdown.deductions.length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {item.breakdown.deductions.map((d, i) => (
                          <span key={i}>{d.description}: {formatCurrency(d.amount)} </span>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td style={{ fontWeight: 600 }}>{formatCurrency(item.net_salary)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
