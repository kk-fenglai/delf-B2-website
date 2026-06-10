/* eslint-disable no-console */
/**
 * Fill mock-sets/*.import.json with CE / PE / PO from existing question banks.
 *
 * Targets per set: CE=20, PE=1, PO=1
 * Keeps existing CO + parsed CE/PE/PO; randomly samples from pools to fill gaps.
 *
 * Usage:
 *   cd backend
 *   node scripts/fillMockSetsCePePo.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const MOCK_DIR = path.join(__dirname, '..', 'content', 'mock-sets');
const READING_DIR = path.join(REPO_ROOT, 'delf_B2_reading');
const PE_DIR = path.join(__dirname, '..', 'content', 'pre_set');
const PO_DIR = path.join(__dirname, '..', 'content', 'oral-sets');

const TARGET = { CE: 20, PE: 1, PO: 1 };
const FILL_NOTE = '（套题补齐：随机选自平台题库）';

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadJsonFiles(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => pattern.test(f))
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        return { file: f, data };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function cloneQuestion(q) {
  const copy = JSON.parse(JSON.stringify(q));
  if (copy.explanation && !copy.explanation.includes(FILL_NOTE)) {
    copy.explanation = `${copy.explanation} ${FILL_NOTE}`;
  } else if (!copy.explanation) {
    copy.explanation = FILL_NOTE.trim();
  }
  return copy;
}

function questionKey(q) {
  return `${q.skill}|${(q.prompt || '').slice(0, 120)}`;
}

function buildCePool() {
  const pools = [];
  const readingImports = loadJsonFiles(READING_DIR, /\.import\.json$/i);
  const readingJson = loadJsonFiles(READING_DIR, /^CE_.*\.json$/i);

  for (const { file, data } of [...readingImports, ...readingJson]) {
    const qs = (data.questions || []).filter((q) => q.skill === 'CE');
    if (qs.length) pools.push({ source: file, questions: qs.map(cloneQuestion) });
  }
  return pools;
}

function buildPePool() {
  const items = [];
  for (const { file, data } of loadJsonFiles(PE_DIR, /^b2-pe-.*\.json$/i)) {
    const q = (data.questions || []).find((x) => x.skill === 'PE');
    if (q) items.push({ source: file, question: cloneQuestion(q) });
  }
  const peExample = path.join(READING_DIR, 'PE_example_reseaux_sociaux.import.json');
  if (fs.existsSync(peExample)) {
    const data = JSON.parse(fs.readFileSync(peExample, 'utf8'));
    const q = (data.questions || []).find((x) => x.skill === 'PE');
    if (q) items.push({ source: 'PE_example_reseaux_sociaux.import.json', question: cloneQuestion(q) });
  }
  return items;
}

function buildPoPool() {
  const items = [];
  for (const { file, data } of loadJsonFiles(PO_DIR, /^oral-\d+\.import\.json$/i)) {
    const q = (data.questions || []).find((x) => x.skill === 'PO' && x.type === 'SPEAKING');
    if (q && Array.isArray(q.followUps) && q.followUps.length) {
      items.push({ source: file, question: cloneQuestion(q) });
    }
  }
  return items;
}

function pickCeQuestions(existing, deficit, cePools, seed) {
  if (deficit <= 0) return [];

  const used = new Set(existing.map(questionKey));
  const shuffledPools = seededShuffle(cePools, seed);
  const picked = [];

  for (const pool of shuffledPools) {
    if (picked.length >= deficit) break;
    const shuffledQs = seededShuffle(pool.questions, seed + pool.source.length);
    for (const q of shuffledQs) {
      const key = questionKey(q);
      if (used.has(key)) continue;
      used.add(key);
      picked.push({
        ...q,
        explanation: q.explanation || `${FILL_NOTE.trim()} 来源：${pool.source}`,
      });
      if (picked.length >= deficit) break;
    }
  }

  if (picked.length < deficit) {
    console.warn(`  ⚠ CE pool exhausted, got ${picked.length}/${deficit}`);
  }
  return picked;
}

function pickOne(pool, seed, usedKeys) {
  const shuffled = seededShuffle(pool, seed);
  for (const item of shuffled) {
    const key = questionKey(item.question);
    if (usedKeys.has(key)) continue;
    return item;
  }
  return shuffled[0] || null;
}

function fillMockSet(setNum, mockData, cePools, pePool, poPool) {
  const seed = setNum * 7919;
  const co = mockData.questions.filter((q) => q.skill === 'CO');
  let ce = mockData.questions.filter((q) => q.skill === 'CE');
  let pe = mockData.questions.filter((q) => q.skill === 'PE');
  let po = mockData.questions.filter((q) => q.skill === 'PO');

  const usedKeys = new Set(mockData.questions.map(questionKey));
  const changes = { ce: 0, pe: 0, po: 0 };

  const ceDeficit = TARGET.CE - ce.length;
  if (ceDeficit > 0) {
    const added = pickCeQuestions(ce, ceDeficit, cePools, seed);
    ce = ce.concat(added);
    changes.ce = added.length;
  }

  if (pe.length < TARGET.PE) {
    const item = pickOne(pePool, seed + 1, usedKeys);
    if (item) {
      pe = [item.question];
      changes.pe = 1;
      usedKeys.add(questionKey(item.question));
    }
  }

  if (po.length < TARGET.PO) {
    const item = pickOne(poPool, seed + 2, usedKeys);
    if (item) {
      po = [item.question];
      changes.po = 1;
    }
  }

  const all = [...co, ...ce, ...pe, ...po].map((q, i) => ({ ...q, order: i + 1 }));

  const parts = [];
  if (changes.ce) parts.push(`阅读+${changes.ce}`);
  if (changes.pe) parts.push('写作+1');
  if (changes.po) parts.push('口语+1');

  const descBase = mockData.description?.replace(/\s*⚠[^。]*。?/g, '').trim() || '';
  const fillNote = parts.length ? ` 已补齐：${parts.join('、')}。` : '';

  return {
    ...mockData,
    description: `${descBase}${fillNote}`.trim(),
    questions: all,
    _fill: {
      co: co.length,
      ce: ce.length,
      pe: pe.length,
      po: po.length,
      changes,
    },
  };
}

function main() {
  const cePools = buildCePool();
  const pePool = buildPePool();
  const poPool = buildPoPool();

  const ceTotal = cePools.reduce((n, p) => n + p.questions.length, 0);
  console.log(`Pools: CE ${ceTotal} questions (${cePools.length} files), PE ${pePool.length}, PO ${poPool.length}`);

  if (!cePools.length || !pePool.length || !poPool.length) {
    console.error('Missing question pools.');
    process.exit(1);
  }

  const files = fs.readdirSync(MOCK_DIR).filter((f) => /^mock-\d+\.import\.json$/.test(f)).sort();
  const summary = [];

  for (const file of files) {
    const setNum = parseInt(file.match(/\d+/)[0], 10);
    const filePath = path.join(MOCK_DIR, file);
    const mockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const { _fill, ...exportData } = fillMockSet(setNum, mockData, cePools, pePool, poPool);

    fs.writeFileSync(filePath, `${JSON.stringify(exportData, null, 2)}\n`, 'utf8');
    summary.push({ set: setNum, ..._fill });
    const c = _fill.changes;
    const tag = [c.ce && `CE+${c.ce}`, c.pe && 'PE+1', c.po && 'PO+1'].filter(Boolean).join(' ') || '—';
    console.log(`✓ 第${setNum}套  CO=${_fill.co} CE=${_fill.ce} PE=${_fill.pe} PO=${_fill.po}  ${tag}`);
  }

  fs.writeFileSync(path.join(MOCK_DIR, '_fill-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log('\nDone.');
}

main();
