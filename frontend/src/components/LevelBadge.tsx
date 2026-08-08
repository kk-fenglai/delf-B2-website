import { useLevelStore } from '../stores/level';

// Prominent "current question bank" chip for practice pages. Keyed by level so
// a switch remounts it and the pop animation replays — hard to miss.
export default function LevelBadge() {
  const level = useLevelStore((s) => s.level);
  return (
    <span
      key={level}
      className="level-badge-pop inline-flex items-center px-3 py-1 rounded-full bg-primary text-on-primary text-sm font-bold tracking-wide shadow-level-1 align-middle"
    >
      DELF {level}
    </span>
  );
}
