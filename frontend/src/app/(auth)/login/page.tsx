'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Zap, BarChart3, Shield, Users, ArrowRight, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { checkBackendHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

const features = [
  {
    icon: BarChart3,
    title: 'Full-stack Visibility',
    desc: 'Revenue, projects, team — all in one command center.',
  },
  {
    icon: Users,
    title: 'Team Management',
    desc: 'Roles, attendance, payroll, timesheets unified.',
  },
  {
    icon: Shield,
    title: 'Granular Permissions',
    desc: 'Role-based access control for every module.',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error, isAuthenticated, clearError, user } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);

  // Probe the backend so users see "server offline" instead of a misleading
  // credentials error. Re-checks periodically while unreachable.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const probe = async () => {
      const reachable = await checkBackendHealth();
      if (cancelled) return;
      setBackendReachable(reachable);
      if (!reachable) {
        timer = setTimeout(probe, 8000);
      }
    };

    probe();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.must_change_password) {
        router.replace('/settings/change-password');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const validate = () => {
    const errs: { email?: string; password?: string } = {};
    if (!email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    try {
      await login(email, password);
      const updatedUser = useAuthStore.getState().user;
      if (updatedUser?.must_change_password) {
        router.replace('/settings/change-password');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      // error is set in store
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
      {/* ── Left Panel ── */}
      <div
        style={{
          flex: '1 1 0%',
          display: 'none',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #3b0764 0%, #1e1b4b 50%, #0f172a 100%)',
        }}
        className="login-left-panel"
      >
        {/* Decorative orbs */}
        <div style={{
          position: 'absolute', top: '-100px', left: '-100px',
          width: '400px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-80px', right: '-80px',
          width: '350px', height: '350px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(79,70,229,0.3) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '40%', right: '10%',
          width: '200px', height: '200px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(167,139,250,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 1, height: '100%',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '3rem',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem' }}>
            <div style={{
              width: 44, height: 44,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 24px rgba(124,58,237,0.5)',
            }}>
              <Zap size={22} color="#fff" />
            </div>
            <span style={{ fontSize: '1.375rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              Creativals OS
            </span>
          </div>

          {/* Tagline */}
          <div style={{ marginBottom: '3rem' }}>
            <h1 style={{
              fontSize: '2.5rem', fontWeight: 800,
              color: '#ffffff', lineHeight: 1.2,
              letterSpacing: '-0.03em', marginBottom: '1rem',
            }}>
              Your Agency.<br />
              <span style={{ color: '#a78bfa' }}>One OS.</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.0625rem', lineHeight: 1.6 }}>
              Manage your entire creative agency from a single, powerful platform.
            </p>
          </div>

          {/* Feature bullets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {features.map((f) => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{
                  width: 38, height: 38,
                  background: 'rgba(124,58,237,0.2)',
                  border: '1px solid rgba(124,58,237,0.4)',
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <f.icon size={17} color="#a78bfa" />
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9375rem' }}>{f.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom text */}
          <div style={{ marginTop: 'auto', paddingTop: '3rem' }}>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem' }}>
              © 2025 Creativals. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div style={{
        width: '100%',
        maxWidth: '480px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}
        className="login-right-panel"
      >
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {/* Mobile Logo */}
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: '0.625rem', marginBottom: '2rem',
          }}>
            <div style={{
              width: 38, height: 38,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={19} color="#fff" />
            </div>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Creativals OS
            </span>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.625rem', fontWeight: 700, marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
              Sign in
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Welcome back. Enter your credentials to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Backend offline warning */}
            {backendReachable === false && (
              <div style={{
                background: 'var(--warning-subtle, rgba(245,158,11,0.1))',
                border: '1px solid var(--warning, #f59e0b)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                color: 'var(--warning, #f59e0b)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}>
                <WifiOff size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  The server is currently unreachable. If you are running locally, start the
                  backend (run <code>start-local.bat</code>). This message will disappear
                  automatically once the server is back.
                </span>
              </div>
            )}

            {/* Global error */}
            {error && (
              <div style={{
                background: 'var(--danger-subtle)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                color: 'var(--danger)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <Shield size={15} />
                {error}
              </div>
            )}

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@yourcompany.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })); }}
                className={cn('form-input', fieldErrors.email && 'error')}
              />
              {fieldErrors.email && <span className="form-error">{fieldErrors.email}</span>}
            </div>

            {/* Password */}
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="form-label" htmlFor="password">Password</label>
                <button
                  type="button"
                  onClick={() => router.push('/forgot-password')}
                  style={{ color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }}
                  className={cn('form-input', fieldErrors.password && 'error')}
                  style={{ paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {fieldErrors.password && <span className="form-error">{fieldErrors.password}</span>}
            </div>

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={isLoading}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '0.5rem', gap: '0.625rem', fontSize: '0.9375rem' }}
            >
              {isLoading ? (
                <>
                  <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          <p style={{ marginTop: '2rem', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>
            Protected by enterprise-grade security. All data encrypted in transit.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 900px) {
          .login-left-panel { display: flex !important; }
          .login-right-panel { max-width: 440px !important; }
        }
      `}</style>
    </div>
  );
}
