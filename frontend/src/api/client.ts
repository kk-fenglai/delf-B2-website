import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const ACCESS_KEY = 'accessToken';
export const REFRESH_KEY = 'refreshToken';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- Refresh-token rotation with concurrency coalescing --- //
// A single in-flight refresh; all concurrent 401s wait on the same promise.
let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;
  try {
    const { data } = await axios.post('/api/auth/refresh', { refreshToken: refresh });
    if (data?.accessToken) localStorage.setItem(ACCESS_KEY, data.accessToken);
    if (data?.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
    return data?.accessToken || null;
  } catch {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    return null;
  }
}

function clearAndRedirectToLogin() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  if (
    !window.location.pathname.startsWith('/login') &&
    !window.location.pathname.startsWith('/register') &&
    !window.location.pathname.startsWith('/forgot-password') &&
    !window.location.pathname.startsWith('/reset-password') &&
    !window.location.pathname.startsWith('/verify-email') &&
    window.location.pathname !== '/'
  ) {
    window.location.href = '/login';
  }
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = err.response?.status;

    // Only try to refresh on a 401 that we haven't yet retried, and skip
    // refresh-token endpoints themselves to avoid loops.
    if (
      status === 401 &&
      original &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retried = true;
      if (!refreshInFlight) refreshInFlight = doRefresh();
      const newAccess = await refreshInFlight;
      refreshInFlight = null;
      if (newAccess) {
        original.headers = original.headers || {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
      clearAndRedirectToLogin();
    }

    return Promise.reject(err);
  }
);
