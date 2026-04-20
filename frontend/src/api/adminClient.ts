import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const ADMIN_TOKEN_KEY = 'delfluent-admin-access';
export const ADMIN_REFRESH_KEY = 'delfluent-admin-refresh';

export const adminApi = axios.create({
  baseURL: '/api/admin',
  timeout: 15000,
});

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = localStorage.getItem(ADMIN_REFRESH_KEY);
  if (!refresh) return null;
  try {
    const { data } = await axios.post('/api/admin/auth/refresh', { refreshToken: refresh });
    if (data?.accessToken) localStorage.setItem(ADMIN_TOKEN_KEY, data.accessToken);
    if (data?.refreshToken) localStorage.setItem(ADMIN_REFRESH_KEY, data.refreshToken);
    return data?.accessToken || null;
  } catch {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_REFRESH_KEY);
    return null;
  }
}

function clearAndRedirect() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_REFRESH_KEY);
  if (!window.location.pathname.startsWith('/admin/login')) {
    window.location.href = '/admin/login';
  }
}

adminApi.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = err.response?.status;

    if (
      status === 401 &&
      original &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/verify-2fa')
    ) {
      original._retried = true;
      if (!refreshInFlight) refreshInFlight = doRefresh();
      const newAccess = await refreshInFlight;
      refreshInFlight = null;
      if (newAccess) {
        original.headers = original.headers || {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newAccess}`;
        return adminApi(original);
      }
      clearAndRedirect();
    }
    // 403 is a deliberate denial (wrong role / needs reconfirm) — don't auto-refresh.

    return Promise.reject(err);
  }
);
