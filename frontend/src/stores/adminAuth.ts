import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { adminApi, ADMIN_TOKEN_KEY, ADMIN_REFRESH_KEY } from '../api/adminClient';

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  plan?: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
}

interface AdminAuthState {
  admin: AdminUser | null;
  pendingToken: string | null;
  loading: boolean;
  loginStep1: (email: string, password: string) => Promise<{ message: string }>;
  loginStep2: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  clearPending: () => void;
}

export const useAdminAuth = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      admin: null,
      pendingToken: null,
      loading: false,

      loginStep1: async (email, password) => {
        set({ loading: true });
        try {
          const { data } = await adminApi.post('/auth/login', { email, password });
          if (data.step === '2fa') {
            set({ pendingToken: data.pendingToken });
            return { message: data.message };
          }
          throw new Error('Unexpected login response');
        } finally {
          set({ loading: false });
        }
      },

      loginStep2: async (code) => {
        const pendingToken = get().pendingToken;
        if (!pendingToken) throw new Error('No pending 2FA session');
        set({ loading: true });
        try {
          const { data } = await adminApi.post('/auth/verify-2fa', { pendingToken, code });
          localStorage.setItem(ADMIN_TOKEN_KEY, data.accessToken);
          localStorage.setItem(ADMIN_REFRESH_KEY, data.refreshToken);
          set({ admin: data.user, pendingToken: null });
        } finally {
          set({ loading: false });
        }
      },

      logout: async () => {
        try { await adminApi.post('/auth/logout'); } catch {}
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.removeItem(ADMIN_REFRESH_KEY);
        set({ admin: null, pendingToken: null });
      },

      fetchMe: async () => {
        try {
          const { data } = await adminApi.get('/auth/me');
          set({ admin: data });
        } catch {
          set({ admin: null });
        }
      },

      clearPending: () => set({ pendingToken: null }),
    }),
    { name: 'delfluent-admin-auth', partialize: (s) => ({ admin: s.admin }) }
  )
);
