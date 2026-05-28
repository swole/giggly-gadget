"use client";

export function TimerChip({
  seconds,
  label,
  onStart,
}: {
  seconds: number;
  label: string;
  onStart: (s: number, label: string) => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onStart(seconds, label);
      }}
      className="inline-flex items-baseline gap-1 rounded-md border border-[var(--color-terra)]/50 bg-[var(--color-terra)]/10 px-1.5 py-px font-display text-[var(--color-terra)] transition-colors hover:border-[var(--color-terra)]/80 hover:bg-[var(--color-terra)]/15"
    >
      <span className="text-[10px] leading-none text-[var(--color-clay)]">◷</span>
      {label}
    </button>
  );
}
