// CO 听力长/短分类。优先用持久化的 ExamSet.coFormat；为空时回退到标题正则
// （B2 时代的词汇表 — documents courts / entretien / débat 等；新等级的题集
// 应在导入时写 coFormat，永远不落到这个回退）。
// 此前 SkillPractice 与 AdminExams 各有一份相同实现，现共享。

export type CoGroup = 'long' | 'short' | 'other';

export function coGroupOf(title: string): CoGroup {
  const s = title.toLowerCase();
  if (/documents?\s*courts?/.test(s) || /短听力/.test(title) || /\bcourts?\b/.test(s)) return 'short';
  if (
    /documents?\s*longs?/.test(s) ||
    /长听力/.test(title) ||
    /(entretien|d[eé]bat|table\s*ronde|interview|monologue|conf[eé]rence)/.test(s)
  ) return 'long';
  return 'other';
}

export function resolveCoGroup(row: { coFormat?: string | null; title: string }): CoGroup {
  return (row.coFormat as CoGroup) ?? coGroupOf(row.title);
}
