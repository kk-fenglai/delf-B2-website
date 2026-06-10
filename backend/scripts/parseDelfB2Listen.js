/* eslint-disable no-console, no-await-in-loop */
/**
 * Parse delfB2_listen → co-sets/*.import.json + copy audio to fei-samples/co-listen/
 *
 * Usage:
 *   cd backend
 *   node scripts/parseDelfB2Listen.js
 *   node scripts/parseDelfB2Listen.js --no-ocr    # skip OCR (faster, fewer sets)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFParse, VerbosityLevel } = require('pdf-parse');
const { createWorker } = require('tesseract.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const LISTEN_DIR = path.join(REPO_ROOT, 'delfB2_listen');
const OUT_DIR = path.join(__dirname, '..', 'content', 'co-sets');
const AUDIO_OUT = path.join(__dirname, '..', 'content', 'fei-samples');

const SKIP_OCR = process.argv.includes('--no-ocr');

function normalizeText(t) {
  return String(t || '')
    .replace(/\r/g, '\n')
    .replace(/\t+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/-- \d+ of \d+ --/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function deSpaceLines(text) {
  return text.split('\n').map((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 8 && parts.every((p) => p.length <= 3)) {
      return parts.join('');
    }
    return line;
  }).join('\n');
}

function slugify(s) {
  return String(s)
    .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function parseSessionMeta(name) {
  const m = name.match(/(\d{4})年(\d{1,2})月/);
  const year = m ? parseInt(m[1], 10) : null;
  const month = m ? String(parseInt(m[2], 10)).padStart(2, '0') : null;
  let region = 'unknown';
  if (/法国|FR/i.test(name)) region = 'fr';
  else if (/中国|国内|CN/i.test(name)) region = 'cn';
  else if (/越南|VN/i.test(name)) region = 'vn';
  let kind = 'long';
  if (/短听力|短/i.test(name)) kind = 'short';
  else if (/新题型|ex\d/i.test(name)) kind = 'new';
  return { year, month, region, kind, key: `${year || 'x'}-${month || 'x'}-${region}-${kind}` };
}

async function extractTextOrOcr(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf, verbosity: VerbosityLevel.ERRORS });
  try {
    const direct = await parser.getText();
    let text = normalizeText(direct?.text || '');
    text = deSpaceLines(text);
    if (text.length >= 400) return { text, usedOcr: false };

    if (SKIP_OCR) return { text, usedOcr: false };

    const shots = await parser.getScreenshot({ scale: 2, pageDataUrl: true });
    const worker = await createWorker();
    try {
      try {
        await worker.loadLanguage('fra+eng');
        await worker.initialize('fra+eng');
      } catch {
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
      }
      let out = '';
      for (const p of shots.pages || []) {
        const png = Buffer.from(p.data || []);
        const r = await worker.recognize(png);
        out += `\n${r?.data?.text || ''}\n`;
      }
      text = deSpaceLines(normalizeText(out));
      return { text, usedOcr: true };
    } finally {
      await worker.terminate();
    }
  } finally {
    await parser.destroy();
  }
}

function splitLines(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

function parseAnswerSection(lines) {
  const idx = lines.findIndex((l) => /^答案[:：]?$/i.test(l) || /^答案[：:]/i.test(l) || l === '答案：');
  if (idx === -1) {
    const idx2 = lines.findIndex((l) => /^答案/.test(l) && l.length < 20);
    if (idx2 === -1) return { body: lines, answers: new Map() };
    return parseAnswerLines(lines, idx2);
  }
  return parseAnswerLines(lines, idx);
}

function parseAnswerLines(lines, idx) {
  const answerLines = lines.slice(idx + 1);
  const body = lines.slice(0, idx);
  const map = new Map();
  let cur = null;
  for (const raw of answerLines) {
    if (/^听力原文|^原文|^Presen/i.test(raw)) break;
    let m = raw.match(/^(\d{1,2})\.\s*([A-Da-d]|.+)/);
    if (m) {
      cur = m[1];
      const v = m[2].trim();
      if (/^[A-Da-d]$/.test(v)) map.set(cur, v.toUpperCase());
      else map.set(cur, v);
      continue;
    }
    m = raw.match(/^(\d{1,2})\s+([A-Da-d])\b/);
    if (m) {
      map.set(m[1], m[2].toUpperCase());
      continue;
    }
    if (cur && map.has(cur) && !/^[A-D]\s/.test(raw)) {
      map.set(cur, `${map.get(cur)} ${raw}`.trim());
    }
  }
  return { body, answers: map };
}

function findTranscript(text) {
  const markers = [/听力原文[:：]?/i, /^原文[:：]/im, /^原文$/im];
  for (const re of markers) {
    const m = text.match(re);
    if (m) return text.slice(m.index + m[0].length).trim();
  }
  const idx = text.search(/Journaliste\s*:|Présentatrice\s*:|Patricia\s+Martin|Laetitia\s+de\s+Germon|PM\s*:/i);
  if (idx >= 0) return text.slice(idx).trim();
  return null;
}

function parseInlineOptions(line) {
  const opts = [];
  const re = /\b([A-D])\s+(.+?)(?=\s+[A-D]\s+|$)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    opts.push({ label: m[1].toUpperCase(), text: m[2].trim(), order: opts.length });
  }
  return opts;
}

function parseMcqBlock(prompt, optionLines, answerRaw) {
  const options = [];
  for (const line of optionLines) {
    let m = line.match(/^([A-D])\s+(.+)/i);
    if (m) options.push({ label: m[1].toUpperCase(), text: m[2].trim(), order: options.length });
    else if (/^[A-D]$/.test(line.trim())) options.push({ label: line.trim(), text: line.trim(), order: options.length });
    else {
      const inline = parseInlineOptions(line);
      if (inline.length >= 2) inline.forEach((o) => options.push({ ...o, order: options.length }));
    }
  }
  if (options.length < 2) {
    const inline = parseInlineOptions(prompt);
    if (inline.length >= 2) inline.forEach((o) => options.push({ ...o, order: options.length }));
  }
  const correct = answerRaw && /^[A-D]$/i.test(String(answerRaw).trim()) ? String(answerRaw).trim().toUpperCase() : null;
  return {
    skill: 'CO',
    type: options.length >= 2 ? 'SINGLE' : 'ESSAY',
    prompt: prompt.replace(/\s*[（(]\d[\d.,\s]*分[)）]/g, '').trim(),
    passage: null,
    audioUrl: null,
    explanation: answerRaw ? `Réponse : ${answerRaw}` : null,
    modelEssay: options.length < 2 && answerRaw ? String(answerRaw) : null,
    points: 2,
    options: options.map((o) => ({ ...o, isCorrect: correct ? o.label === correct : false })),
    followUps: [],
  };
}

function parseRecallBody(bodyLines, answers) {
  const questions = [];
  let transcript = null;
  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i];
    if (/^长听力|^短听力|^听力总分|^202\d/.test(line) && line.length < 80) { i += 1; continue; }

    const nm = line.match(/^(\d{1,2})[.\s、]+(.+)/) || line.match(/^(\d{1,2})\s+(.+)/);
    if (!nm) { i += 1; continue; }

    const num = nm[1];
    let prompt = nm[2];
    const optionLines = [];
    i += 1;
    while (i < bodyLines.length) {
      const l = bodyLines[i];
      if (/^(\d{1,2})[.\s、]/.test(l) && !/^[A-D]\s/.test(l)) break;
      if (/^答案|^听力原文|^原文/.test(l)) break;
      if (/^[A-D]\s/.test(l) || /^[A-D]$/.test(l)) optionLines.push(l);
      else if (!/^[（(]\d/.test(l)) prompt += ` ${l}`;
      i += 1;
    }

    const q = parseMcqBlock(prompt, optionLines, answers.get(num));
    q._num = num;
    questions.push(q);
  }
  return questions;
}

function parseFeiNewFormat(text) {
  const exercises = [];
  const parts = text.split(/>\s*EXERCICE\s*(\d+)/i);
  for (let i = 1; i < parts.length; i += 2) {
    const exNum = parseInt(parts[i], 10);
    const chunk = parts[i + 1] || '';
    const questions = [];
    const qRe = /(\d{1,2})\s+([^\n]+?\??)\s*(?:\d+(?:[.,]\d+)?\s*point[s]?)?/gi;
    const lines = chunk.split('\n');
    let qi = 0;
    while (qi < lines.length) {
      const m = lines[qi].match(/^(\d{1,2})\s+(.+)/);
      if (!m) { qi += 1; continue; }
      const num = m[1];
      let prompt = m[2];
      const opts = [];
      qi += 1;
      while (qi < lines.length && !/^(\d{1,2})\s+/.test(lines[qi]) && !/^DOCUMENT/i.test(lines[qi])) {
        const ol = lines[qi].trim();
        const om = ol.match(/^([A-D])\s*\[\s*\]\s*(.*)/i);
        if (om) opts.push({ label: om[1].toUpperCase(), text: om[2].trim() || om[1], order: opts.length });
        qi += 1;
      }
      if (opts.length >= 2) {
        questions.push({
          skill: 'CO',
          type: 'SINGLE',
          order: 0,
          prompt: prompt.replace(/\s*\d+(?:[.,]\d+)?\s*point[s]?$/i, '').trim(),
          passage: null,
          audioUrl: null,
          explanation: null,
          points: 2,
          options: opts.map((o) => ({ ...o, isCorrect: false })),
          followUps: [],
          _exercise: exNum,
          _num: num,
        });
      }
    }
    if (questions.length) exercises.push({ exercise: exNum, questions });
  }
  return exercises;
}

function detectFormat(text) {
  if (/EXERCICE\s*1/i.test(text) && /A\s*\[\s*\]/i.test(text)) return 'fei-new';
  if (/BABBCB|真题答案[:：]\s*[A-D]{4,}/i.test(text)) return 'recall-inline';
  if (/答案/.test(text) || /长听力总分|短听力/.test(text)) return 'recall';
  return 'recall';
}

function copyAudio(srcPath, slug) {
  if (!fs.existsSync(AUDIO_OUT)) fs.mkdirSync(AUDIO_OUT, { recursive: true });
  const ext = path.extname(srcPath).toLowerCase();
  const destName = `${slug}${ext}`;
  const destPath = path.join(AUDIO_OUT, destName);
  if (!fs.existsSync(destPath)) fs.copyFileSync(srcPath, destPath);
  return `/api/audio/fei/${destName}`;
}

function contentHash(text) {
  return crypto.createHash('sha256').update(text.slice(0, 2000)).digest('hex').slice(0, 12);
}

function collectListenFiles() {
  const allPdfs = [];
  const allAudios = [];
  for (const dirName of fs.readdirSync(LISTEN_DIR)) {
    const dir = path.join(LISTEN_DIR, dirName);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (/\.(mp3|m4a)$/i.test(f)) allAudios.push({ path: full, name: f, dirName });
      if (f.endsWith('.pdf')) allPdfs.push({ path: full, name: f, dirName, isTranscript: /原文/.test(f), isAnswer: /答案/.test(f) });
    }
  }
  return { allPdfs, allAudios };
}

function sessionKey(meta) {
  return `${meta.year}-${meta.month}-${meta.region}-${meta.kind}`;
}

function pdfsForSession(allPdfs, meta) {
  return allPdfs.filter((p) => {
    if (p.isTranscript || p.isAnswer) return false;
    const pm = parseSessionMeta(p.name);
    if (pm.year !== meta.year || pm.month !== meta.month) return false;
    if (meta.kind === 'short' && pm.kind === 'long') return false;
    if (meta.kind === 'long' && pm.kind === 'short') return false;
    return true;
  }).map((p) => p.path);
}

function transcriptPdfsForSession(allPdfs, meta) {
  return allPdfs.filter((p) => {
    if (!p.isTranscript) return false;
    const pm = parseSessionMeta(p.name);
    return pm.year === meta.year && pm.month === meta.month;
  }).map((p) => p.path);
}

function parseInlineLetterAnswers(text) {
  const m = text.match(/答案[:：]?\s*([A-D]{4,})/i) || text.match(/真题答案[:：]?\s*([A-D]{4,})/i);
  if (!m) return new Map();
  const letters = m[1].split('');
  return new Map(letters.map((a, i) => [String(i + 1), a]));
}

function parseRecallInline(text) {
  const deSpaced = deSpaceLines(text);
  const transcriptIdx = deSpaced.search(/原文[:：]?/i);
  const questionPart = transcriptIdx >= 0 ? deSpaced.slice(0, transcriptIdx) : deSpaced;
  const transcript = transcriptIdx >= 0 ? deSpaced.slice(transcriptIdx).replace(/^原文[:：]?\s*/i, '').trim() : null;

  const answers = parseInlineLetterAnswers(questionPart);
  const lines = splitLines(questionPart);
  let questions = parseRecallBody(lines, answers);

  if (!questions.length) {
    const { body, answers: ans2 } = parseAnswerSection(lines);
    questions = parseRecallBody(body, ans2.size ? ans2 : answers);
  }

  if (transcript) {
    questions = questions.map((q) => ({ ...q, passage: transcript }));
  }
  return { questions, transcript, groups: ['doc1'] };
}

