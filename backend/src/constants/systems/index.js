// Exam-system registry (PRD docs/2026-08-29_雅思IELTS接入PRD.md). "System" is
// the dimension ABOVE "level": DELF { A2, B1, B2 } vs IELTS { IELTS_AC }.
//
// Fallback contract differs from getLevel() on purpose: null/'' (legacy rows,
// missing param) → DELF for backwards compatibility, but an UNKNOWN non-empty
// key THROWS — silently falling back across systems would grade IELTS content
// with DELF rubrics, the exact failure mode this layer exists to prevent.
const delf = require('./delf');
const ielts = require('./ielts');
const tcf = require('./tcf');

const SYSTEMS = { DELF: delf, IELTS: ielts, TCF: tcf };
const SYSTEM_KEYS = Object.keys(SYSTEMS);
const DEFAULT_SYSTEM = 'DELF';

function getSystem(key) {
  if (key == null || key === '') return SYSTEMS[DEFAULT_SYSTEM];
  const sys = SYSTEMS[String(key).toUpperCase()];
  if (!sys) throw new Error(`Unknown exam system: ${key}`);
  return sys;
}

/** system×level 交叉校验。level 不属于该体系时返回错误串，合法返回 null。 */
function validateSystemLevel(systemKey, levelKey) {
  let sys;
  try {
    sys = getSystem(systemKey);
  } catch (e) {
    return e.message;
  }
  if (levelKey && !sys.LEVEL_KEYS.includes(levelKey)) {
    return `Level ${levelKey} is not valid for system ${sys.key}`;
  }
  return null;
}

/**
 * 解析 ?level= 查询参数为任一体系下已注册的 level key。level 键全局唯一
 * （B2/B1/A2/IELTS_AC 互不冲突），所以旧接口的单一 level 参数可以继续用。
 * 未知/缺省 → 'B2'，保持旧缓存 bundle 只看到 B2 的行为。
 */
function resolveLevelKey(key) {
  const k = String(key || '').toUpperCase();
  for (const sys of Object.values(SYSTEMS)) {
    if (sys.LEVELS[k]) return k;
  }
  return 'B2';
}

/**
 * level key → 该 level 的完整配置对象（跨体系查找）。graders/queues 用它取代
 * 裸 getLevel()：getLevel('IELTS_AC') 会静默回落 B2 拿到法语评分配置，
 * resolveLevel 则命中 IELTS 自己的配置。未知/缺省仍回落 B2（legacy 行为）。
 */
function resolveLevel(levelKey) {
  const k = String(levelKey || '').toUpperCase();
  for (const sys of Object.values(SYSTEMS)) {
    if (sys.LEVELS[k]) return sys.LEVELS[k];
  }
  return SYSTEMS.DELF.getLevel(levelKey);
}

/**
 * level key → 拥有该 level 的体系。未知/缺省回落 DELF（与 resolveLevel 同一
 * 兜底口径）。用于按 level 查询时反推体系，例如全真模拟需要哪些 skill。
 */
function resolveSystem(levelKey) {
  const k = String(levelKey || '').toUpperCase();
  for (const sys of Object.values(SYSTEMS)) {
    if (sys.LEVELS[k]) return sys;
  }
  return SYSTEMS[DEFAULT_SYSTEM];
}

/** Public projection for GET /api/catalogue (safe to cache client-side). */
function toPublicSystem(sys) {
  return {
    key: sys.key,
    skills: sys.skills,
    scoring: sys.scoring,
    defaultLevel: sys.DEFAULT_LEVEL,
    levels: sys.LEVEL_KEYS.map((k) => sys.toPublicLevel(sys.LEVELS[k])),
  };
}

module.exports = {
  SYSTEMS,
  SYSTEM_KEYS,
  DEFAULT_SYSTEM,
  getSystem,
  validateSystemLevel,
  resolveLevelKey,
  resolveLevel,
  resolveSystem,
  toPublicSystem,
};
