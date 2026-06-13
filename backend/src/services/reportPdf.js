// Score-report PDF renderer (PDFKit). Embeds Noto Sans SC so Chinese exam
// titles and AI feedback render correctly (the built-in Helvetica is Latin-only).
// Labels follow the requested language (zh | en | fr); body content (titles,
// feedback) is rendered as stored.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSansSC-Regular.otf');
const FONT = 'Noto';
const FONT_AVAILABLE = fs.existsSync(FONT_PATH);

const COLORS = {
  primary: '#2563eb',
  primarySoft: '#dbeafe',
  text: '#0b1220',
  muted: '#6b7280',
  line: '#e5e7eb',
  pass: '#059669',
  passBg: '#ecfdf5',
  fail: '#dc2626',
  failBg: '#fef2f2',
  pending: '#b45309',
  pendingBg: '#fffbeb',
  track: '#eef2f7',
  white: '#ffffff',
};

const SKILL_ORDER = ['CO', 'CE', 'PE', 'PO'];

const LABELS = {
  zh: {
    brand: 'DELFluent',
    reportTitle: 'DELF B2 成绩报告',
    exam: '考试',
    candidate: '考生',
    sessionId: '会话编号',
    completed: '完成时间',
    generated: '生成时间',
    dash: '—',
    verdictPass: '已通过',
    verdictFail: '未通过',
    verdictPending: 'AI 评分进行中',
    verdictPassSub: '达到 DELF B2 合格线',
    verdictFailSub: '未达到 DELF B2 合格线',
    verdictPendingSub: '部分作答仍在 AI 评分中，结果暂未最终确定',
    overall: 'DELF 等效总分',
    rawTotal: '原始总分',
    perSection: '各部分得分（折算为 /25）',
    raw: '原始',
    pending: 'AI 评分中',
    passCriteria: '合格标准：DELF 等效总分 ≥ 50 / 100，且每个部分 ≥ 5 / 25（绿色＝达标，红色＝未达标）。',
    writingTitle: 'AI 写作评语',
    question: '题目',
    aiScore: 'AI 评分',
    noFeedback: '（暂无评语）',
    footer: 'DELFluent · DELF B2 成绩报告 · 仅供练习参考，非官方成绩',
    page: '第 {n} / {total} 页',
    skills: { CO: '听力 (CO)', CE: '阅读 (CE)', PE: '写作 (PE)', PO: '口语 (PO)' },
  },
  en: {
    brand: 'DELFluent',
    reportTitle: 'DELF B2 Score Report',
    exam: 'Exam',
    candidate: 'Candidate',
    sessionId: 'Session ID',
    completed: 'Completed',
    generated: 'Generated',
    dash: '—',
    verdictPass: 'PASSED',
    verdictFail: 'NOT PASSED',
    verdictPending: 'AI GRADING IN PROGRESS',
    verdictPassSub: 'Meets the DELF B2 pass threshold',
    verdictFailSub: 'Below the DELF B2 pass threshold',
    verdictPendingSub: 'Some answers are still being graded by AI; the result is not final',
    overall: 'DELF equivalent total',
    rawTotal: 'Raw total',
    perSection: 'Per section (scaled to /25)',
    raw: 'raw',
    pending: 'pending AI',
    passCriteria: 'Pass criteria: DELF equivalent total ≥ 50 / 100 and each section ≥ 5 / 25 (green = meets gate, red = below gate).',
    writingTitle: 'AI Writing Feedback',
    question: 'Question',
    aiScore: 'AI score',
    noFeedback: '(no feedback)',
    footer: 'DELFluent · DELF B2 Score Report · For practice only, not an official result',
    page: 'Page {n} / {total}',
    skills: { CO: 'Listening (CO)', CE: 'Reading (CE)', PE: 'Writing (PE)', PO: 'Speaking (PO)' },
  },
  fr: {
    brand: 'DELFluent',
    reportTitle: 'DELF B2 · Relevé de notes',
    exam: 'Épreuve',
    candidate: 'Candidat·e',
    sessionId: 'Identifiant de session',
    completed: 'Terminé le',
    generated: 'Généré le',
    dash: '—',
    verdictPass: 'RÉUSSITE',
    verdictFail: 'ÉCHEC',
    verdictPending: 'CORRECTION IA EN COURS',
    verdictPassSub: 'Atteint le seuil de réussite du DELF B2',
    verdictFailSub: 'En dessous du seuil de réussite du DELF B2',
    verdictPendingSub: "Certaines réponses sont en cours de correction par l'IA ; le résultat n'est pas définitif",
    overall: 'Total équivalent DELF',
    rawTotal: 'Total brut',
    perSection: 'Par épreuve (ramené sur /25)',
    raw: 'brut',
    pending: 'correction IA',
    passCriteria: 'Critères de réussite : total équivalent DELF ≥ 50 / 100 et chaque épreuve ≥ 5 / 25 (vert = seuil atteint, rouge = en dessous).',
    writingTitle: 'Production écrite — correction IA',
    question: 'Sujet',
    aiScore: 'Note IA',
    noFeedback: '(pas de commentaire)',
    footer: "DELFluent · Relevé DELF B2 · À titre d'entraînement, ce n'est pas un résultat officiel",
    page: 'Page {n} / {total}',
    skills: { CO: "Compréhension de l'oral (CO)", CE: 'Compréhension des écrits (CE)', PE: 'Production écrite (PE)', PO: 'Production orale (PO)' },
  },
};

