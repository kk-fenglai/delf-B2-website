interface MaterialIconProps {
  name: string;
  /** Filled variant of the symbol */
  fill?: boolean;
  /** Font size in px (default inherits) */
  size?: number;
  className?: string;
}

/** Material Symbols Outlined icon (self-hosted via `material-symbols` npm package). */
export default function MaterialIcon({ name, fill, size, className = '' }: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-outlined select-none leading-none align-middle ${className}`}
      style={{
        fontSize: size,
        fontVariationSettings: fill ? "'FILL' 1" : undefined,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
