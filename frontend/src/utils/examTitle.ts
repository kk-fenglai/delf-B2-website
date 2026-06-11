import type { TFunction } from 'i18next';

// Exam-set titles are stored as DATA with Chinese skill words (听力/阅读/写作/
// 口语) and mock markers (全真模拟 / 仿真题 / 第N套). UI i18n can't reach stored
// data, so we localize the known tokens at render time. The topic part (often
// French) is intentionally left as-is — it's the French exam subject.
export function localizeExamTitle(
  title: string | undefined | null,
  t: TFunction,
): string {
  if (!title) return title ?? '';
  let s = title
    .replace(/听力/g, t('skill.CO'))
    .replace(/阅读/g, t('skill.CE'))
    .replace(/写作/g, t('skill.PE'))
    .replace(/口语/g, t('skill.PO'))
    .replace(/全真模拟|仿真题/g, t('exam.fullMock', '全真模拟'));
  // 第 1 套 / 第01套 → localized "Set N".
  s = s.replace(/第\s*0*(\d+)\s*套/g, (_m, n) =>
    t('exam.setN', { n, defaultValue: `第 ${n} 套` }),
  );
  return s;
}
