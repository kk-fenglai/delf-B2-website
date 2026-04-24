#!/usr/bin/env node
/**
 * Convert a human-edited Markdown file into the JSON payload expected by:
 *   POST /api/admin/exams/import
 *
 * Design goals:
 * - Zero external dependencies
 * - Clear, actionable error messages (line numbers + section context)
 * - Enforce the same business rules as backend/src/routes/adminExams.js validateQuestionShape()
 *
 * Input format is documented by delf_B2_reading/import_template.md
 */
const fs = require('fs');
const path = require('path');

const VALID_SKILLS = new Set(['CO', 'CE', 'PE', 'PO']);
const VALID_TYPES = new Set(['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL', 'ESSAY']);

function die(msg) {
  // eslint-disable-next-line no-console
  console.error(`\n[convertReadingMarkdownToImportJson] ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { input: null, output: null, pretty: true };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (!args.input && !a.startsWith('-')) {
      args.input = a;
      continue;
    }
    if (a === '-o' || a === '--output') {
      args.output = rest[i + 1];
      i += 1;
      continue;
    }
    if (a === '--compact') {
      args.pretty = false;
      continue;
    }
    if (a === '-h' || a === '--help') {
      return { help: true };
    }
    die(`Unknown arg: ${a}`);
  }
  if (!args.input) return { help: true };
  return args;
}

function normalizeNewlines(s) {
  return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseFrontmatter(lines) {
  // Very small YAML subset: key: value (string/number/bool), quoted strings allowed.
  if (lines.length < 3) return { meta: null, startIdx: 0 };
  if (lines[0].trim() !== '---') return { meta: null, startIdx: 0 };
  let i = 1;
  const meta = {};
  for (; i < lines.length; i += 1) {
    const raw = lines[i];
    const t = raw.trim();
    if (t === '---') {
      return { meta, startIdx: i + 1 };
    }
    if (!t || t.startsWith('#')) continue;
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)\s*$/);
    if (!m) {
      throw new Error(`Invalid frontmatter line ${i + 1}: ${raw}`);
    }
    const key = m[1];
    let valRaw = m[2].trim();
    if ((valRaw.startsWith('"') && valRaw.endsWith('"')) || (valRaw.startsWith("'") && valRaw.endsWith("'"))) {
      valRaw = valRaw.slice(1, -1);
      meta[key] = valRaw;
      continue;
    }
    if (/^(true|false)$/i.test(valRaw)) {
      meta[key] = valRaw.toLowerCase() === 'true';
      continue;
    }
    if (/^-?\d+$/.test(valRaw)) {
      meta[key] = Number(valRaw);
      continue;
    }
    meta[key] = valRaw;
  }
  throw new Error('Frontmatter opened with --- but not closed with ---');
}

function cleanQuoted(s) {
  const t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function toInt(v, where) {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${where} must be an integer, got: ${v}`);
  }
  return n;
}

function validateQuestionShape(q) {
  const correctCount = q.options.filter((o) => o.isCorrect).length;
  if (q.type === 'SINGLE' || q.type === 'TRUE_FALSE') {
    if (q.options.length < 2) return 'SINGLE/TRUE_FALSE needs ≥2 options';
    if (correctCount !== 1) return 'SINGLE/TRUE_FALSE needs exactly 1 correct option';
  }
  if (q.type === 'MULTIPLE') {
    if (q.options.length < 2) return 'MULTIPLE needs ≥2 options';
    if (correctCount < 1) return 'MULTIPLE needs ≥1 correct option';
  }
  if ((q.type === 'FILL' || q.type === 'ESSAY') && q.options.length > 0) {
    return `${q.type} must not have options`;
  }
  return null;
}

function parseAnswerList(s) {
  // Accept "A" or "A,B" or "A, B" etc.
  const t = String(s || '').trim();
  if (!t) return [];
  return t
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/[.)]/g, '').toUpperCase());
}

function parseOptionLine(raw, lineNo) {
  // Examples:
  // - A) "...“ *
  // - V) Vrai
  // - F) Faux
  // - A. text
  const t = raw.trim().replace(/^\-\s*/, '');
  const star = /\*\s*$/.test(t);
  const t2 = t.replace(/\*\s*$/, '').trim();
  const m = t2.match(/^([A-Za-z]{1,4})\s*[\)\.\:]\s*(.+)$/);
  if (!m) {
    throw new Error(`Invalid option format at line ${lineNo}. Expected "- A) text" (or "- A. text"), got: ${raw}`);
  }
  const label = m[1].toUpperCase();
  const text = cleanQuoted(m[2]);
  if (!text.trim()) throw new Error(`Option text is empty at line ${lineNo}`);
  return { label, text, isCorrect: star };
}

