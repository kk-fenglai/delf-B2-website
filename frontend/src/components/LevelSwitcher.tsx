import { Segmented } from 'antd';
import { useLevelStore } from '../stores/level';
import type { Level } from '../types';

// Display order: easiest level first, regardless of catalogue (API) order.
const DISPLAY_ORDER: Level[] = ['A2', 'B1', 'B2'];

// Global exam-level switcher (A2 / B1 / B2). Renders nothing until the
// /api/levels catalogue is loaded with more than one level, so a failed
// fetch degrades to the pre-level B2-only UI.
export default function LevelSwitcher() {
  const level = useLevelStore((s) => s.level);
  const catalogue = useLevelStore((s) => s.catalogue);
  const setLevel = useLevelStore((s) => s.setLevel);

  if (!catalogue || catalogue.length <= 1) return null;

  const ordered = [...catalogue].sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.key) - DISPLAY_ORDER.indexOf(b.key),
  );

  return (
    <Segmented
      size="small"
      value={level}
      options={ordered.map((l) => ({ label: l.key, value: l.key }))}
      onChange={(v) => setLevel(v as Level)}
    />
  );
}
