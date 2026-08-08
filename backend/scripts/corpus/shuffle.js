// Answer-position rebalancer for generated QCM sets.
//
// LLMs tend to park the correct option in slot B (observed ~70% here). This
// redistributes the correct answer across A/B/C in a round-robin so the key is
// near-uniform, relabels options, and rewrites the "Réponse : X" explanation.
//
// Usage (standalone, rewrites in place): node scripts/corpus/shuffle.js "<dir-or-file>"
// Exported as rebalanceSet(set, startCounter) for inline use by generators.

const fs = require('fs');
const path = require('path');
const LABELS = ['A', 'B', 'C'];

function rebalanceSet(set, startCounter = Math.floor(Math.random() * 3)) {
  let c = startCounter;
  for (const q of set.questions || []) {
    if (q.type !== 'SINGLE' || !Array.isArray(q.options) || q.options.length !== 3) continue;
    const correct = q.options.find((o) => o.isCorrect);
    const distractors = q.options.filter((o) => !o.isCorrect);
    if (!correct || distractors.length !== 2) continue;
    const target = c % 3;
    c++;
    const arranged = [];
    let di = 0;
    for (let p = 0; p < 3; p++) arranged[p] = p === target ? correct : distractors[di++];
    q.options = arranged.map((o, i) => ({ label: LABELS[i], text: o.text, isCorrect: !!o.isCorrect, order: i }));
    const newLabel = LABELS[target];
    const rest = String(q.explanation || '').replace(/^R[eé]ponse\s*:\s*[A-C]\s*\.?\s*/i, '').trim();
    q.explanation = rest ? `Réponse : ${newLabel}. ${rest}` : `Réponse : ${newLabel}`;
  }
  return set;
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) { console.error('Usage: node shuffle.js <dir-or-file>'); process.exit(1); }
  const st = fs.statSync(target);
  const files = st.isDirectory()
    ? fs.readdirSync(target).filter((f) => f.endsWith('.import.json')).map((f) => path.join(target, f))
    : [target];
  const dist = { A: 0, B: 0, C: 0 };
  for (const file of files) {
    const set = JSON.parse(fs.readFileSync(file, 'utf8'));
    rebalanceSet(set, Math.floor(Math.random() * 3));
    fs.writeFileSync(file, JSON.stringify(set, null, 2));
    for (const q of set.questions) {
      if (q.type === 'SINGLE') { const c = q.options.find((o) => o.isCorrect); if (c) dist[c.label]++; }
    }
  }
  console.log(`重平衡 ${files.length} 个文件完成。新答案分布 A/B/C:`, dist);
}

module.exports = { rebalanceSet };
