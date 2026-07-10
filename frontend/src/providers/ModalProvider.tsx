'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { InputModal } from '@/components/ui/InputModal';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface PromptOptions {
  title?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface ModalContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (val: boolean) => void }) | null>(null);
  const [promptState, setPromptState] = useState<(PromptOptions & { resolve: (val: string | null) => void }) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptState({ ...options, resolve });
    });
  }, []);

  return (
    <ModalContext.Provider value={{ confirm, prompt }}>
      {children}
      {confirmState && (
        <ConfirmModal
          onCancel={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
          onConfirm={() => {
            confirmState.resolve(true);
            setConfirmState(null);
          }}
          title={confirmState.title || 'Confirm Action'}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel || 'Confirm'}
          cancelLabel={confirmState.cancelLabel || 'Cancel'}
          danger={confirmState.variant === 'danger'}
        />
      )}
      {promptState && (
        <InputModal
          title={promptState.title || 'Input required'}
          message={promptState.message}
          defaultValue={promptState.defaultValue}
          placeholder={promptState.placeholder}
          confirmLabel={promptState.confirmLabel}
          onConfirm={(val) => {
            promptState.resolve(val);
            setPromptState(null);
          }}
          onCancel={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
        />
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
