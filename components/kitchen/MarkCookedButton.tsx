"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Mark cooked" for a planned meal. Posts to /api/cook-log, which logs the cook,
 * bumps recipes.last_made (SG date) and stamps planned_meals.cooked_at / cooked_by.
 * Realtime carries the cooked state to every other phone. A mis-tap can be undone
 * (8 s window right after, or tap the badge later to un-mark).
 */
export function MarkCookedButton({
  recipeId,
  plannedMealId,
  cookedAt,
  size = "md",
  onCooked,
}: {
  recipeId: string;
  plannedMealId: number;
  cookedAt: string | null;
  size?: "sm" | "md";
  /** Fired once when the meal is marked cooked from this device (for celebrations). */
  onCooked?: () => void;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "undo-offer" | "confirm-unmark">(cookedAt ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime can flip cooked_at from another phone; follow it unless we are mid-interaction.
  const [prevCookedAt, setPrevCookedAt] = useState(cookedAt);
  if (prevCookedAt !== cookedAt) {
    setPrevCookedAt(cookedAt);
    if (state !== "busy" && state !== "undo-offer" && state !== "confirm-unmark") setState(cookedAt ? "done" : "idle");
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/cook-log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Could not save (${res.status})`);
        return false;
      }
      setError(null);
      return true;
    } catch {
      setError("No connection — try again");
      return false;
    }
  }

  async function mark() {
    if (state !== "idle") return;
    setState("busy");
    const ok = await post({ recipe_id: recipeId, planned_meal_id: plannedMealId });
    if (!ok) return setState("idle");
    try { navigator.vibrate?.(12); } catch {}
    onCooked?.();
    setState("undo-offer");
    timer.current = setTimeout(() => setState((s) => (s === "undo-offer" ? "done" : s)), 8000);
  }

  async function unmark() {
    if (timer.current) clearTimeout(timer.current);
    setState("busy");
    const ok = await post({ recipe_id: recipeId, planned_meal_id: plannedMealId, undo: true });
    setState(ok ? "idle" : "done");
  }

  const base =
    size === "sm"
      ? "min-h-9 rounded-full px-3 text-[10px] uppercase tracking-[0.16em]"
      : "min-h-11 rounded-full px-4 text-[11px] uppercase tracking-[0.18em]";

  if (state === "undo-offer") {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={`${base} inline-flex items-center gap-1.5 bg-[var(--color-sage)]/15 font-medium text-[var(--color-sage)]`}>
          <span aria-hidden>✓</span> Cooked
        </span>
        <button onClick={unmark} className={`${base} border border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-terra)]`}>
          Undo
        </button>
      </span>
    );
  }
  if (state === "confirm-unmark") {
    return (
      <span className="inline-flex items-center gap-1">
        <button onClick={unmark} className={`${base} bg-[var(--color-terra)] font-medium text-[var(--color-cream)]`}>
          Un-mark
        </button>
        <button onClick={() => setState("done")} className={`${base} border border-[var(--color-line)] text-[var(--color-muted)]`} aria-label="Keep as cooked">
          Keep
        </button>
      </span>
    );
  }
  if (state === "done") {
    return (
      <button
        onClick={() => setState("confirm-unmark")}
        className={`${base} inline-flex items-center gap-1.5 bg-[var(--color-sage)]/15 font-medium text-[var(--color-sage)]`}
        title="Tap to un-mark"
      >
        <span aria-hidden>✓</span> Cooked
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={mark}
        disabled={state === "busy"}
        className={`${base} bg-[var(--color-ink)] font-medium text-[var(--color-cream)] shadow-sm transition-all hover:bg-[var(--color-sage)] active:scale-[0.97] disabled:opacity-60`}
      >
        {state === "busy" ? "Saving…" : "Mark cooked"}
      </button>
      {error && <span className="text-[10px] text-[var(--color-terra-dark)]">{error}</span>}
    </span>
  );
}