function splitQuestionSection(text) {
  const markers = [
    /(?:\d{4}\s*年\s*\d+\s*月[^\n]*?)原文(?:与答案)?[:：]?/i,
    /听力原文(?:与答案)?[:：]?/i,
    /\n原文(?:与答案)?[:：]/i,
  ];
  for (const re of markers) {
    const m = text.match(re);
    if (m && m.index > 80) return text.slice(0, m.index);
  }
  const jIdx = text.search(/\nJournaliste\s*:/i);
  if (jIdx > 200) return text.slice(0, jIdx);
  return text;
}

function parsePdfContent(text, format) {
  if (format === 'fei-new') {
    const exercises = parseFeiNewFormat(text);
    const transcript = findTranscript(text);
    const all = exercises.flatMap((ex) => ex.questions.map((q) => ({
      ...q,
      passage: transcript,
      _audioGroup: `ex${ex.exercise}`,
    })));
    return { questions: all, transcript, groups: exercises.map((e) => `ex${e.exercise}`) };
  }

  if (format === 'recall-inline' || /BABBCB|真题答案[:：]\s*[A-D]{4,}/i.test(text)) {
    return parseRecallInline(text);
  }

  const questionText = splitQuestionSection(text);
  const fullLines = splitLines(text);
  const { answers } = parseAnswerSection(fullLines);
  const lines = splitLines(questionText);
  let questions = parseRecallBody(lines, answers);

  if (!questions.length) {
    const { body } = parseAnswerSection(lines);
    questions = parseRecallBody(body, answers);
  }

  const transcript = findTranscript(text) || findTranscript(questionText);
  if (transcript) {
    questions = questions.map((q) => ({ ...q, passage: transcript }));
  }
  return { questions, transcript, groups: ['doc1'] };
}

