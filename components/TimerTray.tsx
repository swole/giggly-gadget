"use client";

import { useEffect, useState } from "react";

export type ActiveTimer = {
  id: string;
  label: string;
  totalSeconds: number;
  startedAt: number;
  notifiedAt?: number;
};

type Props = {
  timers: ActiveTimer[];
  onDismiss: (id: string) => void;
  onElapsed: (id: string) => void;
};

export function TimerTray({ timers, onDismiss, onElapsed }: Props) {
  // Ticks once a second while any timer runs; `now` is state so render stays pure.
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (timers.length === 0) return;
    const i = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(i);
  }, [timers.length]);

  useEffect(() => {
    for (const t of timers) {
      const elapsedMs = performance.now() - t.startedAt;
      const remaining = t.totalSeconds * 1000 - elapsedMs;
      if (remaining <= 0 && !t.notifiedAt) {
        onElapsed(t.id);
      }
    }
  }, [timers, onElapsed]);

  if (timers.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.9rem+env(safe-area-inset-bottom))] z-40 border-t border-[var(--color-line)] bg-[var(--color-card)]/95 px-4 py-3 backdrop-blur-sm shadow-[0_-4px_12px_rgba(43,24,16,0.06)] sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-wrap gap-3">
        {timers.map((t) => {
          const elapsedMs = now - t.startedAt;
          const remaining = Math.max(0, Math.ceil((t.totalSeconds * 1000 - elapsedMs) / 1000));
          const done = remaining === 0;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                done
                  ? "animate-pulse border-[var(--color-terra)] bg-[var(--color-terra)]/15"
                  : "border-[var(--color-line)] bg-[var(--color-paper-2)]/50"
              }`}
            >
              <span className="text-[12px] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                {t.label}
              </span>
              <span className="font-display text-2xl tabular-nums text-[var(--color-terra)]">
                {formatMMSS(remaining)}
              </span>
              <button
                onClick={() => onDismiss(t.id)}
                className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                aria-label="Dismiss timer"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatMMSS(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
