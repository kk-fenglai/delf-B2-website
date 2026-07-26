import { Segmented } from 'antd';
import { useLevelStore } from '../stores/level';
import type { Level } from '../types';

// Global exam-level switcher (B2 / B1 / A2). Renders nothing until the
// /api/levels catalogue is loaded with more than one level, so a failed
// fetch degrades to the pre-level B2-only UI.
export default function LevelSwitcher() {
  const level = useLevelStore((s) => s.level);
  const catalogue = useLevelStore((s) => s.catalogue);
  const setLevel = useLevelStore((s) => s.setLevel);

  if (!catalogue || catalogue.length <= 1) return null;

  return (
    <Segmented
      size="small"
      value={level}
      options={catalogue.map((l) => ({ label: l.key, value: l.key }))}
      onChange={(v) => setLevel(v as Level)}
    />
  );
}
