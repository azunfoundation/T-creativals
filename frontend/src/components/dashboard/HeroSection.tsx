import React from 'react';
import { useRouter } from 'next/navigation';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';
import { DASHBOARD_HOWTO } from './shared';

interface QuickAction {
  label: string;
  route: string;
  icon: React.ElementType;
}

interface HeroSectionProps {
  userName: string;
  quickActions: QuickAction[];
  currentMonthName: string;
}

export default function HeroSection({ userName, quickActions, currentMonthName }: HeroSectionProps) {
  const router = useRouter();
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  // Format today's date nicely: e.g., "Monday, 10 July 2026"
  const formattedToday = now.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingBottom: '0.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            {greeting}, {userName.split(' ')[0] || 'there'}
            <HelpIcon title="Dashboard" content={{
              what: 'A live summary of your work and — depending on your role — the business: this month\'s money, projects, team activity, and anything overdue.',
              why: 'It saves you opening every module: the most important numbers and alerts are gathered in one place, calculated straight from the database.',
              when: 'Check it first thing each day, and after big events like sending invoices or closing a deal.',
            }} />
          </span>
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          {formattedToday}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <HowToUseGuide moduleKey="dashboard" title="How the Dashboard Works" content={DASHBOARD_HOWTO} />
        {quickActions.map(({ label, route, icon: Icon }) => (
          <button
            key={route}
            onClick={() => router.push(`${route}?new=true`)}
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-md)', gap: '0.375rem', display: 'flex', alignItems: 'center' }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
