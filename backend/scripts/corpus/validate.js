// Validator for generated DELF B2 import sets.
//
// Usage (standalone): node scripts/corpus/validate.js "<glob-or-file-or-dir>"
// Also exported as validateSet(obj) for inline use by generate.js.

const fs = require('fs');
const path = require('path');

const TITLE_RE = /^DELF B2 (听力|阅读|写作|口语) · .+/;
// Reject year/region in titles (CLAUDE.md rule 6 / sanitizeExamTitle intent).
const DATE_RE = /(20\d{2})|(\d{4}\s*年)|(法国场|法国场次|中国场)/;

function validateSet(set) {
  const errors = [];
  const warnings = [];

  if (!set || typeof set !== 'object') return { ok: false, errors: ['not an object'], warnings };
  if (typeof set.title !== 'string' || !TITLE_RE.test(set.title)) {
    errors.push(`title format invalid: ${JSON.stringify(set.title)}`);
  }
  if (set.title && DATE_RE.test(set.title)) errors.push(`title contains year/region: ${set.title}`);
  if (set.isPublished !== false) errors.push('isPublished must be false');
  if (!Array.isArray(set.questions) || set.questions.length === 0) {
    errors.push('questions empty');
    return { ok: errors.length === 0, errors, warnings };
  }

  const skill = set.questions[0].skill;
  let totalPoints = 0;
  set.questions.forEach((q, i) => {
    const tag = `q${q.order ?? i + 1}`;
    totalPoints += q.points || 0;
    if (!q.prompt || typeof q.prompt !== 'string') errors.push(`${tag}: missing prompt`);
    if (q.type === 'SINGLE') {
      if (!Array.isArray(q.options) || q.options.length !== 3) {
        errors.push(`${tag}: SINGLE needs exactly 3 options`);
      } else {
        const correct = q.options.filter((o) => o.isCorrect).length;
        if (correct !== 1) errors.push(`${tag}: must have exactly 1 correct option (got ${correct})`);
      }
      if (!/^(CO|CE)$/.test(q.skill)) errors.push(`${tag}: SINGLE expected for CO/CE`);
    } else if (q.type === 'ESSAY') {
      if (!q.modelEssay) warnings.push(`${tag}: ESSAY without modelEssay`);
    } else if (q.type === 'SPEAKING') {
      if (!Array.isArray(q.followUps) || q.followUps.length === 0) {
        warnings.push(`${tag}: SPEAKING without followUps`);
      }
    } else {
      errors.push(`${tag}: unknown type ${q.type}`);
    }
  });

  // Points sanity: CO/CE target /25; PE/PO single question = 25.
  if (skill === 'CO' || skill === 'CE') {
    if (totalPoints < 20 || totalPoints > 30) warnings.push(`points total ${totalPoints} (target ≈25)`);
  } else if (totalPoints !== 25) {
    warnings.push(`points total ${totalPoints} (expected 25)`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

function collectFiles(target) {
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    return fs.readdirSync(target).filter((f) => f.endsWith('.import.json')).map((f) => path.join(target, f));
  }
  return [target];
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node validate.js <file-or-dir>');
    process.exit(1);
  }
  const files = collectFiles(target);
  let bad = 0;
  for (const file of files) {
    let set;
    try {
      set = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.log(`✗ ${path.basename(file)}: invalid JSON — ${e.message}`);
      bad++;
      continue;
    }
    const { ok, errors, warnings } = validateSet(set);
    const name = path.basename(file);
    if (!ok) {
      bad++;
      console.log(`✗ ${name}\n   ERREURS: ${errors.join('; ')}`);
    } else {
      console.log(`✓ ${name}${warnings.length ? `  (warn: ${warnings.join('; ')})` : ''}`);
    }
  }
  console.log(`\n${files.length} fichier(s), ${bad} invalide(s).`);
  process.exit(bad ? 1 : 0);
}

module.exports = { validateSet };
