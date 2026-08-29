import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLevelStore } from '../stores/level';
import type { Level } from '../types';

// Display order: easiest level first, regardless of catalogue (API) order.
const DISPLAY_ORDER: Level[] = ['A2', 'B1', 'B2'];

// Fixed item width in px so the sliding indicator lines up with the buttons.
const ITEM_W = 44;

// Global exam-level switcher (A2 / B1 / B2). Renders nothing until the
// /api/levels catalogue is loaded with more than one level, so a failed
// fetch degrades to the pre-level B2-only UI.
export default function LevelSwitcher() {
  const { t } = useTranslation();
  const level = useLevelStore((s) => s.level);
  const system = useLevelStore((s) => s.system);
  const catalogue = useLevelStore((s) => s.catalogue);
  const setLevel = useLevelStore((s) => s.setLevel);

  // catalogue 只含 DELF 级别；IELTS（单级别）下整个组件隐藏。
  if (system !== 'DELF') return null;
  if (!catalogue || catalogue.length <= 1) return null;

  const ordered = [...catalogue].sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.key) - DISPLAY_ORDER.indexOf(b.key),
  );
  const active = ordered.findIndex((l) => l.key === level);

  return (
    <div
      role="radiogroup"
      aria-label="DELF level"
      className="relative inline-flex items-center p-1 rounded-full bg-surface-container"
    >
      {active >= 0 && (
        <span
          aria-hidden
          className="absolute left-1 top-1 bottom-1 rounded-full bg-primary shadow-level-1 transition-transform duration-200 ease-out"
          style={{ width: ITEM_W, transform: `translateX(${active * ITEM_W}px)` }}
        />
      )}
      {ordered.map((l) => (
        <button
          key={l.key}
          type="button"
          role="radio"
          aria-checked={level === l.key}
          onClick={() => {
            if (l.key === level) return;
            setLevel(l.key);
            message.success(t('level.switched', { level: l.key }));
          }}
          className={`relative z-10 h-7 rounded-full text-[13px] font-bold tracking-wide transition-colors duration-200 ${
            level === l.key ? 'text-on-primary' : 'text-on-surface-variant hover:text-primary'
          }`}
          style={{ width: ITEM_W }}
        >
          {l.key}
        </button>
      ))}
    </div>
  );
}
