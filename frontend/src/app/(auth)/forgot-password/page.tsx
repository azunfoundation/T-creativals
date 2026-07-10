'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Zap, CheckCircle } from 'lucide-react';
import { auth, getApiErrorMessage } from '@/lib/api';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  const validate = () => {
    if (!email) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldError('');

    const err = validate();
    if (err) {
      setFieldError(err);
      return;
    }

    setIsLoading(true);
    try {
      await auth.forgotPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '2.5rem' }}>
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

        {success ? (
          /* ── Success State ── */
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(34,197,94,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}>
              <CheckCircle size={28} color="#22c55e" />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.625rem' }}>
              Check your email
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              If an account exists for <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, you'll receive a password reset link shortly.
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          /* ── Form State ── */
          <>
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.625rem', fontWeight: 700, marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                Forgot password?
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Enter your email and we'll send you a reset link.
              </p>
            </div>

            {error && (
              <div style={{
                background: 'var(--danger-subtle)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                color: 'var(--danger)',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email address</label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={16}
                    style={{
                      position: 'absolute', left: '0.875rem', top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)', pointerEvents: 'none',
                    }}
                  />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@yourcompany.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFieldError(''); }}
                    className={`form-input${fieldError ? ' error' : ''}`}
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
                {fieldError && <span className="form-error">{fieldError}</span>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary btn-lg"
                style={{ width: '100%', marginTop: '0.25rem' }}
              >
                {isLoading ? (
                  <>
                    <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Sending…
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>

            <button
              type="button"
              onClick={() => router.push('/login')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                marginTop: '1.5rem', color: 'var(--text-secondary)',
                fontSize: '0.875rem', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0,
              }}
            >
              <ArrowLeft size={15} />
              Back to Sign In
            </button>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
