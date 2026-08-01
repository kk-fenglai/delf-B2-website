interface ProgressRingProps {
  /** 0–100; null renders an empty ring with a dash label */
  percent: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

// Ring color mirrors the mockup: amber when weak, primary when strong, teal otherwise.
function ringColor(percent: number) {
  if (percent < 50) return '#ca8a04';
  if (percent >= 80) return '#004ac6';
  return '#005e6b';
}

/** SVG circular progress ring (dashboard skill mastery). */
export default function ProgressRing({ percent, size = 96, strokeWidth = 8, label }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="progress-ring -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e9edff"
          strokeWidth={strokeWidth}
        />
        {percent != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor(clamped)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-on-surface tabular-nums">
          {percent == null ? '—' : `${Math.round(clamped)}%`}
        </span>
        {label && <span className="text-[11px] text-on-surface-variant">{label}</span>}
      </div>
    </div>
  );
}
