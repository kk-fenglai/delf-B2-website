// End-to-end smoke test for the Production Orale flow.
//
// Prerequisites:
//   1. Backend running at http://localhost:4000 (or BACKEND_URL).
//   2. Demo user `demo@delfluent.com` with password `demo1234` exists
//      (created by `prisma/seed.js`) and email_verified.
//   3. A SPEAKING question exists on a published exam set (also from seed.js).
//   4. A short test audio file present at `backend/scripts/fixtures/sample-fr.webm`
//      (≥ 3 s of French speech). If missing, the script skips the upload and
//      still verifies the routing / quota / submit code paths with a fabricated
//      Recording row that won't be transcribable — Oral row will just go
//      to error state, which is itself a useful smoke check.
//
// Usage:
//   cd backend
//   node scripts/smokeOral.js
//
// Optional env:
//   BACKEND_URL=http://localhost:4000
//   ORAL_FIXTURE=path/to/audio.webm
//   ORAL_DEMO_EMAIL=demo@delfluent.com
//   ORAL_DEMO_PASSWORD=demo1234

const fs = require('fs');
const path = require('path');

const BASE = process.env.BACKEND_URL || 'http://localhost:4000';
const EMAIL = process.env.ORAL_DEMO_EMAIL || 'demo@delfluent.com';
const PASSWORD = process.env.ORAL_DEMO_PASSWORD || 'demo1234';
const FIXTURE = process.env.ORAL_FIXTURE
  || path.join(__dirname, 'fixtures', 'sample-fr.webm');

let accessToken = '';

function line(label, ok, extra = '') {
  const tag = ok ? '✅' : '❌';
  console.log(`${tag} ${label}${extra ? '  [' + extra + ']' : ''}`);
  if (!ok) process.exitCode = 1;
}

async function call(method, p, body, isMultipart = false) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let payload;
  if (isMultipart) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${p}`, { method, headers, body: payload });
  let data = null;
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await r.json(); } catch { /* ignore */ }
  } else {
    data = await r.text();
  }
  return { status: r.status, data };
}

async function login() {
  const r = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  if (r.status !== 200 || !r.data?.accessToken) {
    console.error('login failed:', r);
    throw new Error('Login failed — make sure seed.js was run and the demo user is verified.');
  }
  accessToken = r.data.accessToken;
}

async function findOralExam() {
  const r = await call('GET', '/api/exams');
  if (r.status !== 200 || !Array.isArray(r.data?.sets)) {
    console.error('Could not list exams', r);
    return null;
  }
  // Prefer a free-preview PO exam to avoid the plan gate on a fresh demo run.
  const candidates = r.data.sets.filter((s) => (s.countsBySkill?.PO || 0) > 0);
  candidates.sort((a, b) => Number(b.isFreePreview) - Number(a.isFreePreview));
  return candidates[0] || null;
}

async function fetchExamWithPO(examId) {
  const r = await call('GET', `/api/exams/${examId}?skill=PO`);
  return r.status === 200 ? r.data : null;
}

async function uploadRecording({ questionId, sessionId, followUpId, file }) {
  const fd = new FormData();
  const buf = fs.readFileSync(file);
  fd.append('audio', new Blob([buf], { type: 'audio/webm' }), 'oral.webm');
  fd.append('questionId', questionId);
  fd.append('sessionId', sessionId);
  if (followUpId) fd.append('followUpId', followUpId);
  fd.append('durationSec', '5');
  return call('POST', '/api/user/recordings', fd, true);
}

(async () => {
  console.log(`=== Oral smoke test against ${BASE} ===\n`);

  // ---- 1. login ----
  await login();
  line('logged in as ' + EMAIL, !!accessToken);

  // ---- 2. quota endpoint shape ----
  const q = await call('GET', '/api/user/orals/quota');
  line('quota endpoint 200', q.status === 200, 'plan=' + q.data?.plan);
  line('quota.thresholds populated',
    !!(q.data?.thresholds && q.data.thresholds.totalMax === 25 && Array.isArray(q.data.thresholds.dimensions)));
  if (q.data?.monthlyCap === 0) {
    console.warn('⚠️  Demo user has monthlyCap=0 — upgrade to STANDARD or set ORAL_DEMO_EMAIL=ai@delfluent.com');
  }

  // ---- 3. find a PO exam ----
  const exam = await findOralExam();
  if (!exam) {
    line('PO exam available', false, 'run prisma/seed.js first');
    return;
  }
  line('found PO exam', true, exam.title);

  const examFull = await fetchExamWithPO(exam.id);
  const poQ = examFull?.questions?.find((qq) => qq.type === 'SPEAKING');
  if (!poQ) {
    line('exam has SPEAKING question', false);
    return;
  }
  line('exam has SPEAKING question + followUps', !!poQ && (poQ.followUps?.length || 0) >= 1,
    `followUps=${poQ.followUps?.length}`);

  // ---- 4. create a session ----
  const sessRes = await call('POST', '/api/sessions', { examSetId: exam.id, mode: 'PRACTICE' });
  line('session created', sessRes.status === 201, sessRes.data?.session?.id);
  const sessionId = sessRes.data?.session?.id;
  if (!sessionId) return;

  // ---- 5. upload monologue + 1 follow-up answer ----
  const haveFixture = fs.existsSync(FIXTURE);
  if (!haveFixture) {
    console.warn(`⚠️  Audio fixture missing at ${FIXTURE} — Oral will fail STT but route checks still run.`);
  }

  let recIds = [];
  if (haveFixture) {
    const monoUp = await uploadRecording({
      questionId: poQ.id,
      sessionId,
      followUpId: null,
      file: FIXTURE,
    });
    line('monologue upload 201', monoUp.status === 201, monoUp.data?.recording?.id);
    if (monoUp.data?.recording?.id) recIds.push(monoUp.data.recording.id);

    const fu = poQ.followUps[0];
    const fuUp = await uploadRecording({
      questionId: poQ.id,
      sessionId,
      followUpId: fu.id,
      file: FIXTURE,
    });
    line('follow-up upload 201', fuUp.status === 201);
    if (fuUp.data?.recording?.id) recIds.push(fuUp.data.recording.id);
  }

  // ---- 6. submit ----
  const submit = await call('POST', `/api/sessions/${sessionId}/submit`, {
    answers: [{ questionId: poQ.id, answer: { recordingIds: recIds } }],
  });
  line('submit 200', submit.status === 200);
  const oral = submit.data?.orals?.[0];
  line('Oral row created', !!oral?.oralId, 'status=' + oral?.status);

  if (!oral?.oralId) return;

  // ---- 7. poll oral status ----
  let final = oral;
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    await new Promise((r) => setTimeout(r, 2000));
    const got = await call('GET', `/api/user/orals/${oral.oralId}`);
    final = got.data?.oral;
    process.stdout.write(`  status=${final?.status} elapsed=${Math.round((Date.now() - start) / 1000)}s\r`);
    if (final?.status === 'done' || final?.status === 'error') break;
  }
  console.log('');
  line('oral reached terminal state', final?.status === 'done' || final?.status === 'error',
    `status=${final?.status} score=${final?.aiScore} err=${final?.errorMessage?.slice(0, 80) || ''}`);

  if (final?.status === 'done') {
    line('aiScore in [0,25]', final.aiScore >= 0 && final.aiScore <= 25);
    line('rubric has 9 dimensions', Array.isArray(final.rubric) && final.rubric.length === 9);
    line('transcript populated', !!final.transcriptCombined && final.transcriptCombined.length > 0);
  }

  console.log('\n=== Done ===');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
