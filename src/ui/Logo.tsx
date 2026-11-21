export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--color-brand-wash)" />
      <rect x="4" y="4" width="12" height="12" rx="3" fill="var(--color-brand)" />
      <rect x="16" y="16" width="12" height="12" rx="3" fill="var(--color-brand)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
      <LogoMark />
      <span>
        RockChess <span className="font-medium text-ink-soft">Recall</span>
      </span>
    </span>
  );
}
