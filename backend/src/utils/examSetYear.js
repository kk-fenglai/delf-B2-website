// Infer ExamSet.year from title when JSON/import omits it.
// Topic-based PO sets (no exam date in title) → null (no fake year).

function extractYearFromTitle(title) {
  if (!title) return null;
  const cn = title.match(/(\d{4})年/);
  if (cn) return parseInt(cn[1], 10);
  // Session codes: 2024-03, 2021/07, 2024 · Set
  const session = title.match(/\b(20\d{2})[-/·](?:0?[1-9]|1[0-2])\b/);
  if (session) return parseInt(session[1], 10);
  const iso = title.match(/\b(20\d{2})[-/·]/);
  if (iso) return parseInt(iso[1], 10);
  // Mock / bundle titles: "仿真题 2024", "2024-Set A", "2024 · 第 1 套"
  const mock = title.match(/(?:仿真题|Mock|Set|套)\s*(20\d{2})\b/i)
    || title.match(/\b(20\d{2})\s*[-·]?\s*(?:Set|第|套|免费)/i);
  if (mock) return parseInt(mock[1], 10);
  return null;
}

/**
 * @param {object} args
 * @param {string} args.title
 * @param {number|null|undefined} args.year — explicit value from import JSON
 * @param {string[]} [args.skills] — skills present in the set (for PO-only heuristic)
 */
function resolveExamSetYear({ title, year, skills = [] }) {
  const fromTitle = extractYearFromTitle(title);
  if (fromTitle) return fromTitle;
  const onlyPo = skills.length > 0 && skills.every((s) => s === 'PO');
  if (onlyPo) return null;
  if (year != null && Number.isInteger(year)) return year;
  return null;
}

module.exports = { extractYearFromTitle, resolveExamSetYear };
