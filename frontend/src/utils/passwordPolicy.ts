// Frontend mirror of backend/src/utils/passwordPolicy.js. Keep rules in sync.
import i18n from '../i18n';

const MIN_LENGTH = 10;

const COMMON_WEAK = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword',
  'admin', 'admin123', 'administrator', 'admin1234',
  'qwerty', 'qwerty123', 'qwertyuiop', 'qwerty1234',
  '12345678', '123456789', '1234567890', '0123456789', '11111111', '00000000',
  'abc12345', 'abcd1234', 'abcd12345', 'abcdefgh',
  'letmein', 'welcome', 'welcome123', 'iloveyou',
  'monkey', 'dragon', 'master', 'princess', 'superman', 'batman',
  'football', 'baseball', 'starwars',
  'sunshine', 'trustno1', 'passw0rd1',
  'azerty', 'azerty123',
  'delfluent', 'delfluent123', 'changeme', 'changeme123',
  'motdepasse', 'bonjour123',
]);

function categoriesMatched(pwd: string): number {
  let n = 0;
  if (/[a-z]/.test(pwd)) n++;
  if (/[A-Z]/.test(pwd)) n++;
  if (/[0-9]/.test(pwd)) n++;
  if (/[^A-Za-z0-9]/.test(pwd)) n++;
  return n;
}

// Stable reason codes — translate in the UI via i18n key `auth.passwordPolicy.<code>`.
export type PasswordReason = 'minLength' | 'categories' | 'common';

export interface PasswordValidation {
  ok: boolean;
  reasons: PasswordReason[];
  strength: 0 | 1 | 2 | 3 | 4;
}

export function validatePassword(password: string): PasswordValidation {
  const p = String(password || '');
  const reasons: PasswordReason[] = [];
  if (p.length < MIN_LENGTH) reasons.push('minLength');
  const cats = categoriesMatched(p);
  if (cats < 3) reasons.push('categories');
  if (COMMON_WEAK.has(p.toLowerCase())) reasons.push('common');

  let strength: 0 | 1 | 2 | 3 | 4 = 0;
  if (p.length >= 8) strength = 1;
  if (p.length >= 10 && cats >= 2) strength = 2;
  if (p.length >= 12 && cats >= 3) strength = 3;
  if (p.length >= 14 && cats >= 4) strength = 4;
  if (COMMON_WEAK.has(p.toLowerCase())) strength = (Math.min(strength, 1) as 0 | 1);

  return { ok: reasons.length === 0, reasons, strength };
}

export const PASSWORD_MIN_LENGTH = MIN_LENGTH;

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Translate validation reason codes into a single localized message.
 * Pass the component's `t` (from useTranslation); when omitted, falls back to
 * the global i18n instance so non-translated call sites still follow UI language.
 */
export function formatPasswordReasons(reasons: PasswordReason[], t?: TFn): string {
  const translate: TFn = t ?? ((key, opts) => i18n.t(key, opts) as string);
  return reasons
    .map((r) => translate(`auth.passwordPolicy.${r}`, { min: MIN_LENGTH }))
    .join(translate('auth.passwordPolicy.separator'));
}