function normalizeLocale(locale) {
  const l = String(locale || '').toLowerCase().slice(0, 2);
  return l === 'en' || l === 'fr' ? l : 'zh';
}

/**
 * Stream a styled score-report PDF to `res`.
 * @param {object} args
 * @param {import('express').Response} args.res
 * @param {object} args.built     buildSessionResult() output (exam + result + session)
 * @param {object} args.user      { name, email }
 * @param {Array}  args.essays    completed essays [{ questionId, aiScore, aiFeedback }]
 * @param {(score:number,max:number)=>number} args.scaleTo25
 * @param {string} args.lang      report label language (zh|en|fr)
 */
function buildScoreReportPdf({ res, built, user, essays, scaleTo25, lang }) {
  const L = LABELS[normalizeLocale(lang)];
  const doc = new PDFDocument({ margin: 50, bufferPages: true });
  doc.pipe(res);
  if (FONT_AVAILABLE) doc.registerFont(FONT, FONT_PATH);
  const font = FONT_AVAILABLE ? FONT : 'Helvetica';
  doc.font(font);

  const M = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const W = right - M;

  // ---------- Header band ----------
  doc.save();
  doc.rect(0, 0, doc.page.width, 78).fill(COLORS.primary);
  doc.fill(COLORS.white).font(font).fontSize(22).text(L.brand, M, 20);
  doc.fill(COLORS.primarySoft).fontSize(12).text(L.reportTitle, M, 50);
  doc.restore();
  doc.y = 98;
  doc.fill(COLORS.text);

  // ---------- Meta block ----------
  const meta = [
    [L.exam, `${built.exam.title}${built.exam.year ? ` (${built.exam.year})` : ''}`],
    [L.candidate, (user?.name || user?.email || L.dash).trim()],
    [L.sessionId, built.result.sessionId],
    [L.completed, built.session.completedAt ? new Date(built.session.completedAt).toLocaleString() : L.dash],
    [L.generated, new Date().toLocaleString()],
  ];
  const labelW = 110;
  meta.forEach(([k, v]) => {
    const y = doc.y;
    doc.fontSize(10).fill(COLORS.muted).text(k, M, y, { width: labelW });
    doc.fontSize(10).fill(COLORS.text).text(String(v), M + labelW, y, { width: W - labelW });
    doc.moveDown(0.35);
  });
  doc.moveDown(0.6);

  // ---------- Compute scores ----------
  const per = built.result.perSkill || {};
  const perScaled = SKILL_ORDER
    .map((k) => ({ skill: k, ...per[k] }))
    .filter((r) => r && r.maxScore > 0)
    .map((r) => ({ ...r, scaled: scaleTo25(r.score, r.maxScore) }));
  const totalScaled = perScaled.reduce((s, r) => s + r.scaled, 0);
  const anyPending = perScaled.some((r) => r.pendingAI);
  const allFourSkills = perScaled.length === 4;
  const passes = allFourSkills && totalScaled >= 50 && perScaled.every((r) => r.scaled >= 5);

  // ---------- Verdict banner (only meaningful for a full mock) ----------
  if (allFourSkills) {
    const state = anyPending ? 'pending' : passes ? 'pass' : 'fail';
    const bg = state === 'pass' ? COLORS.passBg : state === 'fail' ? COLORS.failBg : COLORS.pendingBg;
    const fg = state === 'pass' ? COLORS.pass : state === 'fail' ? COLORS.fail : COLORS.pending;
    const title = state === 'pass' ? L.verdictPass : state === 'fail' ? L.verdictFail : L.verdictPending;
    const sub = state === 'pass' ? L.verdictPassSub : state === 'fail' ? L.verdictFailSub : L.verdictPendingSub;
    const top = doc.y;
    const h = 62;
    doc.save();
    roundedRect(doc, M, top, W, h, 8).fill(bg);
    // status mark
    const cx = M + 34;
    const cy = top + h / 2;
    doc.circle(cx, cy, 16).fill(fg);
    drawMark(doc, cx, cy, state, COLORS.white);
    doc.fill(fg).fontSize(20).text(title, M + 64, top + 12, { width: W - 220 });
    doc.fill(COLORS.muted).fontSize(9.5).text(sub, M + 64, top + 38, { width: W - 220 });
    // big total on the right
    doc.fill(fg).fontSize(26).text(`${totalScaled.toFixed(1)}`, right - 150, top + 12, { width: 150, align: 'right' });
    doc.fill(COLORS.muted).fontSize(9).text('/ 100', right - 150, top + 42, { width: 150, align: 'right' });
    doc.restore();
    doc.y = top + h + 16;
    doc.fill(COLORS.text);
  } else {
    // Single-skill / partial session: show the equivalent total plainly.
    sectionHeading(doc, font, L.overall, M, W);
    doc.fontSize(20).fill(COLORS.primary).text(`${totalScaled.toFixed(1)} `, { continued: true })
      .fontSize(11).fill(COLORS.muted).text('/ 100');
    doc.moveDown(0.6);
    doc.fill(COLORS.text);
  }

  // ---------- Per-section table ----------
  sectionHeading(doc, font, L.perSection, M, W);
  const rawTotalScore = built.result.totalScore;
  const rawMax = built.result.maxScore;
  // column geometry
  const cName = M;
  const wName = 150;
  const cScore = M + wName;
  const wScore = 70;
  const cBar = cScore + wScore;
  const wBar = 150;
  const cRaw = cBar + wBar + 14;
  perScaled.forEach((r, i) => {
    const y = doc.y;
    if (i % 2 === 1) doc.save().rect(M - 6, y - 3, W + 12, 22).fill('#f8fafc').restore();
    const gateOk = r.scaled >= 5;
    const scoreColor = r.pendingAI ? COLORS.pending : gateOk ? COLORS.pass : COLORS.fail;
    doc.fontSize(10.5).fill(COLORS.text).text(L.skills[r.skill] || r.skill, cName, y, { width: wName - 8 });
    doc.fontSize(10.5).fill(scoreColor).text(`${r.scaled} / 25`, cScore, y, { width: wScore - 6 });
    // bar
    const barY = y + 4;
    const barH = 8;
    doc.save();
    roundedRect(doc, cBar, barY, wBar, barH, 4).fill(COLORS.track);
    const frac = Math.max(0, Math.min(1, r.scaled / 25));
    if (frac > 0) roundedRect(doc, cBar, barY, Math.max(4, wBar * frac), barH, 4).fill(scoreColor);
    doc.restore();
    const rawTxt = r.pendingAI ? L.pending : `${L.raw} ${r.score}/${r.maxScore}`;
    doc.fontSize(9).fill(COLORS.muted).text(rawTxt, cRaw, y + 1, { width: right - cRaw, align: 'right' });
    doc.y = y + 22;
  });
  // raw total row
  doc.moveDown(0.2);
  hr(doc, M, right);
  doc.moveDown(0.3);
  const ry = doc.y;
  doc.fontSize(10).fill(COLORS.muted).text(L.rawTotal, cName, ry, { width: wName });
  doc.fontSize(10).fill(COLORS.text).text(`${rawTotalScore} / ${rawMax}`, cScore, ry, { width: right - cScore });
  doc.moveDown(1);

  // pass-criteria note
  doc.fontSize(8.5).fill(COLORS.muted).text(L.passCriteria, M, doc.y, { width: W });

  // ---------- Writing feedback ----------
  const essayDone = (essays || []).filter((e) => e.status === 'done');
  if (essayDone.length) {
    doc.addPage();
    sectionHeading(doc, font, L.writingTitle, M, W);
    for (const e of essayDone) {
      const q = built.exam.questions.find((qq) => qq.id === e.questionId);
      // question prompt card
      const prompt = (q?.prompt || e.questionId || '').trim();
      doc.fontSize(11).fill(COLORS.primary).text(`${L.question}`, { continued: false });
      doc.fontSize(10.5).fill(COLORS.text).text(prompt, { width: W });
      doc.moveDown(0.25);
      // score pill
      const pillY = doc.y;
      const pillText = `${L.aiScore}: ${e.aiScore ?? L.dash} / 25`;
      const pw = doc.fontSize(9.5).widthOfString(pillText) + 16;
      doc.save();
      roundedRect(doc, M, pillY, pw, 17, 8).fill(COLORS.primarySoft);
      doc.fill(COLORS.primary).fontSize(9.5).text(pillText, M + 8, pillY + 4, { lineBreak: false });
      doc.restore();
      doc.y = pillY + 24;
      // feedback body
      const fb = e.aiFeedback ? String(e.aiFeedback).slice(0, 6000) : L.noFeedback;
      doc.fontSize(10).fill(COLORS.text).text(fb, M, doc.y, { width: W, align: 'left', lineGap: 2 });
      doc.moveDown(0.8);
      hr(doc, M, right);
      doc.moveDown(0.8);
    }
  }

  // ---------- Footer on every page ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - 38;
    doc.font(font).fontSize(8).fill(COLORS.muted);
    doc.text(L.footer, M, fy, { width: W - 70, lineBreak: false });
    doc.text(L.page.replace('{n}', i + 1 - range.start).replace('{total}', range.count), right - 70, fy, { width: 70, align: 'right', lineBreak: false });
  }

  doc.end();
}

