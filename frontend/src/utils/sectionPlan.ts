import type { Question, Skill } from '../types';

// Level-shaped exam-structure config, mirroring backend constants/levels/<x>.js
// sectionPlan + delfScoring. Hardcoded to B2 until GET /api/levels ships —
// the point of this module is that ExamRunner no longer encodes any of it.

export type SectionMerge = { key: string; skills: Skill[]; minutes: number };

export type LevelSectionPlan = {
  order: Skill[];
  minutes: Partial<Record<Skill, number>>;
  // B2-only quirk: CE+PE run as ONE freely-allocated 120-min block. Levels
  // without merged sections set merges: [].
  merges: SectionMerge[];
  // PO is taken on the speaking page as its own session, not a runner section.
  poSeparateSession: boolean;
};

export type LevelScoring = {
  skillMax: number;
  totalMax: number;
  passTotal: number;
  passPerSkill: number;
};

export const B2_SECTION_PLAN: LevelSectionPlan = {
  order: ['CO', 'CE', 'PE', 'PO'],
  minutes: { CO: 30, CE: 30, PE: 60, PO: 20 },
  merges: [{ key: 'CEPE', skills: ['CE', 'PE'], minutes: 120 }],
  poSeparateSession: true,
};

// Identical at A2/B1/B2 (4×25, pass ≥50, note éliminatoire <5) — mirrored
// from backend constants/delfScoring.js; the server's thresholds payload
// remains authoritative post-submit.
export const B2_SCORING: LevelScoring = {
  skillMax: 25,
  totalMax: 100,
  passTotal: 50,
  passPerSkill: 5,
};

export type Section = {
  key: string;         // 'CO' | 'CE' | 'PE' | a merge key like 'CEPE'
  skills: Skill[];     // constituent skills (length > 1 only for merges)
  minutes: number;
  questions: Question[];
};

/**
 * Build the ordered section list for a mock exam from the level's plan.
 * For the B2 plan this must reproduce the pre-refactor hardcoded behaviour
 * exactly: [CO] then [CEPE] (when CE or PE questions exist), PO excluded.
 */
export function buildSections(plan: LevelSectionPlan, questions: Question[]): Section[] {
  // Buckets follow the plan's own skill list (DELF CO/CE/PE/PO, TCF CO/SL/CE…).
  const grouped: Partial<Record<Skill, Question[]>> = {};
  plan.order.forEach((s) => { grouped[s] = []; });
  questions.forEach((q) => grouped[q.skill]?.push(q));

  const consumed = new Set<Skill>();
  const sections: Section[] = [];
  for (const s of plan.order) {
    if (consumed.has(s)) continue;
    if (plan.poSeparateSession && s === 'PO') continue;
    const merge = plan.merges.find((m) => m.skills[0] === s);
    if (merge) {
      merge.skills.forEach((ms) => consumed.add(ms));
      const qs = merge.skills.flatMap((ms) => grouped[ms] ?? []);
      if (qs.length) {
        sections.push({ key: merge.key, skills: merge.skills, minutes: merge.minutes, questions: qs });
      }
      continue;
    }
    consumed.add(s);
    const qs = grouped[s] ?? [];
    if (qs.length) {
      sections.push({ key: s, skills: [s], minutes: plan.minutes[s] ?? 0, questions: qs });
    }
  }
  return sections;
}
