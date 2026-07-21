'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { userPreferences } from '@/lib/api';

export interface WorkspaceContextType {
  preferences: Record<string, any>;
  activeProjectId: number | null;
  setActiveProjectId: (projectId: number | null) => void;
  getPagePreference: <T extends Record<string, any>>(pageKey: string, defaultPrefs?: T) => T;
  setPagePreference: (pageKey: string, newPrefs: Record<string, any>) => void;
  clearPagePreference: (pageKey: string) => void;
  isLoaded: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const [preferences, setPreferences] = useState<Record<string, any>>({});
  const [activeProjectId, setActiveProjectIdState] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Storage key helper per user
  const getStorageKey = useCallback(() => {
    return user ? `creativals_workspace_prefs_${user.id}` : 'creativals_workspace_prefs_guest';
  }, [user]);

  // Sync to backend with debounce
  const syncToBackend = useCallback((newPrefs: Record<string, any>) => {
    if (!user) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await userPreferences.update(newPrefs);
      } catch (err) {
        console.error('Failed to sync workspace preferences to backend', err);
      }
    }, 800);
  }, [user]);

  // Initial hydration
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storageKey = getStorageKey();
    let initialPrefs: Record<string, any> = {};

    // 1. Read from localStorage for zero-delay hydration
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        initialPrefs = JSON.parse(stored);
      }
    } catch {
      // Ignore invalid JSON
    }

    // Restore sticky active project from initialPrefs
    if (initialPrefs.activeProjectId !== undefined) {
      setActiveProjectIdState(initialPrefs.activeProjectId ? Number(initialPrefs.activeProjectId) : null);
    }

    setPreferences(initialPrefs);
    setIsLoaded(true);

    // 2. Fetch latest from API when logged in
    if (user) {
      userPreferences.get()
        .then((res) => {
          const serverPrefs = res.data?.data || res.data || {};
          if (serverPrefs && typeof serverPrefs === 'object' && Object.keys(serverPrefs).length > 0) {
            setPreferences((prev) => {
              const merged = { ...prev, ...serverPrefs };
              try {
                localStorage.setItem(storageKey, JSON.stringify(merged));
              } catch {}
              if (merged.activeProjectId !== undefined) {
                setActiveProjectIdState(merged.activeProjectId ? Number(merged.activeProjectId) : null);
              }
              return merged;
            });
          }
        })
        .catch(() => {
          // Use localStorage fallback if offline/error
        });
    }
  }, [user, getStorageKey]);

  // Update sticky project ID
  const setActiveProjectId = useCallback((projectId: number | null) => {
    setActiveProjectIdState(projectId);
    setPreferences((prev) => {
      const updated = { ...prev, activeProjectId: projectId };
      const storageKey = getStorageKey();
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
      syncToBackend(updated);
      return updated;
    });
  }, [getStorageKey, syncToBackend]);

  // Get preferences for a specific page/module
  const getPagePreference = useCallback(<T extends Record<string, any>>(pageKey: string, defaultPrefs?: T): T => {
    const pageData = preferences[pageKey] || {};
    return { ...defaultPrefs, ...pageData } as T;
  }, [preferences]);

  // Update preferences for a specific page/module
  const setPagePreference = useCallback((pageKey: string, newPrefs: Record<string, any>) => {
    setPreferences((prev) => {
      const currentPagePrefs = prev[pageKey] || {};
      const updatedPagePrefs = { ...currentPagePrefs, ...newPrefs };
      const updatedAll = { ...prev, [pageKey]: updatedPagePrefs };

      const storageKey = getStorageKey();
      try {
        localStorage.setItem(storageKey, JSON.stringify(updatedAll));
      } catch {}

      syncToBackend(updatedAll);
      return updatedAll;
    });
  }, [getStorageKey, syncToBackend]);

  // Clear preferences for a page
  const clearPagePreference = useCallback((pageKey: string) => {
    setPreferences((prev) => {
      const updated = { ...prev };
      delete updated[pageKey];
      const storageKey = getStorageKey();
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
      syncToBackend(updated);
      return updated;
    });
  }, [getStorageKey, syncToBackend]);

  return (
    <WorkspaceContext.Provider
      value={{
        preferences,
        activeProjectId,
        setActiveProjectId,
        getPagePreference,
        setPagePreference,
        clearPagePreference,
        isLoaded,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
