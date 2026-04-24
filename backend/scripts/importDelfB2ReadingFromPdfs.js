/* eslint-disable no-console */
/**
 * Import DELF B2 reading PDFs (CE) into ExamSet/Question tables.
 *
 * This script is best-effort and intentionally conservative:
 * - If a PDF has no extractable text layer (common for scans), it is skipped.
 * - Questions are heuristically parsed; anything we can't confidently shape
 *   becomes an ESSAY question (free-text answer, not auto-graded).
 *
 * Usage (Windows PowerShell):
 *   cd backend
 *   $env:DATABASE_URL="file:./dev.db"
 *   node scripts/importDelfB2ReadingFromPdfs.js
 */

const fs = require('fs');
const path = require('path');
const { PDFParse, VerbosityLevel } = require('pdf-parse');
const prisma = require('../src/prisma');

const REPO_ROOT = path.join(__dirname, '..', '..');
const PDF_DIR = path.join(REPO_ROOT, 'delf_B2_reading');

function normalizeText(t) {
  return String(t || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseFilenameMeta(fileName) {
  // Examples:
  // 2024年2月法国场次DELF B2阅读真题（1篇）.pdf
  // 2023年9月越南场次DELF B2阅读真题（2篇）.pdf
  const m = fileName.match(/^(?<year>\d{4})年(?<month>\d{1,2})月(?<region>.+?)场次/);
  const year = m?.groups?.year ? parseInt(m.groups.year, 10) : null;
  const month = m?.groups?.month ? String(parseInt(m.groups.month, 10)).padStart(2, '0') : null;
  const region = m?.groups?.region ? m.groups.region.trim() : null;
  return { year, month, region };
}

function splitLines(text) {
  return normalizeText(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function extractAnswersSection(lines) {
  const idx = lines.findIndex((l) => /^答案[:：]/.test(l) || /^(第一篇答案|第二篇答案)[:：]/.test(l));
  if (idx === -1) return { body: lines, answers: [] };
  return { body: lines.slice(0, idx), answers: lines.slice(idx) };
}

function parseAnswerMap(answerLines) {
  // Produces map questionNumber -> answer string (e.g. "B", "Faux", "A,B")
  const map = new Map();
  for (const raw of answerLines) {
    // 1. B
    let m = raw.match(/^(\d{1,2})\s*[.\u3001]\s*([A-D]|Vrai|Faux)\b/i);
    if (m) {
      map.set(parseInt(m[1], 10), m[2].trim());
      continue;
    }
    // ①B / ② Faux
    m = raw.match(/^[\u2460-\u2473]\s*([A-D]|Vrai|Faux)\b/i);
    if (m) {
      // Can't reliably map circled digits to number without conversion; skip.
      continue;
    }
  }
  return map;
}

function looksLikeQuestionStart(line) {
  return /^\d{1,2}\s*[.\u3001]/.test(line) || /^\d{1,2}\s+/.test(line);
}

function parseQuestions(bodyLines, answerMap) {
  const questions = [];
  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i];
    if (!looksLikeQuestionStart(line) && !/^Vrai\s+ou\s+faux/i.test(line)) {
      i++;
      continue;
    }

    // Try to capture question number and prompt line
    let number = null;
    let prompt = line;
    const nm = line.match(/^(\d{1,2})\s*[.\u3001]?\s*(.*)$/);
    if (nm) {
      number = parseInt(nm[1], 10);
      prompt = nm[2] ? nm[2].trim() : line.trim();
    }

    const block = [prompt].filter(Boolean);
    i++;

    // Collect subsequent lines until next question start or "答案"
    const optionLines = [];
    while (i < bodyLines.length && !looksLikeQuestionStart(bodyLines[i]) && !/^答案[:：]/.test(bodyLines[i])) {
      const l = bodyLines[i];
      // Options lines: "A ..." "B ..." "C ..."
      if (/^[A-D]\b[.)]?\s+/.test(l) || /^[A-D]\s+/.test(l)) optionLines.push(l);
      else block.push(l);
      i++;
    }

    const mergedPrompt = block.join(' ');

    // Determine type
    const isVF = /vrai\s+ou\s+faux/i.test(mergedPrompt) || optionLines.some((l) => /^Vrai\b|^Faux\b/i.test(l));
    const hasABCD = optionLines.some((l) => /^[A-D]\b/.test(l));

    const answerRaw = number ? answerMap.get(number) : null;
    const explanation = answerRaw ? `参考答案：${answerRaw}` : null;

    if (isVF) {
      const correct = (answerRaw || '').toLowerCase().includes('vrai') ? 'V' : (answerRaw || '').toLowerCase().includes('faux') ? 'F' : null;
      questions.push({
        skill: 'CE',
        type: 'TRUE_FALSE',
        order: number || questions.length + 1,
        prompt: mergedPrompt || line,
        passage: null,
        explanation,
        points: 1,
        options: [
          { label: 'V', text: 'Vrai', isCorrect: correct === 'V', order: 0 },
          { label: 'F', text: 'Faux', isCorrect: correct === 'F', order: 1 },
        ],
      });
      continue;
    }

    if (hasABCD) {
      // Parse options
      const opts = optionLines
        .map((l) => {
          const m = l.match(/^([A-D])\b[.)]?\s*(.*)$/);
          if (!m) return null;
          return { label: m[1], text: (m[2] || '').trim() || m[1], order: 'ABCD'.indexOf(m[1]) };
        })
        .filter(Boolean);

      const correctLabel = answerRaw && /^[A-D]$/i.test(answerRaw) ? answerRaw.toUpperCase() : null;
      questions.push({
        skill: 'CE',
        type: 'SINGLE',
        order: number || questions.length + 1,
        prompt: mergedPrompt || line,
        passage: null,
        explanation,
        points: 1,
        options: opts.map((o) => ({ ...o, isCorrect: correctLabel ? o.label === correctLabel : false })),
      });
      continue;
    }

    // Fallback: free-text question (not auto-graded)
    questions.push({
      skill: 'CE',
      type: 'ESSAY',
      order: number || questions.length + 1,
      prompt: mergedPrompt || line,
      passage: null,
      explanation,
      points: 1,
      options: [],
    });
  }

  // De-dup exact prompts (some PDFs repeat headings)
  const seen = new Set();
  return questions.filter((q) => {
    const key = `${q.type}:${q.prompt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function importOnePdf(filePath) {
  const fileName = path.basename(filePath);
  const meta = parseFilenameMeta(fileName);
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf, verbosity: VerbosityLevel.ERRORS });
  const parsed = await parser.getText();
  await parser.destroy();
  const text = normalizeText(parsed.text);

  // Skip scanned PDFs with no text layer.
  if (!text || text.length < 80) {
    return { fileName, imported: false, reason: 'NO_TEXT_LAYER' };
  }

  const lines = splitLines(text);
  const { body, answers } = extractAnswersSection(lines);
  const answerMap = parseAnswerMap(answers);
  const questions = parseQuestions(body, answerMap);

  if (questions.length === 0) {
    return { fileName, imported: false, reason: 'NO_QUESTIONS_PARSED' };
  }

  const year = meta.year || new Date().getFullYear();
  const title = meta.year && meta.month && meta.region
    ? `DELF B2 阅读（CE）${meta.year}-${meta.month} ${meta.region}`
    : `DELF B2 阅读（CE）${fileName.replace(/\.pdf$/i, '')}`;

  // Put the whole PDF text as a reference in the description (keep it short).
  const description = `来源文件：${fileName}`;

  // Create exam set + questions (draft by default).
  const created = await prisma.$transaction(async (tx) => {
    const set = await tx.examSet.create({
      data: {
        title,
        year,
        description,
        isPublished: false,
        isFreePreview: false,
      },
    });
    for (const [idx, q] of questions.entries()) {
      await tx.question.create({
        data: {
          examSetId: set.id,
          skill: q.skill,
          type: q.type,
          order: q.order || idx + 1,
          prompt: q.prompt,
          passage: q.passage,
          audioUrl: null,
          explanation: q.explanation,
          points: q.points,
          options: q.options?.length
            ? { create: q.options.map((o) => ({ label: o.label, text: o.text, isCorrect: !!o.isCorrect, order: o.order || 0 })) }
            : undefined,
        },
      });
    }
    return { setId: set.id, questionCount: questions.length };
  });

  return { fileName, imported: true, ...created };
}

async function main() {
  if (!fs.existsSync(PDF_DIR)) {
    console.error(`PDF directory not found: ${PDF_DIR}`);
    process.exitCode = 1;
    return;
  }

  const pdfs = fs.readdirSync(PDF_DIR)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => path.join(PDF_DIR, f));

  const results = [];
  for (const p of pdfs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await importOnePdf(p);
      results.push(r);
      console.log(r.imported ? `Imported: ${r.fileName} -> ${r.questionCount} questions` : `Skipped: ${r.fileName} (${r.reason})`);
    } catch (e) {
      results.push({ fileName: path.basename(p), imported: false, reason: `ERROR: ${e.message || String(e)}` });
      console.log(`Error: ${path.basename(p)} (${e.message || e})`);
    }
  }

  const imported = results.filter((r) => r.imported).length;
  const skipped = results.length - imported;
  console.log(`Done. Imported ${imported}, skipped ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

