"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ParsedIngredientRow, Recipe } from "@/lib/recipes";
import { detectTimers } from "@/lib/timers";
import { requestWakeLock } from "@/lib/wake-lock";
import { renderInlineMd } from "@/lib/markdown";
import { formatRange } from "@/lib/scale";
import { annotateAmounts } from "@/lib/cook/annotate";
import { TimerChip } from "./TimerChip";
import { TimerTray, type ActiveTimer } from "./TimerTray";

// One AudioContext per page, created on the first timer tap (iOS only lets audio start from a gesture).
let sharedAudio: AudioContext | null = null;

type Props = {
  recipe: Recipe;
  steps: string[];
  ingredients?: ParsedIngredientRow[];
};

export function CookMode({ recipe, steps, ingredients = [] }: Props) {
  const router = useRouter();
  const plannedMealId = useSearchParams().get("pm");
  const [stepIndex, setStepIndex] = useState(0);
  const [timers, setTimers] = useState<ActiveTimer[]>([]);
  const [marking, setMarking] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);

  // Mid-cook, the cook WILL switch to WhatsApp or the source video; mobile browsers
  // discard background tabs freely. Keep the step in sessionStorage so a remount
  // lands back on the same step, not on "Slice the tofu" with a pan on the fire.
  const storageKey = `gg-cook-${recipe.id}:${plannedMealId ?? "solo"}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) {
        const n = Number(saved);
        if (Number.isInteger(n) && n > 0) setStepIndex(Math.min(n, steps.length - 1));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    try {
      if (stepIndex > 0) sessionStorage.setItem(storageKey, String(stepIndex));
      else sessionStorage.removeItem(storageKey);
    } catch {}
  }, [stepIndex, storageKey]);

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
      } else if (e.key === "Escape") {
        setShowIngredients(false);
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
      try { sessionStorage.removeItem(storageKey); } catch {}
      router.push(`/recipes/${recipe.id}?cooked=1${plannedMealId ? `&pm=${plannedMealId}` : ""}`);
    } finally {
      setMarking(false);
    }
  }

  const renderedStep = useMemo(
    () => renderStepWithTimers(annotateAmounts(currentStep, ingredients), startTimer),
    [currentStep, ingredients, startTimer]
  );

  // Wet hands: the whole step area pages — left third back, right two-thirds forward.
  // The Prev/Next buttons stay for discoverability; timer chips keep their own tap.
  function onStepAreaClick(e: React.MouseEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a")) return;
    const { left, width } = e.currentTarget.getBoundingClientRect();
    if (e.clientX - left < width / 3) setStepIndex((i) => Math.max(0, i - 1));
    else setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  }

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
            className="btn-quiet px-3 py-1 text-[11px] uppercase tracking-[0.08em]"
          >
            ← Exit
          </Link>
          <div className="text-[12px] text-[var(--color-muted)]">
            Step <span className="font-semibold text-[var(--color-terra)]">{stepIndex + 1}</span> of {steps.length}
          </div>
        </div>
        <div className="mx-auto mt-3 h-px max-w-3xl bg-[var(--color-line)]/50">
          <div
            className="h-full bg-gradient-to-r from-[var(--color-terra)] to-[var(--color-clay)] transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </header>

      <main
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-8 text-center"
        onClick={onStepAreaClick}
      >
        <Link
          href={`/recipes/${recipe.id}`}
          className="font-display-italic text-sm text-[var(--color-clay)] underline-offset-4 hover:underline"
        >
          {recipe.title}
        </Link>
        <div
          className="mt-8 text-balance text-2xl leading-snug text-[var(--color-ink)] sm:text-3xl sm:leading-relaxed"
          style={{ maxWidth: "32ch" }}
        >
          {renderedStep}
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] bg-[var(--color-card)]/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="btn-quiet px-4 py-3 text-sm font-medium disabled:opacity-40"
          >
            ← Prev
          </button>

          <button
            onClick={() => setShowIngredients(true)}
            className="btn-quiet px-4 py-3 text-sm font-medium"
            aria-haspopup="dialog"
          >
            Ingredients
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

      {showIngredients && (
        <IngredientsPeek recipe={recipe} ingredients={ingredients} onClose={() => setShowIngredients(false)} />
      )}

      <TimerTray
        timers={timers}
        onDismiss={dismissTimer}
        onElapsed={elapsedTimer}
      />
    </div>
  );
}

/** Slide-up ingredient amounts, reachable from every step — no leaving the cook flow. */
function IngredientsPeek({
  recipe,
  ingredients,
  onClose,
}: {
  recipe: Recipe;
  ingredients: ParsedIngredientRow[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="peek-title"
    >
      <div
        className="animate-slide-up max-h-[75vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--color-card)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-muted)]">
              As written{recipe.servings ? ` · serves ${recipe.servings}` : ""}
            </div>
            <h2 id="peek-title" className="font-display-italic mt-1 text-2xl text-[var(--color-ink)]">
              Ingredients
            </h2>
          </div>
          <button onClick={onClose} className="btn-quiet px-3 py-1 text-[11px] uppercase tracking-[0.08em]">
            Close
          </button>
        </div>
        <ul className="mt-4 pb-2">
          {ingredients.map((ing) => (
            <li key={ing.line_index} className="flex items-start gap-3 border-b border-[var(--color-line)]/50 py-2 text-sm last:border-0">
              {ing.qty_min !== null ? (
                <span className="w-[4.25rem] shrink-0 text-right font-semibold tabular-nums text-[var(--color-ink)]">
                  {formatRange(ing.qty_min, ing.qty_max)}
                  {ing.unit && <span className="text-[12px] font-normal text-[var(--color-muted)]"> {ing.unit}</span>}
                </span>
              ) : (
                <span className="w-[4.25rem] shrink-0" aria-hidden />
              )}
              <span className={`min-w-0 flex-1 ${ing.to_taste || ing.qty_min === null ? "italic text-[var(--color-muted)]" : "text-[var(--color-body)]"}`}>
                {ing.name ?? ing.raw}
                {ing.modifier && <span className="text-[var(--color-muted)]">, {ing.modifier}</span>}
              </span>
            </li>
          ))}
          {ingredients.length === 0 && (
            <li className="py-3 text-sm italic text-[var(--color-muted)]">No parsed ingredients for this recipe.</li>
          )}
        </ul>
      </div>
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
  let afterChip = false;

  const pushText = (s: string) => {
    // No floating space before punctuation right after a timer chip ("10 min . Pat dry").
    const cleaned = afterChip ? s.replace(/^\s+(?=[.,;:!?])/, "") : s;
    afterChip = false;
    if (!cleaned) return;
    out.push(<span key={`s-${key++}`}>{renderInlineMd(cleaned)}</span>);
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
    afterChip = true;
  }
  if (cursor < text.length) pushText(text.slice(cursor));
  return out;
}
