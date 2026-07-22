'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/crm':         ['leads.view'],
  '/clients':     ['clients.view'],
  '/quotes':      ['quotes.view'],
  '/invoices':    ['invoices.view'],
  '/projects':    ['projects.view'],
  '/expenses':    ['expenses.view'],
  '/payroll':     ['payroll.view'],
  '/reports':     ['reports.view'],
  '/users':       ['users.view'],
  '/roles':       ['roles.view'],
  '/departments': ['departments.view'],
  '/services':    ['services.view'],
};

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, loadUser } = useAuthStore();
  const user = useAuthStore((s) => s.user);
  const [isInitialized, setIsInitialized] = useState(false);

  // Run ONCE on mount to validate the stored token.
  // Do NOT include `user` in deps — re-running on every user update
  // causes a /auth/me loop that can log the user out on transient errors.
  useEffect(() => {
    const initAuth = async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

      if (token) {
        // Only call loadUser if we don't already have the user in state
        if (!useAuthStore.getState().user) {
          await loadUser();
        }
        const currentUser = useAuthStore.getState().user;
        if (!currentUser) {
          router.replace('/login');
          return;
        }
      } else {
        router.replace('/login');
        return;
      }
      setIsInitialized(true);
    };

    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — only run on mount

  // Check route-level permissions
  useEffect(() => {
    if (!isInitialized || !user) return;

    const matchedPrefix = Object.keys(ROUTE_PERMISSIONS).find(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
    );
    if (matchedPrefix) {
      const required = ROUTE_PERMISSIONS[matchedPrefix];
      const hasPerm =
        user.roles?.some((r) => r.name === 'founder') ||
        required.some((p) => user.permissions?.includes(p));
      if (!hasPerm) {
        router.replace('/dashboard');
      }
    }
  }, [pathname, isInitialized, user, router]);

  if (isLoading || (!isInitialized && !user)) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--background)',
        color: 'var(--text-secondary)',
        flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 14 }}>Loading...</span>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

