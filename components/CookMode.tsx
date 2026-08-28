"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Recipe } from "@/lib/recipes";
import { detectTimers } from "@/lib/timers";
import { requestWakeLock } from "@/lib/wake-lock";
import { renderInlineMd } from "@/lib/markdown";
import { TimerChip } from "./TimerChip";
import { TimerTray, type ActiveTimer } from "./TimerTray";

// One AudioContext per page, created on the first timer tap (iOS only lets audio start from a gesture).
let sharedAudio: AudioContext | null = null;

type Props = {
  recipe: Recipe;
  steps: string[];
};

export function CookMode({ recipe, steps }: Props) {
  const router = useRouter();
  const plannedMealId = useSearchParams().get("pm");
  const [stepIndex, setStepIndex] = useState(0);
  const [timers, setTimers] = useState<ActiveTimer[]>([]);
  const [marking, setMarking] = useState(false);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      const lock = await requestWakeLock();
      if (cancelled) {
        lock?.release();
      } else {
        wakeRef.current = lock;
      }
    }
    acquire();
    const onVis = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      wakeRef.current?.release();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setStepIndex((i) => Math.min(steps.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length]);

  const currentStep = steps[stepIndex] ?? "";
  const isLast = stepIndex === steps.length - 1;

  const startTimer = useCallback((seconds: number, label: string) => {
    // iOS only lets audio start from a tap: create/resume the context here, reuse it when the timer ends.
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!sharedAudio && AC) sharedAudio = new AC();
      void sharedAudio?.resume();
    } catch {}
    const t: ActiveTimer = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      totalSeconds: seconds,
      startedAt: performance.now(),
    };
    setTimers((prev) => [...prev, t]);
  }, []);

  const dismissTimer = useCallback((id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const elapsedTimer = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, notifiedAt: Date.now() } : t))
    );
    try {
      navigator.vibrate?.([300, 120, 300]);
    } catch {}
    try {
      const ctx =
        sharedAudio ??
        new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      void ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o.start();
      o.stop(ctx.currentTime + 0.6);
    } catch {}
  }, []);

  async function markCooked() {
    setMarking(true);
    try {
      await fetch("/api/cook-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipe_id: recipe.id,
          planned_meal_id: plannedMealId ? Number(plannedMealId) : null,
        }),
      });
      router.push(`/recipes/${recipe.id}?cooked=1${plannedMealId ? `&pm=${plannedMealId}` : ""}`);
    } finally {
      setMarking(false);
    }
  }

  const renderedStep = useMemo(
    () => renderStepWithTimers(currentStep, startTimer),
    [currentStep, startTimer]
  );

  if (steps.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20 text-center">
        <p className="text-[var(--color-muted)]">No method steps found for this recipe.</p>
        <Link
          href={`/recipes/${recipe.id}`}
          className="btn-quiet mt-6 px-4 py-2 text-sm"
        >
          ← back to recipe
        </Link>
      </main>
    );
  }

  return (
    <div className="relative z-10 min-h-screen pb-44 flex flex-col">
      <header className="border-b border-[var(--color-line)] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href={`/recipes/${recipe.id}`}
            className="btn-quiet px-3 py-1 text-[10px] uppercase tracking-[0.18em]"
          >
            ← Exit
          </Link>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            <span className="text-[var(--color-terra)]">{String(stepIndex + 1).padStart(2, "0")}</span>
            <span className="mx-1">·</span>
            <span>{String(steps.length).padStart(2, "0")}</span>
          </div>
        </div>
        <div className="mx-auto mt-3 h-px max-w-3xl bg-[var(--color-line)]/50">
          <div
            className="h-full bg-gradient-to-r from-[var(--color-terra)] to-[var(--color-clay)] transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <div className="font-display-italic text-[var(--color-clay)] text-sm">
          {recipe.title}
        </div>
        <div
          className="mt-8 text-balance text-2xl leading-snug text-[var(--color-ink)] sm:text-3xl sm:leading-relaxed"
          style={{ maxWidth: "32ch" }}
        >
          {renderedStep}
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] bg-[var(--color-card)]/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <button
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="btn-quiet px-5 py-3 text-sm font-medium disabled:opacity-40"
          >
            ← Prev
          </button>

          {isLast ? (
            <button
              onClick={markCooked}
              disabled={marking}
              className="flex items-center gap-2 rounded-full bg-[var(--color-sage)] px-6 py-3 text-sm font-medium text-[var(--color-cream)] shadow-sm transition-colors hover:brightness-95 disabled:opacity-60"
            >
              {marking ? "Saving…" : "✓ Cooked it"}
            </button>
          ) : (
            <button
              onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
              className="btn-primary px-6 py-3 text-sm font-medium"
            >
              Next →
            </button>
          )}
        </div>
      </footer>

      <TimerTray
        timers={timers}
        onDismiss={dismissTimer}
        onElapsed={elapsedTimer}
      />
    </div>
  );
}

function renderStepWithTimers(
  text: string,
  onStart: (s: number, label: string) => void
): React.ReactNode[] {
  const timers = detectTimers(text);
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  const pushText = (s: string) => {
    if (!s) return;
    out.push(<span key={`s-${key++}`}>{renderInlineMd(s)}</span>);
  };

  for (const t of timers) {
    if (t.start > cursor) pushText(text.slice(cursor, t.start));
    out.push(
      <TimerChip
        key={`t-${t.start}-${key++}`}
        seconds={t.seconds}
        label={t.raw}
        onStart={onStart}
      />
    );
    cursor = t.end;
  }
  if (cursor < text.length) pushText(text.slice(cursor));
  return out;
}