function discoverSets() {
  const { allPdfs, allAudios } = collectListenFiles();
  const sessions = new Map();

  for (const audio of allAudios) {
    if (/^第二套新题型ex/i.test(audio.name) || /^第二套新题型 ex/i.test(audio.name)) continue;
    if (/新题型第一套DELF B2听力音频/i.test(audio.name)) continue;
    const meta = parseSessionMeta(audio.name);
    const key = sessionKey(meta);
    if (!sessions.has(key)) {
      sessions.set(key, {
        slug: slugify(`${meta.kind}-${meta.year}-${meta.month}-${meta.region}`),
        meta,
        audioPath: audio.path,
        audioFile: audio.name,
        dirName: audio.dirName,
      });
    }
  }

  const sets = [...sessions.values()].map((s) => ({
    ...s,
    pdfCandidates: pdfsForSession(allPdfs, s.meta),
    transcriptPdfs: transcriptPdfsForSession(allPdfs, s.meta),
  }));
  const newDir = path.join(LISTEN_DIR, 'DELF B2 新题型听力真题（完整两套）');
  if (fs.existsSync(newDir)) {
    const nf1Audio = path.join(newDir, '新题型第一套DELF B2听力音频.m4a');
    if (fs.existsSync(nf1Audio)) {
      sets.push({
        slug: 'new-format-01',
        meta: { year: 2023, month: '03', region: 'cn', kind: 'new', key: 'new-01' },
        dir: newDir,
        audioPath: nf1Audio,
        audioFile: '新题型第一套DELF B2听力音频.m4a',
        pdfCandidates: [
          path.join(newDir, '新题型听力（第一套）.pdf'),
          path.join(newDir, '新题型听力第一套答案.pdf'),
        ],
        transcriptPdfs: [path.join(newDir, '第一套新题型听力原文.pdf')],
        dirName: '新题型第一套',
      });
    }

    const ex2 = path.join(newDir, '第二套新题型 ex2.mp3');
    const ex3a = path.join(newDir, '第二套新题型ex3  (1).mp3');
    const ex3b = path.join(newDir, '第二套新题型ex3  (2).mp3');
    if (fs.existsSync(ex2)) {
      sets.push({
        slug: 'new-format-02',
        meta: { year: 2023, month: '03', region: 'cn', kind: 'new', key: 'new-02' },
        dir: newDir,
        multiAudio: [
          { path: ex2, group: 'ex1' },
          ...(fs.existsSync(ex3a) ? [{ path: ex3a, group: 'ex2' }] : []),
          ...(fs.existsSync(ex3b) ? [{ path: ex3b, group: 'ex3' }] : []),
        ],
        pdfCandidates: [
          path.join(newDir, '第二套新题型 听力部分.pdf'),
          path.join(newDir, 'DELF B2第二套新题型 听力答案.pdf'),
        ],
        dirName: '新题型第二套',
      });
    }
  }

  return sets;
}

