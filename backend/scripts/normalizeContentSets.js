// Standardize content/*-sets source JSON: learner-visible titles (rule 6) and
// the top-level field set. Filenames are left untouched — each section's
// importer globs a specific pattern (e.g. fillMockSetsCePePo expects
// pre_set/b2-pe-*.json), so renaming would break those contracts.
//
// Usage: cd backend && node scripts/normalizeContentSets.js [--dry-run]

const fs = require('fs');
const path = require('path');
const { sanitizeExamTitle } = require('../src/utils/examTitle');

const dryRun = process.argv.includes('--dry-run');
const CONTENT = path.join(__dirname, '..', 'content');

// section dir -> filename predicate (mirrors each importer's own glob)
const SECTIONS = [
  { dir: 'co-sets', match: (f) => f.endsWith('.import.json') },
  { dir: 'mock-sets', match: (f) => f.endsWith('.import.json') },
  { dir: 'oral-sets', match: (f) => /^oral-\d+\.import\.json$/.test(f) },
  { dir: 'pre_set', match: (f) => /^b2-pe-.*\.json$/.test(f) },
];

// Canonical top-level order shared by all sections.
const TOP_ORDER = ['title', 'year', 'description', 'isPublished', 'isFreePreview', 'questions'];

function reorder(data) {
  const out = {};
  for (const k of TOP_ORDER) if (k in data) out[k] = data[k];
  for (const k of Object.keys(data)) if (!(k in out)) out[k] = data[k]; // keep any extras
  return out;
}

let changed = 0;
const report = [];

for (const { dir, match } of SECTIONS) {
  const abs = path.join(CONTENT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (f.startsWith('_') || !match(f)) continue;
    const p = path.join(abs, f);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const changes = [];

    const newTitle = sanitizeExamTitle(data.title);
    if (newTitle !== data.title) {
      changes.push(`title: ${JSON.stringify(data.title)} -> ${JSON.stringify(newTitle)}`);
      data.title = newTitle;
    }
    if (!('isPublished' in data)) {
      data.isPublished = false;
      changes.push('added isPublished:false');
    }

    if (changes.length) {
      changed += 1;
      report.push(`${dir}/${f}\n    ${changes.join('\n    ')}`);
      if (!dryRun) {
        fs.writeFileSync(p, `${JSON.stringify(reorder(data), null, 2)}\n`, 'utf8');
      }
    }
  }
}

console.log(report.join('\n') || 'No changes.');
console.log(`\n${dryRun ? '[dry-run] would change' : 'changed'} ${changed} files.`);
