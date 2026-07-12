import React from 'react';
import { useRouter } from 'next/navigation';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { formatCurrency } from '@/lib/utils';
import { ArrowRight, FolderKanban } from 'lucide-react';

interface ProjectHealthProps {
  projects: any[];
  projectsSummary: any;
}

export default function ProjectHealth({ projects, projectsSummary }: ProjectHealthProps) {
  const router = useRouter();

  // Show top 3 projects sorted by risk level
  const displayedProjects = [...projects].slice(0, 3);
  const totalActive = projectsSummary?.active_count || projects.length;

  const getRiskColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'critical':
        return 'var(--danger)';
      case 'medium':
        return 'var(--warning)';
      case 'low':
      default:
        return 'var(--success)';
    }
  };

  return (
    <div className="dash-card" style={{ flex: 1, minHeight: '300px' }}>
      <div className="dash-card-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 className="dash-card-title" style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Project Health
            <HelpIcon title="Project Health" content={{
              what: 'Visual checklist of active projects, displaying completion status, financial usage, and current risk tier.',
              why: 'Helps identify projects that are running out of budget or missing deadlines.',
              when: 'Review daily. Critical risk signals need immediate coordination with managers.'
            }} />
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{totalActive} active projects running</p>
        </div>
        <button
          onClick={() => router.push('/projects')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}
        >
          View All <ArrowRight size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
        {projects.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <FolderKanban size={24} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: '0.8125rem' }}>No active projects right now</p>
          </div>
        ) : (
          displayedProjects.map((prj: any) => {
            const riskColor = getRiskColor(prj.risk_level);
            return (
              <div
                key={prj.id}
                className="dash-list-card"
                onClick={() => router.push(`/projects/${prj.id}`)}
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem', padding: '0.875rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div>
                    <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      {prj.name}
                    </h4>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                      {prj.client || 'Unknown Client'} · PM: {prj.manager || 'No PM'}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.625rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '0.125rem 0.375rem',
                      borderRadius: '4px',
                      background: `${riskColor}15`,
                      color: riskColor,
                      border: `1px solid ${riskColor}30`
                    }}
                  >
                    {prj.risk_level || 'low'}
                  </span>
                </div>

                {/* Progress Bar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                    <span>Completion</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{prj.completion_percentage}%</span>
                  </div>
                  <div className="dash-progress">
                    <div
                      className="dash-progress-fill"
                      style={{ width: `${prj.completion_percentage}%`, background: 'var(--accent)' }}
                    />
                  </div>
                </div>

                {/* Budget Used */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                    <span>Budget Used ({formatCurrency(prj.cost || 0)})</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {prj.budget_utilisation_pct?.toFixed(0)}%
                    </span>
                  </div>
                  <div className="dash-progress">
                    <div
                      className="dash-progress-fill"
                      style={{
                        width: `${Math.min(100, prj.budget_utilisation_pct || 0)}%`,
                        background: prj.budget_utilisation_pct > 100 ? 'var(--danger)' : 'var(--success)'
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
