/* eslint-disable no-console */
/**
 * Parse delfB2_exam PDFs → mock-sets/*.import.json for admin bulk import.
 *
 * Usage:
 *   cd backend
 *   node scripts/parseDelfB2MockExams.js           # all sets
 *   node scripts/parseDelfB2MockExams.js 1           # set number only
 *
 * Output: backend/content/mock-sets/mock-NN.import.json
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const REPO_ROOT = path.join(__dirname, '..', '..');
const EXAM_DIR = path.join(REPO_ROOT, 'delfB2_exam');
const OUT_DIR = path.join(__dirname, '..', 'content', 'mock-sets');

const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function chineseToNumber(raw) {
  const s = raw.trim();
  if (s === '十') return 10;
  if (s.length === 1) return CN_DIGIT[s] || null;
  if (s.length === 2 && s[0] === '十') return 10 + (CN_DIGIT[s[1]] || 0); // 十一→11, 十八→18? no 十八 is 3 chars
  if (s.length === 3 && s[1] === '十') return (CN_DIGIT[s[0]] || 0) * 10 + (CN_DIGIT[s[2]] || 0); // 十五→15, 十八→18
  return null;
}

function folderToSetNum(folderName) {
  const m = folderName.match(/第([一二三四五六七八九十]+)套/);
  if (!m) return null;
  return chineseToNumber(m[1]);
}

function normalizeText(t) {
  return String(t || '')
    .replace(/\r/g, '\n')
    .replace(/-- \d+ of \d+ --/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function pdfText(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  return normalizeText(result.text);
}

function findFile(dir, pattern) {
  return fs.readdirSync(dir).find((f) => pattern.test(f));
}

// ---------------------------------------------------------------------------
// Answer PDF
// ---------------------------------------------------------------------------
function parseAnswerSections(text) {
  const sections = [];
  const headerRe = /(?:^|\n)(听力|阅读)\s*[•\s]*(\d)\s*\n/g;
  let match;
  const hits = [];
  while ((match = headerRe.exec(text)) !== null) {
    hits.push({
      skill: match[1] === '听力' ? 'CO' : 'CE',
      doc: parseInt(match[2], 10),
      start: match.index + match[0].length,
    });
  }
  for (let i = 0; i < hits.length; i += 1) {
    const chunk = text.slice(hits[i].start, hits[i + 1]?.start ?? text.length).trim();
    sections.push({
      skill: hits[i].skill,
      doc: hits[i].doc,
      key: `${hits[i].skill}${hits[i].doc}`,
      answers: parseAnswerChunk(chunk),
    });
  }
  return sections;
}

function parseAnswerChunk(chunk) {
  const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
  const answers = new Map();
  let currentNum = null;

  for (const line of lines) {
    let m = line.match(/^(\d{1,2})\s+([aAbB])\s+(正确|错误|Vrai|Faux|vrai|faux)/);
    if (m) {
      const key = `${m[1]}${m[2].toLowerCase()}`;
      const vf = /正确|Vrai|vrai/i.test(m[3]) ? 'Vrai' : 'Faux';
      const justMatch = line.match(/<([^>]+)>/);
      answers.set(key, { type: 'VFJ', value: vf, justification: justMatch?.[1]?.trim() || null });
      continue;
    }

    m = line.match(/^(\d{1,2})\s+(正确|错误|Vrai|Faux|vrai|faux)/);
    if (m) {
      const vf = /正确|Vrai|vrai/i.test(m[2]) ? 'Vrai' : 'Faux';
      const justMatch = line.match(/<([^>]+)>/);
      answers.set(String(m[1]), { type: 'VFJ', value: vf, justification: justMatch?.[1]?.trim() || null });
      continue;
    }

    m = line.match(/^(\d{1,2})\s+([aAbB])\s+(.+)/);
    if (m) {
      answers.set(`${m[1]}${m[2].toLowerCase()}`, { type: 'OPEN', value: m[3].trim() });
      continue;
    }

    m = line.match(/^(\d{1,2})\s+([A-Da-d]|.+)/);
    if (m) {
      currentNum = m[1];
      const rest = m[2].trim();
      if (/^[A-Da-d]$/.test(rest)) {
        answers.set(currentNum, { type: 'MCQ', value: rest.toUpperCase() });
      } else {
        answers.set(currentNum, { type: 'OPEN', value: rest });
      }
      continue;
    }

    if (currentNum && answers.has(currentNum) && answers.get(currentNum).type === 'OPEN') {
      const prev = answers.get(currentNum);
      answers.set(currentNum, { type: 'OPEN', value: `${prev.value} ${line}`.trim() });
    }
  }
  return answers;
}

function answerKeysForSection(answers) {
  const keys = [];
  for (const key of answers.keys()) {
    keys.push(String(key));
  }
  return keys.sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

// ---------------------------------------------------------------------------
// Question extraction
// ---------------------------------------------------------------------------
const Q_START_RE = /\n(\d{1,2})[\s\t]+([A-ZÀ-Ü"«(#])/g;
const VF_NUM_RE = /\n(\d{1,2})\s*\n\s*[aAbB]\s*[).]/g;

function findQuestionStarts(text) {
  const starts = [];
  const seen = new Set();
  let m;

  while ((m = Q_START_RE.exec(text)) !== null) {
    if (!seen.has(m.index)) {
      seen.add(m.index);
      starts.push({ num: parseInt(m[1], 10), index: m.index });
    }
  }

  // Vrai/Faux blocks: number alone before a) / b) sub-items
  VF_NUM_RE.lastIndex = 0;
  while ((m = VF_NUM_RE.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 400), m.index);
    if (!/Vrai ou faux/i.test(before)) continue;
    if (!seen.has(m.index)) {
      seen.add(m.index);
      starts.push({ num: parseInt(m[1], 10), index: m.index });
    }
  }

  starts.sort((a, b) => a.index - b.index);
  return starts;
}

function sectionBlockCount(answers) {
  const baseNums = new Set();
  for (const key of answers.keys()) {
    baseNums.add(String(key).replace(/[ab]$/, ''));
  }
  return baseNums.size;
}

function extractQuestionBlocks(text) {
  const starts = findQuestionStarts(text);
  return starts.map((s, i) => {
    const end = starts[i + 1]?.index ?? text.length;
    const raw = text.slice(s.index, end).trim();
    return { num: s.num, index: s.index, raw, parsed: parseQuestionBlock(raw) };
  });
}

function parseQuestionBlock(raw) {
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l && !/^--/.test(l));
  const promptParts = [];
  const optionItems = [];
  let isVfBlock = false;
  let vfStatement = null;
  let hasSubItems = false;
  let afterVfHeader = false;
  let qNumOnly = false;
  let inOptions = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^Vrai ou faux/i.test(line)) {
      isVfBlock = true;
      afterVfHeader = true;
      continue;
    }
    if (/^Justification\s*:/i.test(line)) continue;
    if (/^VRAI\s+FAUX/i.test(line)) continue;
    if (/^X\s*$/.test(line)) continue;
    if (/^#Vrai|^#Faux/i.test(line)) continue;
    if (/^!\s*/.test(line)) continue;

    const optBang = line.match(/^([A-D])\s*!\s*(.+)/);
    if (optBang) {
      optionItems.push({ label: optBang[1], text: optBang[2].trim() });
      continue;
    }

    const qStart = line.match(/^(\d{1,2})\s+(.+)/);
    if (qStart && promptParts.length === 0 && !isVfBlock) {
      promptParts.push(qStart[2]);
      continue;
    }

    if (/^(\d{1,2})$/.test(line) && isVfBlock && !qNumOnly) {
      qNumOnly = true;
      continue;
    }

    if (/^[aAbB]\s*[).]/.test(line)) {
      hasSubItems = true;
      if (isVfBlock && !vfStatement) vfStatement = line.replace(/^[aAbB]\s*[).]\s*/, '');
      promptParts.push(line);
      continue;
    }

    if (/^[A-D]$/.test(line)) {
      const texts = [];
      let j = i + 1;
      while (j < lines.length && !/^[A-D]$/.test(lines[j]) && !/^\d{1,2}\s+/.test(lines[j])) {
        if (/^Vrai ou faux/i.test(lines[j])) break;
        if (/^听力|^阅读|^写作/.test(lines[j])) break;
        texts.push(lines[j]);
        j += 1;
      }
      optionItems.push({ label: line, text: texts.join(' ').trim() });
      i = j - 1;
      continue;
    }

    // Inline MCQ: option texts listed before A/B/C labels on separate lines
    if (/^[a-zà-ü]/i.test(line) && !inOptions && promptParts.length > 0) {
      const pending = [];
      let j = i;
      while (j < lines.length && /^[a-zà-ü"'«]/i.test(lines[j])) {
        pending.push(lines[j]);
        j += 1;
      }
      const labels = [];
      while (j < lines.length && /^[A-D]$/.test(lines[j])) {
        labels.push(lines[j]);
        j += 1;
      }
      if (labels.length >= 2 && pending.length >= labels.length) {
        const offset = pending.length - labels.length;
        for (let k = 0; k < labels.length; k += 1) {
          optionItems.push({ label: labels[k], text: pending[offset + k] || labels[k] });
        }
        i = j - 1;
        inOptions = true;
        continue;
      }
    }

    if (/\.{3,}|…{2,}/.test(line)) {
      promptParts.push(line);
      continue;
    }

    if (isVfBlock && afterVfHeader && !vfStatement && line.length > 15 && !/^[aAbB]\s/.test(line)) {
      vfStatement = line;
      afterVfHeader = false;
      continue;
    }

    if (!/^[A-D]$/.test(line)) promptParts.push(line);
  }

  const prompt = promptParts.join('\n')
    .replace(/\n?(听力|阅读)\s*[12]\s*$/m, '')
    .replace(/\.{3,}|…{2,}.*$/gm, '')
    .trim();
  let type = 'ESSAY';
  if (isVfBlock || /Vrai ou faux|#Vrai|#Faux/i.test(raw)) {
    type = /Justification|#Vrai|#Faux/i.test(raw) ? 'TRUE_FALSE_JUSTIFY' : 'TRUE_FALSE';
  } else if (optionItems.length >= 2) {
    type = /\(2\s*r[ée]ponses|\(3\s*r[ée]ponses|Plusieurs r[ée]ponses/i.test(raw) ? 'MULTIPLE' : 'SINGLE';
  }

  return {
    prompt: vfStatement || prompt,
    type,
    options: optionItems,
    hasSubItems,
    raw,
    isVfBlock,
    vfStatement,
  };
}

function splitIntoDocumentSections(bodyText, answerSections) {
  const starts = findQuestionStarts(bodyText);
  if (!starts.length) return [];

  const blockCounts = answerSections.map((s) => sectionBlockCount(s.answers));
  const sections = [];
  let blockOffset = 0;

  for (let i = 0; i < answerSections.length; i += 1) {
    const count = blockCounts[i];
    const slice = starts.slice(blockOffset, blockOffset + count);
    blockOffset += count;

    if (!slice.length) {
      sections.push({
        key: answerSections[i].key,
        skill: answerSections[i].skill,
        doc: answerSections[i].doc,
        passage: '',
        blocks: [],
        answers: answerSections[i].answers,
      });
      continue;
    }

    const firstQIdx = slice[0].index;
    const lastQEnd = slice[slice.length - 1].index;
    let passage = '';

    if (i === 0) {
      passage = cleanPassage(bodyText.slice(0, firstQIdx));
    } else {
      const prevLastStart = starts[blockOffset - count - 1]?.index ?? 0;
      const prevSliceEnd = starts[blockOffset - count]?.index ?? firstQIdx;
      const between = bodyText.slice(prevLastStart, firstQIdx);
      // Passage is prose between previous section's questions and this section's first question
      const prevBlockEnd = (() => {
        const prevStartIdx = blockOffset - count - (blockCounts[i - 1] || 0);
        const prevSlice = starts.slice(prevStartIdx, blockOffset - count);
        if (!prevSlice.length) return 0;
        const lastPrev = prevSlice[prevSlice.length - 1];
        const nextAfter = starts[prevStartIdx + prevSlice.length];
        return nextAfter?.index ?? lastPrev.index + 500;
      })();
      passage = cleanPassage(bodyText.slice(prevBlockEnd, firstQIdx));
      if (passage.length < 80) {
        passage = cleanPassage(between);
      }
    }

    const blocks = slice.map((s, j) => {
      const end = slice[j + 1]?.index ?? starts[blockOffset]?.index ?? bodyText.length;
      const raw = bodyText.slice(s.index, end).trim();
      return { num: s.num, index: s.index, raw, parsed: parseQuestionBlock(raw) };
    });

    sections.push({
      key: answerSections[i].key,
      skill: answerSections[i].skill,
      doc: answerSections[i].doc,
      passage,
      blocks,
      answers: answerSections[i].answers,
    });
  }

  return sections;
}

function cleanPassage(text) {
  return text
    .replace(/听力\s*[12]\s*$/gm, '')
    .replace(/阅读\s*[12]\s*$/gm, '')
    .replace(/^\d+\s*$/gm, '')
    .trim();
}

function extractPePrompt(text) {
  const peIdx = text.search(/250\s*mots\s*minimum/i);
  if (peIdx < 0) return null;
  const before = text.slice(Math.max(0, peIdx - 1500), peIdx);
  const lines = before.split('\n').map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => /^Vous\b/i.test(l));
  const promptLines = start >= 0 ? lines.slice(start) : lines.slice(-10);
  return promptLines.join('\n').replace(/250\s*mots\s*minimum/i, '').trim();
}