async function processSet(set) {
  let bestPdf = null;
  let bestText = '';
  let usedOcr = false;
  let parsed = { questions: [], transcript: null, groups: ['doc1'] };
  let format = 'recall';

  for (const pdfPath of set.pdfCandidates || []) {
    if (!fs.existsSync(pdfPath)) continue;
    const { text, usedOcr: ocr } = await extractTextOrOcr(pdfPath);
    if (text.length < 100) continue;
    const fmt = detectFormat(text);
    const candidate = parsePdfContent(text, fmt);
    candidate.questions = candidate.questions.filter((q) => {
      if (!q.prompt?.trim()) return false;
      if ((q.options || []).length >= 2) return q.prompt.trim().length >= 12;
      return q.type === 'ESSAY' && (q.explanation || q.modelEssay);
    });
    const mcqCount = candidate.questions.filter((q) => (q.options || []).length >= 2).length;
    const essayCount = candidate.questions.filter((q) => q.type === 'ESSAY').length;
    const totalQ = candidate.questions.length;
    let score = mcqCount * 10 + essayCount;
    if (!ocr) score += 50;
    if (text.length > 400) score += 2;
    if (totalQ > 22) score -= (totalQ - 22) * 8;

    const bestMcq = parsed.questions.filter((q) => (q.options || []).length >= 2).length;
    const bestEssay = parsed.questions.filter((q) => q.type === 'ESSAY').length;
    const bestTotal = parsed.questions.length;
    let bestScore = bestMcq * 10 + bestEssay;
    if (!usedOcr && bestText.length > 0) bestScore += 50;
    if (bestText.length > 400) bestScore += 2;
    if (bestTotal > 22) bestScore -= (bestTotal - 22) * 8;

    if (score > bestScore) {
      bestText = text;
      bestPdf = pdfPath;
      usedOcr = ocr;
      parsed = candidate;
      format = fmt;
    } else if (!parsed.transcript && candidate.transcript) {
      parsed.transcript = candidate.transcript;
    }
  }

  if (bestText.length < 100) {
    return { slug: set.slug, ok: false, reason: 'NO_TEXT', pdf: bestPdf };
  }

  let transcriptText = parsed.transcript;
  for (const tp of set.transcriptPdfs || []) {
    if (!fs.existsSync(tp)) continue;
    const { text: tText } = await extractTextOrOcr(tp);
    const tr = findTranscript(tText) || tText.trim();
    if (tr && tr.length > (transcriptText?.length || 0)) transcriptText = tr;
  }
  for (const pdfPath of set.pdfCandidates || []) {
    if (pdfPath === bestPdf || !fs.existsSync(pdfPath)) continue;
    const { text } = await extractTextOrOcr(pdfPath);
    const tr = findTranscript(text);
    if (tr && tr.length > (transcriptText?.length || 0)) transcriptText = tr;
  }
  if (transcriptText) {
    parsed = {
      ...parsed,
      transcript: transcriptText,
      questions: parsed.questions.map((q) => ({ ...q, passage: q.passage || transcriptText })),
    };
  }

  parsed.questions = parsed.questions.filter((q) => {
    if (!q.prompt?.trim()) return false;
    if ((q.options || []).length >= 2) return q.prompt.trim().length >= 12;
    return q.type === 'ESSAY' && (q.explanation || q.modelEssay);
  });

  if (!parsed.questions.length) {
    return { slug: set.slug, ok: false, reason: 'NO_QUESTIONS', chars: bestText.length, format };
  }

  const hash = contentHash(bestText);

  const audioUrls = {};
  if (set.multiAudio) {
    for (const a of set.multiAudio) {
      audioUrls[a.group] = copyAudio(a.path, `${set.slug}-${a.group}`);
    }
  } else if (set.audioPath) {
    audioUrls.doc1 = copyAudio(set.audioPath, set.slug);
    for (const g of parsed.groups || ['doc1']) audioUrls[g] = audioUrls.doc1;
  }

  const questions = parsed.questions.map((q, idx) => {
    const group = q._audioGroup || 'doc1';
    return {
      skill: 'CO',
      type: q.type,
      order: idx + 1,
      prompt: q.prompt,
      passage: q.passage || parsed.transcript || null,
      audioUrl: audioUrls[group] || audioUrls.doc1 || null,
      explanation: q.explanation,
      modelEssay: q.modelEssay || null,
      points: q.points || 2,
      options: q.options || [],
      followUps: [],
    };
  });

  const kindLabel = set.meta.kind === 'short' ? '短听力' : set.meta.kind === 'new' ? '新题型' : '长听力';
  const title = `DELF B2 听力 · ${kindLabel} ${set.meta.year || ''}-${set.meta.month || ''}`.replace(/\s+/g, ' ').trim();

  const exportData = {
    title,
    year: set.meta.year,
    description: `${kindLabel}专项。来源：${set.dirName}${usedOcr ? '（OCR）' : ''}。共 ${questions.length} 题。`,
    isPublished: false,
    isFreePreview: false,
    questions,
    _meta: {
      slug: set.slug,
      pdf: bestPdf ? path.basename(bestPdf) : null,
      audio: set.audioFile || set.multiAudio?.map((a) => path.basename(a.path)).join(', '),
      format,
      usedOcr,
      hash,
    },
  };

  return { slug: set.slug, ok: true, hash, exportData, qCount: questions.length };
}