// ---- drawing helpers ----
function sectionHeading(doc, font, text, x, w) {
  const y = doc.y;
  doc.save().rect(x, y + 2, 3, 13).fill(COLORS.primary).restore();
  doc.font(font).fontSize(13).fill(COLORS.text).text(text, x + 10, y, { width: w - 10 });
  doc.moveDown(0.5);
}

function hr(doc, x1, x2) {
  doc.save().moveTo(x1, doc.y).lineTo(x2, doc.y).lineWidth(0.5).stroke(COLORS.line).restore();
}

function roundedRect(doc, x, y, w, h, r) {
  return doc.roundedRect(x, y, w, h, r);
}

function drawMark(doc, cx, cy, state, color) {
  doc.save().lineWidth(2.2).strokeColor(color).lineCap('round');
  if (state === 'pass') {
    doc.moveTo(cx - 6, cy + 1).lineTo(cx - 1.5, cy + 6).lineTo(cx + 7, cy - 6).stroke();
  } else if (state === 'fail') {
    doc.moveTo(cx - 5, cy - 5).lineTo(cx + 5, cy + 5).moveTo(cx + 5, cy - 5).lineTo(cx - 5, cy + 5).stroke();
  } else {
    // pending: three dots
    doc.fillColor(color);
    [-6, 0, 6].forEach((dx) => doc.circle(cx + dx, cy, 1.6).fill(color));
  }
  doc.restore();
}

module.exports = { buildScoreReportPdf };