function applyAnswer(q, answerKey, answers) {
  const ans = answers.get(answerKey);
  if (!ans) return q;

  if (ans.type === 'MCQ' && q.options.length) {
    q.options = q.options.map((o) => ({
      ...o,
      isCorrect: o.label.toUpperCase() === ans.value,
    }));
    q.explanation = `Réponse : ${ans.value}`;
  } else if (ans.type === 'VFJ') {
    q.type = 'TRUE_FALSE_JUSTIFY';
    q.options = [
      { label: 'V', text: 'Vrai', isCorrect: ans.value === 'Vrai', order: 0 },
      { label: 'F', text: 'Faux', isCorrect: ans.value === 'Faux', order: 1 },
    ];
    q.explanation = ans.justification
      ? `Réponse : ${ans.value}. Justification : ${ans.justification}`
      : `Réponse : ${ans.value}`;
    q.modelEssay = ans.justification || null;
  } else if (ans.type === 'OPEN') {
    q.type = 'ESSAY';
    q.options = [];
    q.explanation = `Réponse attendue : ${ans.value}`;
    q.modelEssay = ans.value;
  }
  return q;
}

function buildQuestionsFromDocSection(section) {
  const { skill, passage, blocks, answers } = section;
  const questions = [];
  const answerKeys = answerKeysForSection(answers);

  const blocksByNum = new Map();
  for (const b of blocks) {
    if (!blocksByNum.has(b.num)) blocksByNum.set(b.num, []);
    blocksByNum.get(b.num).push(b);
  }

  for (const key of answerKeys) {
    const baseNum = parseInt(key, 10);
    const isSub = /[ab]$/.test(key);

    if (isSub) {
      const block = blocksByNum.get(baseNum)?.[0];
      if (!block) continue;
      const sub = key.slice(-1);
      const subLine = block.raw.match(new RegExp(`${sub}\\)\\s*([^\\n]+)`, 'i'));
      let q = {
        skill,
        type: 'ESSAY',
        order: 0,
        prompt: subLine?.[1]?.trim() || block.parsed.vfStatement || block.parsed.prompt,
        passage: passage || null,
        audioUrl: null,
        explanation: null,
        modelEssay: null,
        points: 3,
        options: [],
        followUps: [],
      };
      q = applyAnswer(q, key, answers);
      if (answers.get(key)?.type === 'VFJ') {
        q.type = 'TRUE_FALSE_JUSTIFY';
        q.options = [
          { label: 'V', text: 'Vrai', isCorrect: answers.get(key).value === 'Vrai', order: 0 },
          { label: 'F', text: 'Faux', isCorrect: answers.get(key).value === 'Faux', order: 1 },
        ];
      }
      questions.push(q);
      continue;
    }

    const blockList = blocksByNum.get(baseNum);
    const block = blockList?.shift();
    if (!block || !block.parsed.prompt) continue;

    if (block.parsed.hasSubItems && (answers.has(`${baseNum}a`) || answers.has(`${baseNum}b`))) {
      continue;
    }

    const { parsed } = block;
    let q = {
      skill,
      type: parsed.type,
      order: 0,
      prompt: parsed.prompt,
      passage: passage || null,
      audioUrl: null,
      explanation: null,
      modelEssay: null,
      points: parsed.type === 'TRUE_FALSE_JUSTIFY' ? 3 : 2,
      options: parsed.options.map((o, i) => ({
        label: o.label,
        text: o.text || o.label,
        isCorrect: false,
        order: i,
      })),
      followUps: [],
    };

    if (q.type === 'TRUE_FALSE' || q.type === 'TRUE_FALSE_JUSTIFY') {
      q.options = [
        { label: 'V', text: 'Vrai', isCorrect: false, order: 0 },
        { label: 'F', text: 'Faux', isCorrect: false, order: 1 },
      ];
    }

    q = applyAnswer(q, key, answers);
    questions.push(q);
  }

  return questions;
}

