import React from 'react';
import { useRouter } from 'next/navigation';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { formatCurrency } from '@/lib/utils';
import { ArrowRight, Trophy } from 'lucide-react';

interface TopClientsProps {
  topClients: any[];
  projects: any[];
  canViewFinancial: boolean;
}

export default function TopClients({ topClients, projects, canViewFinancial }: TopClientsProps) {
  const router = useRouter();

  if (!canViewFinancial || topClients.length === 0) {
    return null; // Top Clients is gated behind financial permission
  }

  // Get top 5 clients
  const displayedClients = topClients.slice(0, 5);

  const getRelationshipHealth = (billed: number, outstanding: number) => {
    if (outstanding === 0) {
      return { label: 'Excellent', color: 'var(--success)' };
    }
    const ratio = outstanding / billed;
    if (ratio < 0.3) {
      return { label: 'Good', color: 'var(--success)' };
    }
    if (ratio < 0.6) {
      return { label: 'Stable', color: 'var(--warning)' };
    }
    return { label: 'At Risk', color: 'var(--danger)' };
  };

  const getPaymentStatus = (billed: number, outstanding: number) => {
    if (outstanding === 0) {
      return { label: 'Paid', color: 'var(--success)' };
    }
    if (outstanding < billed) {
      return { label: 'Partial', color: 'var(--warning)' };
    }
    return { label: 'Unpaid', color: 'var(--danger)' };
  };

  return (
    <div className="dash-card" style={{ flex: 1, minHeight: '300px' }}>
      <div className="dash-card-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="dash-card-title" style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Top Clients
            <HelpIcon title="Top Clients" content={{
              what: 'Top 5 accounts sorted by invoice amount billed this month.',
              why: 'Helps identify key billing sources and check outstanding invoice balances.',
              when: 'Review monthly. Focus collection followups on the unpaid top accounts first.'
            }} />
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>By billing this month</p>
        </div>
        <button
          onClick={() => router.push('/clients')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}
        >
          View CRM <ArrowRight size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginTop: '0.5rem' }}>
        {displayedClients.map((c: any, i: number) => {
          const projectCount = Math.max(1, projects.filter(p => p.client === c.client_name).length);
          const health = getRelationshipHealth(c.total_billed || 1, c.outstanding || 0);
          const payment = getPaymentStatus(c.total_billed || 1, c.outstanding || 0);

          return (
            <div
              key={c.client_id ?? i}
              className="dash-list-card"
              style={{ justifyContent: 'space-between', padding: '0.625rem 0.875rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                {/* Medal or Ranking spot */}
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: i === 0 ? '#fef3c7' : i === 1 ? '#f3f4f6' : i === 2 ? '#ffedd5' : 'var(--surface-elevated)',
                  color: i === 0 ? '#d97706' : i === 1 ? '#4b5563' : i === 2 ? '#c2410c' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700, flexShrink: 0
                }}>
                  {i === 0 ? <Trophy size={12} /> : i + 1}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {c.client_name}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                    {projectCount} projects
                  </span>
                </div>
              </div>

              {/* Billed info */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatCurrency(c.total_billed || 0)}
                  </div>
                  {c.outstanding > 0 ? (
                    <span style={{ fontSize: '0.625rem', color: 'var(--warning)' }}>
                      {formatCurrency(c.outstanding)} outstanding
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>fully paid</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', width: '60px', alignItems: 'flex-end' }}>
                  {/* Payment Pill */}
                  <span style={{
                    fontSize: '0.5625rem', fontWeight: 700,
                    textTransform: 'uppercase', padding: '1px 4px', borderRadius: '3px',
                    background: `${payment.color}15`, color: payment.color, border: `1px solid ${payment.color}25`
                  }}>
                    {payment.label}
                  </span>
                  {/* Health Pill */}
                  <span style={{
                    fontSize: '0.5625rem', fontWeight: 700,
                    textTransform: 'uppercase', padding: '1px 4px', borderRadius: '3px',
                    background: `${health.color}15`, color: health.color, border: `1px solid ${health.color}25`
                  }}>
                    {health.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
