import { useLevelStore, findLevelConfig } from '../stores/level';

// Prominent "current question bank" chip for practice pages. Keyed by level so
// a switch remounts it and the pop animation replays — hard to miss.
export default function LevelBadge() {
  const level = useLevelStore((s) => s.level);
  const system = useLevelStore((s) => s.system);
  const systems = useLevelStore((s) => s.systems);
  const catalogue = useLevelStore((s) => s.catalogue);
  // DELF keeps "DELF B2"; single-level systems (TCF_TP…) show the level's
  // learner-facing prefix instead of the internal key.
  const label = system === 'DELF'
    ? `DELF ${level}`
    : findLevelConfig(systems, catalogue, level)?.titlePrefix ?? system;
  return (
    <span
      key={level}
      className="level-badge-pop inline-flex items-center px-3 py-1 rounded-full bg-primary text-on-primary text-sm font-bold tracking-wide shadow-level-1 align-middle"
    >
      {label}
    </span>
  );
}