async function main() {
  if (!fs.existsSync(LISTEN_DIR)) {
    console.error(`Missing: ${LISTEN_DIR}`);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const sets = discoverSets();
  console.log(`Found ${sets.length} audio session(s). OCR=${!SKIP_OCR}\n`);

  const summary = [];
  const seenHash = new Set();
  let idx = 0;

  for (const set of sets) {
    idx += 1;
    process.stdout.write(`[${idx}/${sets.length}] ${set.slug} ... `);
    try {
      const result = await processSet(set);
      if (!result.ok) {
        console.log(`skip (${result.reason})`);
        summary.push(result);
        continue;
      }
      if (seenHash.has(result.hash)) {
        console.log(`skip (duplicate content)`);
        summary.push({ ...result, ok: false, reason: 'DUPLICATE' });
        continue;
      }
      seenHash.add(result.hash);

      const { _meta, ...clean } = result.exportData;
      const outPath = path.join(OUT_DIR, `${result.slug}.import.json`);
      fs.writeFileSync(outPath, `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
      console.log(`OK ${result.qCount}q → ${path.basename(outPath)}`);
      summary.push({
        slug: result.slug,
        ok: true,
        qCount: result.qCount,
        hash: result.hash,
        out: outPath,
      });
    } catch (e) {
      console.log(`error: ${e.message}`);
      summary.push({ slug: set.slug, ok: false, reason: e.message });
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, '_parse-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const ok = summary.filter((s) => s.ok);
  console.log(`\nDone: ${ok.length}/${sets.length} sets → ${OUT_DIR}`);
  console.log(`Audio → ${AUDIO_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