// ---------------------------------------------------------------------------
// Oral — sujet 1
// ---------------------------------------------------------------------------
function parseOralSujet1(text) {
  const m = text.match(/sujet\s*1\s+([^\n]+)\n([\s\S]*?)(?=\n\s*sujet\s*2\b|\n\s*Sujet\s*2\b|$)/i);
  if (!m) return null;
  const title = m[1].trim();
  const body = m[2].replace(/^\*[^\n]+\n?/gm, '').trim();
  const prompt = `« ${title.toUpperCase()} »\n\nDégagez le problème soulevé par ce document, puis présentez votre opinion sur le sujet sous la forme d'un exposé personnel et construit. Vous pourrez ensuite débattre de votre point de vue avec l'examinateur.`;
  return { title, passage: body, prompt };
}

const DEFAULT_FOLLOWUPS = [
  { order: 0, text: 'Pourquoi pensez-vous que ce sujet est important aujourd\'hui ?', expectedAngle: '观点 + 举例' },
  { order: 1, text: 'Que répondriez-vous à une personne qui n\'est pas d\'accord avec vous ?', expectedAngle: '反驳 + 让步' },
  { order: 2, text: 'Et vous, quelle est votre expérience personnelle par rapport à ce thème ?', expectedAngle: '个人经历' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function parseSet(folderName, setNum) {
  const dir = path.join(EXAM_DIR, folderName);
  const writtenFile = findFile(dir, /笔试(?!.*答案).*\.pdf$/i);
  const answerFile = findFile(dir, /笔试.*答案.*\.pdf$/i);
  const oralFile = findFile(dir, /口语.*\.pdf$/i);

  if (!writtenFile) throw new Error(`Missing 笔试 PDF in ${folderName}`);
  if (!answerFile) throw new Error(`Missing 笔试答案 PDF in ${folderName}`);

  const writtenText = await pdfText(path.join(dir, writtenFile));
  const answerText = await pdfText(path.join(dir, answerFile));
  const oralText = oralFile ? await pdfText(path.join(dir, oralFile)) : '';

  const answerSections = parseAnswerSections(answerText);
  if (answerSections.length < 1) {
    throw new Error('No answer sections found in answer PDF');
  }

  const peIdx = writtenText.search(/250\s*mots\s*minimum/i);
  const bodyText = peIdx >= 0 ? writtenText.slice(0, peIdx) : writtenText;

  const docSections = splitIntoDocumentSections(bodyText, answerSections);
  const allQuestions = [];
  const warnings = [];

  const totalBlocks = findQuestionStarts(bodyText).length;
  const expectedBlocks = answerSections.reduce((n, s) => n + sectionBlockCount(s.answers), 0);
  if (totalBlocks !== expectedBlocks) {
    warnings.push(`题目块 ${totalBlocks} 个，答案 ${expectedBlocks} 个 — 部分题目可能未解析`);
  }

  for (const sec of docSections) {
    allQuestions.push(...buildQuestionsFromDocSection(sec));
  }

  const pePrompt = extractPePrompt(writtenText);
  if (pePrompt) {
    allQuestions.push({
      skill: 'PE',
      type: 'ESSAY',
      order: 0,
      prompt: pePrompt,
      passage: null,
      audioUrl: null,
      explanation: 'Production écrite — 250 mots minimum.',
      points: 25,
      options: [],
      followUps: [],
    });
  }

  const oral = parseOralSujet1(oralText);
  if (oral) {
    allQuestions.push({
      skill: 'PO',
      type: 'SPEAKING',
      order: 0,
      prompt: oral.prompt,
      passage: oral.passage,
      audioUrl: null,
      explanation: 'Document d\'appui — sujet 1 du PDF oral. Questions de relance générées pour l\'entraînement.',
      points: 25,
      options: [],
      followUps: DEFAULT_FOLLOWUPS,
    });
  }

  const questions = allQuestions.map((q, i) => ({ ...q, order: i + 1 }));
  const oralTitle = oral?.title || `第 ${setNum} 套`;
  const warnNote = warnings.length ? ` ⚠ ${warnings.join('；')}` : '';

  return {
    title: `DELF B2 仿真题 · 第 ${setNum} 套（全真模拟）`,
    year: null,
    description: `听 + 读 + 写 + 口完整模拟（${oralTitle}）。共 ${questions.length} 题。导入后请上传听力 MP3 并核对自动解析题目。${warnNote}`,
    isPublished: false,
    isFreePreview: false,
    questions,
    _meta: {
      folder: folderName,
      coCount: questions.filter((q) => q.skill === 'CO').length,
      ceCount: questions.filter((q) => q.skill === 'CE').length,
      hasPe: questions.some((q) => q.skill === 'PE'),
      hasPo: questions.some((q) => q.skill === 'PO'),
      warnings,
      answerSections: answerSections.length,
    },
  };
}

async function main() {
  if (!fs.existsSync(EXAM_DIR)) {
    console.error(`Directory not found: ${EXAM_DIR}`);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const arg = process.argv[2];
  const folders = fs.readdirSync(EXAM_DIR)
    .filter((d) => fs.statSync(path.join(EXAM_DIR, d)).isDirectory())
    .map((d) => ({ name: d, num: folderToSetNum(d) }))
    .filter((x) => x.num != null)
    .sort((a, b) => a.num - b.num);

  const targets = arg ? folders.filter((f) => String(f.num) === String(arg)) : folders;

  if (!targets.length) {
    console.error('No matching sets found.');
    process.exit(1);
  }

  console.log(`Parsing ${targets.length} set(s)...`);
  const summary = [];

  for (const { name, num } of targets) {
    try {
      const data = await parseSet(name, num);
      const outPath = path.join(OUT_DIR, `mock-${String(num).padStart(2, '0')}.import.json`);
      const { _meta, ...exportData } = data;
      fs.writeFileSync(outPath, `${JSON.stringify(exportData, null, 2)}\n`, 'utf8');
      summary.push({ num, ok: true, ..._meta, questions: exportData.questions.length, out: outPath });
      console.log(`✓ Set ${num} (${name}): CO=${_meta.coCount} CE=${_meta.ceCount} PE=${_meta.hasPe} PO=${_meta.hasPo} total=${exportData.questions.length}`);
    } catch (err) {
      summary.push({ num, ok: false, folder: name, error: err.message });
      console.error(`✗ Set ${num} (${name}): ${err.message}`);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, '_parse-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`\nDone. Output: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
