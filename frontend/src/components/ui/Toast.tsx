'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

// ─── Colors & Icons ───────────────────────────────────────────────────────────

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; color: string; Icon: React.ElementType }> = {
  success: {
    bg: 'var(--success-subtle)',
    border: 'var(--success)',
    color: 'var(--success)',
    Icon: Check,
  },
  error: {
    bg: 'var(--danger-subtle)',
    border: 'var(--danger)',
    color: 'var(--danger)',
    Icon: X,
  },
  warning: {
    bg: 'var(--warning-subtle)',
    border: 'var(--warning)',
    color: 'var(--warning)',
    Icon: AlertTriangle,
  },
  info: {
    bg: 'var(--info-subtle)',
    border: 'var(--info)',
    color: 'var(--info)',
    Icon: Info,
  },
};

// ─── Single Toast Item ────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const { bg, border, color, Icon } = TOAST_STYLES[toast.type];

  // animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // auto-dismiss
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.625rem',
        padding: '0.75rem 1rem',
        background: 'var(--surface-elevated)',
        border: `1px solid ${border}`,
        borderLeft: `4px solid ${border}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        minWidth: 280,
        maxWidth: 380,
        transform: visible ? 'translateX(0)' : 'translateX(110%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
        pointerEvents: 'auto',
      }}
    >
      {/* Icon */}
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: bg,
          color: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Icon size={12} strokeWidth={2.5} />
      </span>

      {/* Message */}
      <span
        style={{
          flex: 1,
          fontSize: '0.875rem',
          color: 'var(--text-primary)',
          lineHeight: 1.4,
        }}
      >
        {toast.message}
      </span>

      {/* Close */}
      <button
        onClick={handleClose}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1px',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
