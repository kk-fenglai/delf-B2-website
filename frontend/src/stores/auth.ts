import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { api } from '../api/client';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
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
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          set({ user: data.user });
        } finally {
          set({ loading: false });
        }
      },

      register: async (email, password, name) => {
        set({ loading: true });
        try {
          const { data } = await api.post('/auth/register', { email, password, name });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          set({ user: data.user });
        } finally {
          set({ loading: false });
        }
      },

      logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null });
      },

      fetchMe: async () => {
        try {
          const { data } = await api.get('/user/me');
          set({ user: data.user });
        } catch (_) { /* ignore */ }
      },
    }),
    { name: 'delfluent-auth', partialize: (s) => ({ user: s.user }) }
  )
);
