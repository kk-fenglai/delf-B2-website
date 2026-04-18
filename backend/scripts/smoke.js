// Smoke test the new auth flow against a running backend at http://localhost:4000
// Usage: unset DATABASE_URL first; start the server; then `node scripts/smoke.js`.
const crypto = require('crypto');

async function call(method, path, body) {
  const r = await fetch(`http://localhost:4000${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data; try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
}

function line(label, ok, extra = '') {
  const tag = ok ? '✅' : '❌';
  console.log(`${tag} ${label}${extra ? '  [' + extra + ']' : ''}`);
}

(async () => {
  const email = `smoke+${crypto.randomBytes(4).toString('hex')}@test.local`;
  const strongPwd = 'Sm0ke!Test@2026';
  console.log('=== register with weak pwd (should 400) ===');
  let r = await call('POST', '/api/auth/register', { email, password: 'abc12345' });
  line('weak pwd rejected', r.status === 400);

  console.log('\n=== register with strong pwd (should 201) ===');
  r = await call('POST', '/api/auth/register', { email, password: strongPwd });
  line('register ok', r.status === 201 && r.data?.emailVerificationRequired);

  console.log('\n=== login before verify (should 403 EMAIL_NOT_VERIFIED) ===');
  r = await call('POST', '/api/auth/login', { email, password: strongPwd });
  line('blocks unverified login', r.status === 403 && r.data?.code === 'EMAIL_NOT_VERIFIED');

  // Pull the verification token directly from DB
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { email } });
  const verifyRow = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id }, orderBy: { createdAt: 'desc' },
  });
  // The raw token isn't stored; we stored sha256. Trigger resend which we can intercept
  // — instead, recreate the flow: generate a fresh known token by calling resend,
  // then read the most recent console dump.
  // Simpler: set emailVerified = true directly for test purposes.
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true, emailVerifiedAt: new Date() } });
  line('flipped emailVerified=true for test via DB', true);

  console.log('\n=== login after verify ===');
  r = await call('POST', '/api/auth/login', { email, password: strongPwd });
  line('login succeeds', r.status === 200 && r.data.refreshToken);
  const refresh1 = r.data?.refreshToken;

  console.log('\n=== rotate refresh ===');
  r = await call('POST', '/api/auth/refresh', { refreshToken: refresh1 });
  line('rotation returns new refresh', r.status === 200 && r.data.refreshToken && r.data.refreshToken !== refresh1);
  const refresh2 = r.data?.refreshToken;

  console.log('\n=== replay OLD refresh (reuse detection) ===');
  r = await call('POST', '/api/auth/refresh', { refreshToken: refresh1 });
  line('old refresh rejected', r.status === 401, 'code=' + r.data?.code);

  console.log('\n=== NEW refresh after chain burned ===');
  r = await call('POST', '/api/auth/refresh', { refreshToken: refresh2 });
  line('new refresh ALSO revoked (chain burned)', r.status === 401);

  console.log('\n=== logout (revoke) then re-login ===');
  r = await call('POST', '/api/auth/login', { email, password: strongPwd });
  const ref3 = r.data?.refreshToken;
  r = await call('POST', '/api/auth/logout', { refreshToken: ref3 });
  line('logout ok', r.status === 200);
  r = await call('POST', '/api/auth/refresh', { refreshToken: ref3 });
  line('refresh after logout rejected', r.status === 401, 'got=' + r.status + ' body=' + JSON.stringify(r.data));

  console.log('\n=== cleanup ===');
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
  console.log('done');
})();
