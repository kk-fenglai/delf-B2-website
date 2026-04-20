import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { api, ACCESS_KEY, REFRESH_KEY } from '../api/client';

interface RegisterResult {
  email: string;
  emailVerificationRequired: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: false,

      login: async (email, password) => {
        set({ loading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          localStorage.setItem(ACCESS_KEY, data.accessToken);
          localStorage.setItem(REFRESH_KEY, data.refreshToken);
          set({ user: data.user });
        } finally {
          set({ loading: false });
        }
      },

      register: async (email, password, name) => {
        set({ loading: true });
        try {
          const { data } = await api.post('/auth/register', { email, password, name });
          // Email verification is required — no tokens issued yet.
          return { email: data.user?.email || email, emailVerificationRequired: !!data.emailVerificationRequired };
        } finally {
          set({ loading: false });
        }
      },

      logout: async () => {
        const refreshToken = localStorage.getItem(REFRESH_KEY);
        try { await api.post('/auth/logout', { refreshToken }); } catch { /* ignore */ }
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        set({ user: null });
      },

      fetchMe: async () => {
        try {
          const { data } = await api.get('/user/me');
          set({ user: data.user });
        } catch { /* ignore */ }
      },
    }),
    { name: 'delfluent-auth', partialize: (s) => ({ user: s.user }) }
  )
);
