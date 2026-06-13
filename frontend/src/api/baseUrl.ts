/** Production Fly backend — skips Vercel /api proxy when used as VITE_API_ORIGIN. */
const PROD_API_ORIGIN = 'https://delf-b2-website.fly.dev';

/** Optional absolute API origin (no trailing slash). Empty → same-origin `/api`. */
export function apiOrigin(): string {
  const fromEnv = import.meta.env.VITE_API_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (import.meta.env.PROD) return PROD_API_ORIGIN;
  return '';
}

export function apiBaseUrl(): string {
  const origin = apiOrigin();
  return origin ? `${origin}/api` : '/api';
}
