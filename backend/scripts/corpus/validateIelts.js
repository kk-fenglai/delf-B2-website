// Validator for generated IELTS Academic import sets.
//
// Usage (standalone): node scripts/corpus/validateIelts.js "<file-or-dir>"
// Also exported as validateIeltsSet(obj) for inline use by generateIelts.js.

const fs = require('fs');
const path = require('path');

const TITLE_RE = /^IELTS (听力|阅读|写作|口语) · .+/;
const DATE_RE = /(20\d{2})|(\d{4}\s*年)/;
const TFNG_LABELS = ['TRUE', 'FALSE', 'NOT GIVEN'];

function validateIeltsSet(set) {
  const errors = [];
  const warnings = [];

  if (!set || typeof set !== 'object') return { ok: false, errors: ['not an object'], warnings };
  if (set.system !== 'IELTS') errors.push(`system must be "IELTS" (got ${JSON.stringify(set.system)})`);
  if (set.level !== 'IELTS_AC') errors.push(`level must be "IELTS_AC" (got ${JSON.stringify(set.level)})`);
  if (typeof set.title !== 'string' || !TITLE_RE.test(set.title)) {
    errors.push(`title format invalid: ${JSON.stringify(set.title)}`);
  }
  if (set.title && DATE_RE.test(set.title)) errors.push(`title contains a year: ${set.title}`);
  if (set.isPublished !== false) errors.push('isPublished must be false');
  if (!Array.isArray(set.questions) || set.questions.length === 0) {
    errors.push('questions empty');
    return { ok: errors.length === 0, errors, warnings };
  }

  set.questions.forEach((q, i) => {
    const tag = `q${q.order ?? i + 1}`;
    if (!q.prompt || typeof q.prompt !== 'string') errors.push(`${tag}: missing prompt`);
    if (!/^(LISTENING|READING|WRITING|SPEAKING)$/.test(q.skill)) {
      errors.push(`${tag}: bad skill ${q.skill}`);
    }
    const correct = (q.options || []).filter((o) => o.isCorrect);
    if (q.type === 'SINGLE') {
      if ((q.options || []).length !== 3) errors.push(`${tag}: SINGLE needs exactly 3 options`);
      if (correct.length !== 1) errors.push(`${tag}: SINGLE needs exactly 1 correct option`);
    } else if (q.type === 'TFNG') {
      const labels = (q.options || []).map((o) => o.text.toUpperCase());
      if (labels.length !== 3 || !TFNG_LABELS.every((l) => labels.includes(l))) {
        errors.push(`${tag}: TFNG needs exactly TRUE / FALSE / NOT GIVEN options`);
      }
      if (correct.length !== 1) errors.push(`${tag}: TFNG needs exactly 1 correct option`);
    } else if (q.type === 'COMPLETION' || q.type === 'SHORT_ANSWER') {
      if (correct.length < 1) errors.push(`${tag}: ${q.type} needs ≥1 correct option (accepted answers)`);
      for (const o of correct) {
        const words = o.text.trim().split(/\s+/).length;
        if (words > 3) warnings.push(`${tag}: answer "${o.text}" is ${words} words (IELTS max 3)`);
      }
    } else if (q.type === 'ESSAY') {
      if (!q.modelEssay) warnings.push(`${tag}: ESSAY without modelEssay`);
    } else if (q.type === 'SPEAKING') {
      if (!Array.isArray(q.followUps) || q.followUps.length === 0) {
        errors.push(`${tag}: SPEAKING needs followUps`);
      }
    } else {
      errors.push(`${tag}: type ${q.type} not allowed in IELTS sets`);
    }
    // Objective questions are 1 point each (raw → band conversion downstream).
    if (!/^(ESSAY|SPEAKING)$/.test(q.type) && q.points !== 1) {
      warnings.push(`${tag}: points ${q.points} (IELTS objective questions are 1 point each)`);
    }
  });

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
    console.error('Usage: node validateIelts.js <file-or-dir>');
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
    const { ok, errors, warnings } = validateIeltsSet(set);
    const name = path.basename(file);
    if (!ok) {
      bad++;
      console.log(`✗ ${name}\n   ERRORS: ${errors.join('; ')}`);
    } else {
      console.log(`✓ ${name}${warnings.length ? `  (warn: ${warnings.join('; ')})` : ''}`);
    }
  }
  console.log(`\n${files.length} file(s), ${bad} invalid.`);
  process.exit(bad ? 1 : 0);
}

module.exports = { validateIeltsSet };
