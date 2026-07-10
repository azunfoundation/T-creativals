'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Zap, Globe, Lock, ArrowRight, FileText, BarChart2 } from 'lucide-react';
import { portal } from '@/lib/api';

const portalFeatures = [
  { icon: BarChart2, title: 'Project Visibility', desc: 'Track milestones and tasks across your active projects.' },
  { icon: FileText, title: 'Invoice History', desc: 'View all your invoices, payments, and outstanding balances.' },
  { icon: Globe, title: 'Secure Access', desc: 'Your dedicated portal with end-to-end encrypted sessions.' },
];

export default function PortalLoginPage() {
  const router = useRouter();

  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  // Redirect if already logged in
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('client_token')) {
      router.replace('/portal/dashboard');
    }
  }, [router]);

  const validate = () => {
    const errs: { email?: string; password?: string } = {};
    if (!email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email';
    if (!password) errs.password = 'Password is required';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setIsLoading(true);
    try {
      const res = await portal.login(email, password);
      const { token, user } = res.data;
      localStorage.setItem('client_token', token);
      localStorage.setItem('client_user', JSON.stringify(user));
      router.replace('/portal/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
      if (axiosErr?.response?.status === 401) {
        setError('Invalid email or password. Please try again.');
      } else if (axiosErr?.response?.status === 403) {
        setError('Access denied. This portal is for clients only.');
      } else {
        setError('Unable to connect. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
      {/* ── Left decorative panel ── */}
      <div
        className="portal-left-panel"
        style={{
          flex: '1 1 0%',
          display: 'none',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 40%, #0f172a 100%)',
        }}
      >
        {/* Orb decorations */}
        <div style={{ position: 'absolute', top: '-80px', left: '-80px', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-60px', right: '-60px', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(5,150,105,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '45%', right: '12%', width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,211,153,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '3rem' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem' }}>
            <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #059669, #10b981)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(16,185,129,0.45)' }}>
              <Zap size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Creativals OS</div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(52,211,153,0.8)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Client Portal</div>
            </div>
          </div>

          {/* Tagline */}
          <div style={{ marginBottom: '3rem' }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.2, letterSpacing: '-0.03em', marginBottom: '1rem' }}>
              Your projects.<br />
              <span style={{ color: '#6ee7b7' }}>Beautifully clear.</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem', lineHeight: 1.6 }}>
              Track progress, review milestones, and access your invoices — all in one place.
            </p>
          </div>

          {/* Feature bullets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {portalFeatures.map((f) => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ width: 38, height: 38, background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <f.icon size={17} color="#6ee7b7" />
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.9375rem' }}>{f.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '3rem' }}>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem' }}>© 2025 Creativals. All rights reserved.</p>
          </div>
        </div>
      </div>

      {/* ── Right: login form ── */}
      <div
        className="portal-right-panel"
        style={{ width: '100%', maxWidth: '480px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem' }}
      >
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '2rem' }}>
            <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg, #059669, #10b981)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={19} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>Creativals OS</div>
              <div style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Client Portal</div>
            </div>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.625rem', fontWeight: 700, marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
              Client Sign In
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Access your projects and invoices securely.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Global error */}
            {error && (
              <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', color: 'var(--danger)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={14} />
                {error}
              </div>
            )}

            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="portal-email">Email address</label>
              <input
                id="portal-email"
                type="email"
                autoComplete="email"
                placeholder="client@yourcompany.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })); }}
                className={`form-input${fieldErrors.email ? ' error' : ''}`}
              />
              {fieldErrors.email && <span className="form-error">{fieldErrors.email}</span>}
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="portal-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="portal-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }}
                  className={`form-input${fieldErrors.password ? ' error' : ''}`}
                  style={{ paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {fieldErrors.password && <span className="form-error">{fieldErrors.password}</span>}
            </div>

            {/* Submit */}
            <button
              id="portal-login-submit"
              type="submit"
              disabled={isLoading}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '0.5rem', gap: '0.625rem', fontSize: '0.9375rem', background: 'linear-gradient(135deg, #059669, #10b981)', borderColor: 'transparent' }}
            >
              {isLoading ? (
                <>
                  <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Signing in…
                </>
              ) : (
                <>
                  Access Portal
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          <p style={{ marginTop: '2rem', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>
            This portal is for clients only. Staff should use the <a href="/login" style={{ color: '#059669', textDecoration: 'none' }}>staff login</a>.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 900px) {
          .portal-left-panel { display: flex !important; }
          .portal-right-panel { max-width: 440px !important; }
        }
      `}</style>
    </div>
  );
}
