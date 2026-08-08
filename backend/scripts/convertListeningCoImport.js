// Convert raw 听力_CO papers (CO-C*/CO-L*) into examImport bulkImportSchema shape.
// Source: DELF_B2_题库_按类型/题库_按类型/听力_CO/{短听力,长听力}/*.json
// Output: backend/scripts/_listening-import/<code>.import.json  (isPublished:false for manual review)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', 'DELF_B2_题库_按类型', '题库_按类型', '听力_CO');
const OUT = path.join(__dirname, '_listening-import');
fs.mkdirSync(OUT, { recursive: true });

const files = [
  ...fs.readdirSync(path.join(ROOT, '短听力')).map((f) => path.join(ROOT, '短听力', f)),
  ...fs.readdirSync(path.join(ROOT, '长听力')).map((f) => path.join(ROOT, '长听力', f)),
].filter((f) => f.endsWith('.json'));

const parsePoints = (p) => {
  const n = parseInt(String(p).match(/\d+/)?.[0] ?? '1', 10);
  return Math.min(25, Math.max(1, n));
};

const summary = [];
for (const file of files) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const code = d.meta.examPaperCode;            // CO-C1 / CO-L1
  const ep = d.examPaper;
  const docs = d.audioFiles;                    // ordered
  const isShort = ep.format === 'documents_courts';

  // map each question (in order) to a doc:
  //  - short: 4 docs, 8 q  -> 2 q per doc, in order
  //  - long: 1 doc -> all q
  const qPerDoc = isShort ? Math.ceil(d.questions.length / docs.length) : d.questions.length;

  const title = ep.title && ep.title.trim()
    ? `DELF B2 Compréhension de l’oral · ${ep.title.trim()}`
    : `DELF B2 Compréhension de l’oral · Documents courts (${code})`;

  const questions = d.questions.map((q, i) => {
    const doc = isShort ? docs[Math.min(docs.length - 1, Math.floor(i / qPerDoc))] : docs[0];
    return {
      skill: 'CO',
      type: 'SINGLE',
      order: i + 1,
      prompt: q.content,
      passage: doc.transcript || null,
      audioUrl: doc.ossUrl,
      explanation: q.explanation && q.explanation.trim() ? q.explanation.trim() : null,
      points: parsePoints(q.points),
      options: (q.options || []).map((o, j) => ({
        label: o.label,
        text: o.text,
        isCorrect: o.label === q.correctAnswer,
        order: j,
      })),
    };
  });

  const out = {
    title,
    year: null,
    description: `${isShort ? '短听力（documents courts）' : '长听力（document long）'} · 主题：${ep.theme || '综合'}。来源：DELF题库/听力_CO/${code}。`,
    isPublished: false,
    isFreePreview: false,
    questions,
  };

  const outFile = path.join(OUT, `${code}.import.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');

  // sanity: each question has exactly 1 correct option
  const bad = questions.filter((q) => q.options.filter((o) => o.isCorrect).length !== 1);
  summary.push(`${code}: ${questions.length}q, ${isShort ? docs.length : 1} doc(s), bad=${bad.length}  -> ${title}`);
}
console.log(summary.join('\n'));
console.log(`\nWrote ${files.length} files to ${OUT}`);
