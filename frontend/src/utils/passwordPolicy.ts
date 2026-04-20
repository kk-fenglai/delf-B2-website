// Frontend mirror of backend/src/utils/passwordPolicy.js. Keep rules in sync.
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

export interface PasswordValidation {
  ok: boolean;
  reasons: string[];
  strength: 0 | 1 | 2 | 3 | 4;
}

export function validatePassword(password: string): PasswordValidation {
  const p = String(password || '');
  const reasons: string[] = [];
  if (p.length < MIN_LENGTH) reasons.push(`至少 ${MIN_LENGTH} 位`);
  const cats = categoriesMatched(p);
  if (cats < 3) reasons.push('须包含小写/大写/数字/符号中至少 3 类');
  if (COMMON_WEAK.has(p.toLowerCase())) reasons.push('密码过于常见，请更换');

  let strength: 0 | 1 | 2 | 3 | 4 = 0;
  if (p.length >= 8) strength = 1;
  if (p.length >= 10 && cats >= 2) strength = 2;
  if (p.length >= 12 && cats >= 3) strength = 3;
  if (p.length >= 14 && cats >= 4) strength = 4;
  if (COMMON_WEAK.has(p.toLowerCase())) strength = (Math.min(strength, 1) as 0 | 1);

  return { ok: reasons.length === 0, reasons, strength };
}

export const PASSWORD_MIN_LENGTH = MIN_LENGTH;
