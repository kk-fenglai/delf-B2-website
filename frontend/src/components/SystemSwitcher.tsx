import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLevelStore } from '../stores/level';

// Fixed item width in px so the sliding indicator lines up with the buttons.
// Wider than LevelSwitcher's 44px — "IELTS" needs the room.
const ITEM_W = 56;

// Global exam-system switcher (DELF / IELTS). Renders nothing until the
// /api/catalogue lists more than one system — the backend only lists a
// non-DELF system once it has published content, so this stays hidden until
// IELTS actually launches (progressive disclosure, no feature flag needed).
export default function SystemSwitcher() {
  const { t } = useTranslation();
  const system = useLevelStore((s) => s.system);
  const systems = useLevelStore((s) => s.systems);
  const setSystem = useLevelStore((s) => s.setSystem);

  if (!systems || systems.length <= 1) return null;

  const active = systems.findIndex((s) => s.key === system);

  return (
    <div
      role="radiogroup"
      aria-label="Exam system"
      className="relative inline-flex items-center p-1 rounded-full bg-surface-container"
    >
      {active >= 0 && (
        <span
          aria-hidden
          className="absolute left-1 top-1 bottom-1 rounded-full bg-primary shadow-level-1 transition-transform duration-200 ease-out"
          style={{ width: ITEM_W, transform: `translateX(${active * ITEM_W}px)` }}
        />
      )}
      {systems.map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={system === s.key}
          onClick={() => {
            if (s.key === system) return;
            setSystem(s.key);
            message.success(t('system.switched', { system: s.key }));
          }}
          className={`relative z-10 h-7 rounded-full text-[13px] font-bold tracking-wide transition-colors duration-200 ${
            system === s.key ? 'text-on-primary' : 'text-on-surface-variant hover:text-primary'
          }`}
          style={{ width: ITEM_W }}
        >
          {s.key}
        </button>
      ))}
    </div>
  );
}
