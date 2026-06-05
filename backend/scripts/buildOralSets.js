// Build one exam-set import JSON per topic in oralData.js.
// Files are written to content/oral-sets/oral-NN.import.json, numbering from
// START (default 7, since oral-01..06 are the hand-made pilot).
const fs = require('fs');
const path = require('path');
const data = require('./oralData');

const START = Number(process.argv[2] || 7);
const YEAR = 2024;
const outDir = path.join(__dirname, '..', 'content', 'oral-sets');
fs.mkdirSync(outDir, { recursive: true });

const consigne = (title) =>
  `« ${title} »\n\nDégagez le problème soulevé par ce document, puis présentez votre opinion sur le sujet sous la forme d'un exposé personnel et construit. Vous pourrez ensuite débattre de votre point de vue avec l'examinateur.`;

const explanation = (src, verify) => {
  const base = src
    ? `Document d'appui — source : ${src}.`
    : `Document d'appui — source non identifiée sur l'original (à vérifier).`;
  const flag = verify ? ' Transcription partiellement reconstruite (filigrane sur l\'original) — à vérifier.' : '';
  return `${base}${flag} Les questions de relance (Partie 2 / débat) ont été générées par la plateforme à titre d'entraînement et ne font pas partie du sujet original.`;
};

let n = START;
const written = [];
for (const s of data) {
  if (!s.title || !s.passage || !Array.isArray(s.followUps) || s.followUps.length < 1) {
    throw new Error(`bad entry: ${s.title}`);
  }
  const set = {
    title: `DELF B2 口语 · ${s.title}`,
    year: YEAR,
    description: `Production Orale（PO）主题卡。${s.source ? 'Source : ' + s.source : 'Source non identifiée'}。`,
    isPublished: false,
    isFreePreview: false,
    questions: [
      {
        skill: 'PO',
        type: 'SPEAKING',
        order: 1,
        prompt: consigne(s.title),
        passage: s.passage,
        explanation: explanation(s.source, s.verify),
        points: 25,
        options: [],
        followUps: s.followUps.map((f, i) => ({ order: i, text: f.t, expectedAngle: f.a })),
      },
    ],
  };
  const file = path.join(outDir, `oral-${String(n).padStart(2, '0')}.import.json`);
  fs.writeFileSync(file, JSON.stringify(set, null, 2));
  written.push(`oral-${String(n).padStart(2, '0')}  | ${set.title}`);
  n += 1;
}

// validate everything just written
let bad = 0;
for (const s of data.map((_, i) => `oral-${String(START + i).padStart(2, '0')}.import.json`)) {
  const j = JSON.parse(fs.readFileSync(path.join(outDir, s), 'utf8'));
  const q = j.questions[0];
  const ok = j.questions.length === 1 && q.type === 'SPEAKING' && q.skill === 'PO'
    && q.options.length === 0 && q.followUps.length >= 1 && q.followUps.length <= 6
    && q.points >= 1 && q.points <= 25 && q.followUps.every((f) => f.text.length <= 500);
  if (!ok) { bad++; console.log('❌ ' + s); }
}
console.log(written.join('\n'));
console.log(`\n${bad ? '❌ ' + bad + ' 套异常' : '✅ 全部合规'} — 生成 ${written.length} 套（oral-${String(START).padStart(2, '0')}..oral-${String(n - 1).padStart(2, '0')}）`);
