/* eslint-disable no-console */
/**
 * OCR-backed importer for DELF B2 Reading (CE) PDFs.
 *
 * Goals:
 * - Extract reading passage text (article) and attach to questions via passageId.
 * - De-duplicate passages across PDFs by sha256(normalizedContent).
 * - Idempotent per ExamSet title: re-running replaces questions for the same set.
 *
 * Usage (Windows):
 *   cd backend
 *   cmd /c "set DATABASE_URL=file:./dev.db&& node scripts\\importDelfB2ReadingWithOcr.js"
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFParse, VerbosityLevel } = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const prisma = require('../src/prisma');

const REPO_ROOT = path.join(__dirname, '..', '..');
const PDF_DIR = path.join(REPO_ROOT, 'delf_B2_reading');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function normalizeText(t) {
  return String(t || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function splitLines(text) {
  return normalizeText(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(l));
}

function parseFilenameMeta(fileName) {
  const m = fileName.match(/^(?<year>\d{4})年(?<month>\d{1,2})月(?<region>.+?)场次/);
  const year = m?.groups?.year ? parseInt(m.groups.year, 10) : null;
  const month = m?.groups?.month ? String(parseInt(m.groups.month, 10)).padStart(2, '0') : null;
  const region = m?.groups?.region ? m.groups.region.trim() : null;
  return { year, month, region };
}

function looksLikeQuestionStart(line) {
  // OCR sometimes drops spaces; accept "1Selon..." as well.
  // DELF reading questions are typically numbered 1..10 (sometimes up to ~20).
  // Avoid matching years like "2024 ..." at the start of a line.
  return /^(?:[1-9]|1\d|20)\b\s*[.\)】\]、】【、:]?\s*\S/.test(line);
}

function extractAnswersSection(lines) {
  const idx = lines.findIndex((l) => /^答案[:：]/.test(l) || /^(第一篇答案|第二篇答案)[:：]/.test(l));
  if (idx === -1) return { body: lines, answers: [] };
  return { body: lines.slice(0, idx), answers: lines.slice(idx) };
}

function parseAnswerMap(answerLines) {
  const map = new Map();
  for (const raw of answerLines) {
    let m = raw.match(/^(\d{1,2})\s*[.、】【、]\s*([A-D]|Vrai|Faux)\b/i);
    if (m) {
      map.set(parseInt(m[1], 10), m[2].trim());
      continue;
    }
    m = raw.match(/^(\d{1,2})\s*[:：]\s*([A-D]|Vrai|Faux)\b/i);
    if (m) {
      map.set(parseInt(m[1], 10), m[2].trim());
    }
  }
  return map;
}

function parseQuestions(bodyLines, answerMap) {
  const questions = [];
  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i];
    if (!looksLikeQuestionStart(line) && !/^Vrai\\s+ou\\s+faux/i.test(line)) {
      i++;
      continue;
    }

    let number = null;
    let prompt = line;
    const nm = line.match(/^(\d{1,2})\s*[.\)】\]、】【、:]?\s*(.*)$/);
    if (nm) {
      number = parseInt(nm[1], 10);
      prompt = nm[2] ? nm[2].trim() : line.trim();
    }

    const block = [prompt].filter(Boolean);
    i++;

    const optionLines = [];
    while (i < bodyLines.length && !looksLikeQuestionStart(bodyLines[i]) && !/^答案[:：]/.test(bodyLines[i])) {
      const l = bodyLines[i];
      if (/^[A-D]\b[.)]?\s+/.test(l) || /^[A-D]\s+/.test(l)) optionLines.push(l);
      else block.push(l);
      i++;
    }

    const mergedPrompt = block.join(' ');
    const isVF = /vrai\\s+ou\\s+faux/i.test(mergedPrompt);
    const hasABCD = optionLines.some((l) => /^[A-D]\\b/.test(l));

    const answerRaw = number ? answerMap.get(number) : null;
    const explanation = answerRaw ? `参考答案：${answerRaw}` : null;

    if (isVF) {
      const correct = (answerRaw || '').toLowerCase().includes('vrai')
        ? 'V'
        : (answerRaw || '').toLowerCase().includes('faux')
          ? 'F'
          : null;
      questions.push({
        skill: 'CE',
        type: 'TRUE_FALSE',
        order: number || questions.length + 1,
        prompt: mergedPrompt || line,
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
        explanation,
        points: 1,
        options: opts.map((o) => ({ ...o, isCorrect: correctLabel ? o.label === correctLabel : false })),
      });
      continue;
    }

    // Fallback: free-text question
    questions.push({
      skill: 'CE',
      type: 'ESSAY',
      order: number || questions.length + 1,
      prompt: mergedPrompt || line,
      explanation,
      points: 1,
      options: [],
    });
  }

  const seen = new Set();
  return questions.filter((q) => {
    const key = `${q.type}:${q.prompt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPassageText(bodyLines) {
  const idx = bodyLines.findIndex((l) => looksLikeQuestionStart(l));
  if (idx <= 0) return { title: null, content: null };
  const raw = bodyLines.slice(0, idx);

  // Drop obvious metadata lines
  const cleaned = raw.filter((l) => !/^(第.+篇|第一篇|第二篇)[:：]?$/.test(l));
  const title = cleaned.length > 0 ? cleaned[0].slice(0, 120) : null;
  const content = cleaned.join('\n');
  const normalized = normalizeText(content);
  if (!normalized || normalized.length < 200) return { title, content: null };
  return { title, content: normalized };
}

async function extractTextOrOcr(pdfBuffer, fileName) {
  const parser = new PDFParse({ data: pdfBuffer, verbosity: VerbosityLevel.ERRORS });
  try {
    const direct = await parser.getText();
    const directText = normalizeText(direct?.text || '');
    if (directText && directText.length >= 500) {
      return { text: directText, usedOcr: false };
    }

    // OCR fallback: render page screenshots and run Tesseract.
    const shots = await parser.getScreenshot({ scale: 2, pageDataUrl: true });
    const worker = await createWorker();
    try {
      // Try French first; if it fails, fall back to English.
      try {
        await worker.loadLanguage('fra');
        await worker.initialize('fra');
      } catch {
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
      }

      let out = '';
      for (const p of shots.pages || []) {
        const png = Buffer.from(p.data || []);
        // eslint-disable-next-line no-await-in-loop
        const r = await worker.recognize(png);
        out += `\n${r?.data?.text || ''}\n`;
      }
      const finalText = normalizeText(out);
      return { text: finalText, usedOcr: true };
    } finally {
      await worker.terminate();
    }
  } catch (e) {
    console.log(`OCR extract failed: ${fileName} (${e.message || e})`);
    return { text: '', usedOcr: true, error: e };
  } finally {
    await parser.destroy();
  }
}

async function upsertPassage({ content, title, sourceFile }) {
  const hash = sha256(content);
  const existing = await prisma.readingPassage.findUnique({ where: { hash } });
  if (existing) return existing;
  return prisma.readingPassage.create({
    data: {
      hash,
      skill: 'CE',
      title: title || null,
      content,
      sourceFile: sourceFile || null,
    },
  });
}

async function importOnePdf(filePath) {
  const fileName = path.basename(filePath);
  const meta = parseFilenameMeta(fileName);
  const buf = fs.readFileSync(filePath);

  const { text, usedOcr } = await extractTextOrOcr(buf, fileName);
  if (!text || text.length < 200) return { fileName, imported: false, reason: 'NO_TEXT' };

  const lines = splitLines(text);
  const { body, answers } = extractAnswersSection(lines);
  const answerMap = parseAnswerMap(answers);
  const questions = parseQuestions(body, answerMap);
  const { title, content } = extractPassageText(body);

  if (!questions.length) return { fileName, imported: false, reason: 'NO_QUESTIONS' };
  if (!content) return { fileName, imported: false, reason: 'NO_PASSAGE_FOUND' };

  const passage = await upsertPassage({ content, title, sourceFile: fileName });

  const year = meta.year || new Date().getFullYear();
  const setTitle = meta.year && meta.month && meta.region
    ? `DELF B2 阅读（CE）${meta.year}-${meta.month} ${meta.region}`
    : `DELF B2 阅读（CE）${fileName.replace(/\\.pdf$/i, '')}`;

  const description = `来源文件：${fileName}${usedOcr ? '（OCR）' : ''}`;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.examSet.findFirst({ where: { title: setTitle } });
    let setId = existing?.id;
    if (!setId) {
      const created = await tx.examSet.create({
        data: {
          title: setTitle,
          year,
          description,
          isPublished: false,
          isFreePreview: false,
        },
      });
      setId = created.id;
    } else {
      // Replace all questions for idempotency.
      await tx.question.deleteMany({ where: { examSetId: setId } });
      await tx.examSet.update({ where: { id: setId }, data: { year, description } });
    }

    for (const [idx, q] of questions.entries()) {
      await tx.question.create({
        data: {
          examSetId: setId,
          skill: q.skill,
          type: q.type,
          order: q.order || idx + 1,
          prompt: q.prompt,
          passage: null, // legacy field — keep empty; API uses readingPassage.content
          passageId: passage.id,
          audioUrl: null,
          explanation: q.explanation,
          points: q.points,
          options: q.options?.length
            ? { create: q.options.map((o) => ({ label: o.label, text: o.text, isCorrect: !!o.isCorrect, order: o.order || 0 })) }
            : undefined,
        },
      });
    }
  });

  return { fileName, imported: true, questionCount: questions.length, usedOcr };
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
    // eslint-disable-next-line no-await-in-loop
    const r = await importOnePdf(p);
    results.push(r);
    console.log(
      r.imported
        ? `Imported: ${r.fileName} (${r.questionCount}q) ${r.usedOcr ? '[OCR]' : ''}`
        : `Skipped: ${r.fileName} (${r.reason})`
    );
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

