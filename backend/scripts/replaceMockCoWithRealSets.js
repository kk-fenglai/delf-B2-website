// Replace the CO (listening) section of mock-01..05 with our real-exam listening
// sets (long + short pair), which carry transcript + answers + audioUrl. The
// existing mock CO questions had transcript text but no audio, so they are
// dropped. CE / PE / PO are kept untouched. Order is renumbered across the set.
//
// Idempotent: re-running rebuilds CO from co-sets again (non-CO is preserved by
// filtering out skill==CO before prepending the fresh listening questions).
//
// Usage: cd backend && node scripts/replaceMockCoWithRealSets.js [--dry-run]

const fs = require('fs');
const path = require('path');

const dryRun = process.argv.includes('--dry-run');
const CONTENT = path.join(__dirname, '..', 'content');
const MOCK_DIR = path.join(CONTENT, 'mock-sets');
const CO_DIR = path.join(CONTENT, 'co-sets');

// mock number -> [long slug, short slug]
const PAIRING = {
  1: ['long-2021-05-cn', 'short-2024-01-fr'],
  2: ['long-2021-11-cn', 'short-2023-11-cn'],
  3: ['long-2022-03-cn', 'short-2021-11-cn'],
  4: ['long-2023-11-cn', 'short-2024-01-fr'],
  5: ['long-2024-03-fr', 'short-2023-11-cn'],
};

function loadCo(slug) {
  const p = path.join(CO_DIR, `${slug}.import.json`);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return (d.questions || []).filter((q) => q.skill === 'CO');
}

const report = [];

for (const [num, [longSlug, shortSlug]] of Object.entries(PAIRING)) {
  const mockPath = path.join(MOCK_DIR, `mock-${String(num).padStart(2, '0')}.import.json`);
  const mock = JSON.parse(fs.readFileSync(mockPath, 'utf8'));

  const newCo = [...loadCo(longSlug), ...loadCo(shortSlug)];
  const nonCo = (mock.questions || []).filter((q) => q.skill !== 'CO');
  const combined = [...newCo, ...nonCo].map((q, i) => ({ ...q, order: i + 1 }));

  mock.questions = combined;

  const counts = combined.reduce((a, q) => ((a[q.skill] = (a[q.skill] || 0) + 1), a), {});
  report.push(
    `mock-${String(num).padStart(2, '0')}: CO<-${longSlug}(${loadCo(longSlug).length})+${shortSlug}(${loadCo(shortSlug).length})  =>  CO=${counts.CO} CE=${counts.CE} PE=${counts.PE} PO=${counts.PO} (total ${combined.length})`
  );

  if (!dryRun) {
    fs.writeFileSync(mockPath, `${JSON.stringify(mock, null, 2)}\n`, 'utf8');
  }
}

console.log(report.join('\n'));
console.log(`\n${dryRun ? '[dry-run] 将修改' : '已修改'} ${Object.keys(PAIRING).length} 套 mock。`);
