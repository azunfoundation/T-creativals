'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, Sliders, Users, FileSpreadsheet, Database, User, Lock, Bell, Mail, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const userRoles = user?.roles.map((r: any) => typeof r === 'string' ? r : r?.name || '') || [];
  const isAdmin = userRoles.includes('founder') || userRoles.includes('director');
  const isFounder = userRoles.includes('founder');

  const tabs = [
    { label: 'My Profile', href: '/settings/profile', icon: User },
    { label: 'Change Password', href: '/settings/change-password', icon: Lock },
    { label: 'Notification Settings', href: '/settings/notifications', icon: Bell },
    ...(isAdmin ? [
      { label: 'General Settings', href: '/settings/general', icon: Building2 },
      { label: 'Mail/SMTP Settings', href: '/settings/smtp', icon: Mail },
      { label: 'Number Sequences', href: '/settings/sequences', icon: Sliders },
      { label: 'CRM Configuration', href: '/settings/crm', icon: Users },
      { label: 'Audit Logs', href: '/settings/audits', icon: FileSpreadsheet },
      { label: 'Backups & Recovery', href: '/settings/backups', icon: Database },
    ] : []),
    ...(isFounder ? [
      { label: 'Danger Zone', href: '/settings/danger-zone', icon: AlertTriangle },
    ] : []),
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1rem' }}>
      
      {/* Inject custom CSS for responsive behavior */}
      <style dangerouslySetInnerHTML={{ __html: `
        .settings-layout-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* Mobile native navigation select */
        .settings-mobile-nav {
          display: block;
          margin-bottom: 1rem;
        }

        /* Tablet horizontal scrollable navigation */
        .settings-horizontal-nav {
          display: none;
          gap: 0.25rem;
          border-bottom: 1px solid var(--border);
          margin-bottom: 1rem;
          padding-bottom: 4px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }

        /* Visible scrollbar on horizontal nav so users know they can scroll */
        .settings-horizontal-nav::-webkit-scrollbar {
          height: 5px;
        }
        .settings-horizontal-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .settings-horizontal-nav::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 4px;
        }

        /* Desktop vertical sidebar navigation (hidden by default) */
        .settings-vertical-nav {
          display: none;
        }

        .settings-page-content {
          flex: 1;
          min-width: 0;
        }

        /* Tablet Breakpoint (640px to 1023px) */
        @media (min-width: 640px) {
          .settings-mobile-nav {
            display: none;
          }
          .settings-horizontal-nav {
            display: flex;
          }
        }

        /* Desktop Breakpoint (>= 1024px) */
        @media (min-width: 1024px) {
          .settings-layout-container {
            flex-direction: row;
            align-items: flex-start;
            gap: 2.5rem;
          }

          .settings-mobile-nav {
            display: none;
          }

          .settings-horizontal-nav {
            display: none;
          }

          .settings-vertical-nav {
            display: flex;
            flex-direction: column;
            width: 240px;
            flex-shrink: 0;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 0.75rem;
            gap: 0.25rem;
            box-shadow: var(--shadow-sm);
          }

          .settings-nav-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.6rem 0.875rem;
            color: var(--text-secondary);
            font-size: 0.875rem;
            font-weight: 500;
            text-decoration: none;
            border-radius: var(--radius-md);
            transition: all 0.15s ease;
          }

          .settings-nav-item:hover {
            background: var(--surface-hover);
            color: var(--text-primary);
          }

          .settings-nav-item-active {
            background: var(--accent-subtle) !important;
            color: var(--accent) !important;
            font-weight: 600;
          }
        }
      `}} />

      {/* MOBILE (< 640px): Select Dropdown */}
      <div className="settings-mobile-nav">
        <label htmlFor="settings-nav-select" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Settings Navigation
        </label>
        <select
          id="settings-nav-select"
          value={pathname}
          onChange={(e) => router.push(e.target.value)}
          className="form-control"
          style={{
            width: '100%',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            fontWeight: 500,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {tabs.map((tab) => (
            <option key={tab.href} value={tab.href}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      {/* TABLET (640px - 1023px): Horizontal Scrollable Tabs */}
      <div className="settings-horizontal-nav">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Main Responsive Grid */}
      <div className="settings-layout-container">
        
        {/* DESKTOP (>= 1024px): Vertical Sidebar Navigation */}
        <div className="settings-vertical-nav">
          <div style={{ padding: '0.5rem 0.875rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            System Settings
          </div>
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`settings-nav-item ${isActive ? 'settings-nav-item-active' : ''}`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Active Settings Page Content */}
        <div className="settings-page-content">
          {children}
        </div>

      </div>

    </div>
  );
}
