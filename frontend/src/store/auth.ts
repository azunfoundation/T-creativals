import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth as authApi, getApiErrorMessage } from '@/lib/api';

export interface User {
  id: number;
  name: string;
  email: string;
  roles: Array<{ id: number; name: string; display_name: string; color?: string }>;
  permissions: string[];
  departments: Array<{ id: number; name: string; color?: string }>;
  avatar_url: string | null;
  status: 'active' | 'inactive';
  employee_id?: string;
  phone?: string;
  must_change_password?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(email, password);
          const { token, user } = response.data as unknown as { token: string; user: User };

          if (typeof window !== 'undefined') {
            localStorage.setItem('auth_token', token);
          }

          set({
            token,
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (err: unknown) {
          const message = getApiErrorMessage(err, 'Unable to sign in. Please try again.');
          set({ isLoading: false, error: message, isAuthenticated: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // ignore errors on logout
        } finally {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
          }
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: null,
          });
        }
      },

      setUser: (user: User) => {
        set({ user, isAuthenticated: true });
      },

      loadUser: async () => {
        const token =
          get().token ||
          (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);

        if (!token) {
          set({ isAuthenticated: false });
          return;
        }

        set({ isLoading: true });
        try {
          const response = await authApi.me();
          const user = response.data as unknown as User;
          set({ user, isAuthenticated: true, isLoading: false, token });
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          // Only treat a real 401 Unauthorized as an expired session.
          // Transient errors (network timeouts, 500s) should NOT log the user out.
          if (status === 401) {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('auth_token');
            }
            set({ user: null, token: null, isAuthenticated: false, isLoading: false });
          } else {
            // Keep the existing token/user — just stop loading
            set({ isLoading: false });
          }
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'creativals-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);