function parseDocument(mdText) {
  const text = normalizeNewlines(mdText);
  const lines = text.split('\n');

  const { meta, startIdx } = parseFrontmatter(lines);
  if (!meta) throw new Error('Missing YAML frontmatter (see delf_B2_reading/import_template.md)');

  const title = String(meta.title || '').trim();
  const year = meta.year;
  if (!title) throw new Error('Frontmatter: title is required');
  if (typeof year !== 'number' || !Number.isInteger(year)) throw new Error('Frontmatter: year must be an integer');

  const out = {
    title,
    year,
    description: meta.description != null ? String(meta.description) : undefined,
    isPublished: meta.isPublished === true,
    isFreePreview: meta.isFreePreview === true,
    questions: [],
  };

  let currentPassage = null;
  let i = startIdx;
  const ctx = { section: 'body' };

  function skipEmpty() {
    while (i < lines.length && !lines[i].trim()) i += 1;
  }

  function parsePassageFence() {
    // Expect ```passage ... ```
    if (lines[i].trim() !== '```passage') return null;
    const startLine = i + 1;
    i += 1;
    const buf = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (t === '```') {
        i += 1;
        return { content: buf.join('\n').trim(), startLine };
      }
      buf.push(lines[i]);
      i += 1;
    }
    throw new Error(`Passage fence opened at line ${startLine} but not closed with \`\`\``);
  }

  function parseKeyValueLine(raw, lineNo) {
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)\s*$/);
    if (!m) return null;
    return { key: m[1], value: m[2], lineNo };
  }

  function parseQuestionBlock() {
    // Header is "### Q: 1" or "### Q 1" or "### Q:1"
    const header = lines[i];
    const headerLine = i + 1;
    const hm = header.trim().match(/^###\s*Q\s*[:#]?\s*(\d+)?\s*$/i);
    if (!hm) return null;
    const qLabel = hm[1] ? Number(hm[1]) : null;
    ctx.section = `question@line${headerLine}`;
    i += 1;

    const q = {
      skill: null,
      type: null,
      order: qLabel,
      prompt: null,
      passage: undefined,
      audioUrl: undefined,
      explanation: undefined,
      points: null,
      options: [],
      answer: [],
      line: headerLine,
    };

    // Read until blank line OR next heading (### / ##) OR EOF.
    while (i < lines.length) {
      const raw = lines[i];
      const t = raw.trim();
      if (!t) {
        i += 1;
        // allow blank lines inside; stop only when next heading starts after blanks
        const save = i;
        skipEmpty();
        const next = lines[i] ? lines[i].trim() : '';
        if (next.startsWith('###') || next.startsWith('##')) return q;
        // not a heading; restore one blank separation and continue
        i = save;
        continue;
      }
      if (t.startsWith('###') || t.startsWith('##')) return q;

      // options list begins after "options:" or directly "- A) .."
      const kv = parseKeyValueLine(raw, i + 1);
      if (kv) {
        const key = kv.key;
        const value = kv.value;
        if (key === 'options') {
          // Consume following list items "- ..."
          i += 1;
          while (i < lines.length) {
            const li = lines[i];
            const lt = li.trim();
            if (!lt) {
              i += 1;
              continue;
            }
            if (lt.startsWith('###') || lt.startsWith('##')) return q;
            if (!lt.startsWith('-')) break;
            q.options.push(parseOptionLine(li, i + 1));
            i += 1;
          }
          continue;
        }
        if (key === 'skill') q.skill = String(value).trim().toUpperCase();
        else if (key === 'type') q.type = String(value).trim().toUpperCase();
        else if (key === 'order') q.order = toInt(value, `order (line ${kv.lineNo})`);
        else if (key === 'points') q.points = toInt(value, `points (line ${kv.lineNo})`);
        else if (key === 'prompt') q.prompt = cleanQuoted(value);
        else if (key === 'passage') q.passage = cleanQuoted(value);
        else if (key === 'audioUrl') q.audioUrl = cleanQuoted(value);
        else if (key === 'explanation') q.explanation = cleanQuoted(value);
        else if (key === 'answer') q.answer = parseAnswerList(value);
        // unknown keys are ignored on purpose (future-proof)
        i += 1;
        continue;
      }

      // Implicit option line
      if (t.startsWith('-')) {
        q.options.push(parseOptionLine(raw, i + 1));
        i += 1;
        continue;
      }

      // Fallback: treat as prompt continuation if prompt already set
      if (q.prompt) q.prompt = `${q.prompt}\n${raw}`.trim();
      else q.prompt = raw.trim();
      i += 1;
    }
    return q;
  }

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    // Skip comments/blockquote-only guidance lines
    if (!t || t.startsWith('>')) {
      i += 1;
      continue;
    }

    // Passage title heading
    if (/^##\s*Passage\s*:/i.test(t)) {
      ctx.section = `passageTitle@line${i + 1}`;
      currentPassage = null;
      i += 1;
      skipEmpty();
      const fence = parsePassageFence();
      if (!fence) {
        throw new Error(`Passage section at line ${i} must include a \`\`\`passage fenced block`);
      }
      if (!fence.content) {
        throw new Error(`Empty passage content (opened at line ${fence.startLine})`);
      }
      currentPassage = fence.content;
      continue;
    }

    // Any other "##" resets passage inheritance (e.g. QuestionsWithoutPassage)
    if (t.startsWith('## ')) {
      currentPassage = null;
      i += 1;
      continue;
    }

    // Question block
    const qBlock = parseQuestionBlock();
    if (qBlock) {
      const lineNo = qBlock.line;
      const skill = qBlock.skill;
      const type = qBlock.type;
      if (!skill) throw new Error(`Missing skill in question starting at line ${lineNo}`);
      if (!VALID_SKILLS.has(skill)) throw new Error(`Invalid skill "${skill}" at question line ${lineNo}`);
      if (!type) throw new Error(`Missing type in question starting at line ${lineNo}`);
      if (!VALID_TYPES.has(type)) throw new Error(`Invalid type "${type}" at question line ${lineNo}`);
      if (!qBlock.prompt || !String(qBlock.prompt).trim()) throw new Error(`Missing prompt at question line ${lineNo}`);
      if (qBlock.points == null) throw new Error(`Missing points at question line ${lineNo}`);

      let passage = qBlock.passage;
      if (passage === undefined) passage = currentPassage;
      if (passage != null && typeof passage === 'string') passage = passage.trim() || null;

      const options = qBlock.options.map((o, idx) => ({
        label: o.label,
        text: o.text,
        isCorrect: !!o.isCorrect,
        order: idx,
      }));

      // Apply answer list override if present.
      if (qBlock.answer && qBlock.answer.length) {
        const want = new Set(qBlock.answer.map((x) => String(x).toUpperCase()));
        for (const o of options) o.isCorrect = want.has(o.label);
      }

      const qOut = {
        skill,
        type,
        order: qBlock.order || (out.questions.length + 1),
        prompt: String(qBlock.prompt).trim(),
        passage: passage === undefined ? undefined : passage,
        audioUrl: qBlock.audioUrl != null ? String(qBlock.audioUrl).trim() : null,
        explanation: qBlock.explanation != null ? String(qBlock.explanation).trim() : null,
        points: qBlock.points,
        options,
        __line: lineNo,
      };

      const err = validateQuestionShape(qOut);
      if (err) throw new Error(`Question at line ${lineNo}: ${err}`);

      // Basic CE quality rule: if it is CE and there's no passage inherited/provided, error.
      if (qOut.skill === 'CE' && (!qOut.passage || !String(qOut.passage).trim())) {
        throw new Error(`Question at line ${lineNo}: CE question must have a passage (put it under a "## Passage:" section or add "passage: ...")`);
      }

      // Strip internal key used for diagnostics
      delete qOut.__line;
      out.questions.push(qOut);
      continue;
    }

    // Unknown line: ignore safely
    i += 1;
  }

  if (!out.questions.length) throw new Error('No questions parsed. Check that you used "### Q: <n>" headings.');
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    // eslint-disable-next-line no-console
    console.log(`
Usage:
  node scripts/convertReadingMarkdownToImportJson.js <input.md> -o <output.json>

Options:
  -o, --output   Output JSON file path (default: alongside input)
  --compact      Output compact JSON (no pretty formatting)
  -h, --help     Show help
`.trim());
    process.exit(0);
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  if (!fs.existsSync(inputPath)) die(`Input file not found: ${inputPath}`);
  const md = fs.readFileSync(inputPath, 'utf8');

  let payload;
  try {
    payload = parseDocument(md);
  } catch (e) {
    die(e && e.message ? e.message : String(e));
    return;
  }

  const outPath = path.resolve(
    process.cwd(),
    args.output || inputPath.replace(/\.md$/i, '') + '.import.json'
  );
  const json = args.pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  fs.writeFileSync(outPath, json, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[ok] Wrote ${payload.questions.length} questions to: ${outPath}`);
}

if (require.main === module) main();

