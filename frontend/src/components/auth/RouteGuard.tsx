'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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

