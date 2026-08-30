"use client";

// The randomizer. Opens scoped to the week (header die) or one day (day-card die),
// takes a theme — who added it, healthy, cuisine, quick, want-to-try, favourites —
// shows honestly what the theme can fill, then rolls. "Roll again" re-rolls only
// what the last roll placed, so a bad draw is one tap from a fresh one and
// hand-picked meals are never touched. Cooked meals are never touched, period.

import { useEffect, useMemo, useState } from "react";
import type { PlannedMeal, PlannerRecipe, Slot } from "@/lib/plan/types";
import { SLOT_LABEL } from "@/lib/plan/types";
import { filterPool, ROLL_SLOT_MEAL_TYPES, type RollFilters } from "@/lib/plan/randomize";
import type { ConstraintStatus } from "@/lib/plan/constraints";
import { formatDayLong, weekDates } from "@/lib/week";
import { Die } from "./Die";

export type RollScope = { kind: "week" } | { kind: "day"; day: string } | { kind: "slot"; day: string; slot: Slot };

const THEME_KEY = "gg-roll-theme-v1";
const ROLL_SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

export function loadSavedTheme(): RollFilters {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RollFilters;
  } catch {
    return {};
  }
}

export function saveTheme(f: RollFilters) {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(f));
  } catch {
    /* private mode etc. — the roll still works */
  }
}

type RollResponse = {
  added: PlannedMeal[];
  added_ids: number[];
  removed: number;
  unfilled: { planned_for: string; slot: Slot }[];
  pool: number;
  constraints: ConstraintStatus[];
  error?: string;
};

export function RandomizeSheet({
  scope,
  weekOf,
  meals,
  recipes,
  onDone,
  onClose,
}: {
  scope: RollScope;
  weekOf: string;
  meals: PlannedMeal[];
  recipes: PlannerRecipe[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [filters, setFilters] = useState<RollFilters>(() => loadSavedTheme());
  const [mode, setMode] = useState<"fill_empty" | "replace">("fill_empty");
  const [includeSunday, setIncludeSunday] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ addedIds: number[]; added: number; unfilled: number; constraints: ConstraintStatus[] } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const days = useMemo(() => weekDates(weekOf), [weekOf]);
  const scopeDays = scope.kind === "week" ? (includeSunday ? days : days.slice(0, 6)) : [scope.day];
  const scopeSlots = scope.kind === "slot" ? [scope.slot] : ROLL_SLOTS;

  // What the roll can actually touch, given mode + cooked protection.
  const { fillable, cookedKept } = useMemo(() => {
    const byCell = new Map<string, PlannedMeal[]>();
    for (const m of meals) {
      const k = `${m.planned_for}|${m.slot}`;
      byCell.set(k, [...(byCell.get(k) ?? []), m]);
    }
    const cells: { day: string; slot: Slot }[] = [];
    let kept = 0;
    for (const d of scopeDays) {
      for (const s of scopeSlots) {
        const cellMeals = byCell.get(`${d}|${s}`) ?? [];
        const cooked = cellMeals.some((m) => m.cooked_at !== null);
        if (cooked) kept += cellMeals.length;
        else if (cellMeals.length === 0) cells.push({ day: d, slot: s });
        else if (mode === "replace") cells.push({ day: d, slot: s });
      }
    }
    return { fillable: cells, cookedKept: kept };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals, scopeDays.join(","), scopeSlots.join(","), mode]);

  const pool = useMemo(() => filterPool(recipes, filters), [recipes, filters]);
  const slotGaps = useMemo(() => {
    const need = new Set(fillable.map((c) => c.slot));
    return [...need].filter((s) => !pool.some((r) => r.meal_type && ROLL_SLOT_MEAL_TYPES[s].includes(r.meal_type)));
  }, [fillable, pool]);

  const cuisines = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) if (r.cuisine) counts.set(r.cuisine, (counts.get(r.cuisine) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 12);
  }, [recipes]);

  function upd(p: Partial<RollFilters>) {
    setFilters((f) => ({ ...f, ...p }));
    setResult(null);
    setError(null);
  }
  const toggleCuisine = (c: string) =>
    upd({ cuisines: (filters.cuisines ?? []).includes(c) ? (filters.cuisines ?? []).filter((x) => x !== c) : [...(filters.cuisines ?? []), c] });

  async function roll(replaceIds?: number[]) {
    setBusy(true);
    setError(null);
    try {
      const body =
        replaceIds && replaceIds.length > 0
          ? { week_of: weekOf, filters, replace_ids: replaceIds }
          : scope.kind === "slot"
            ? { week_of: weekOf, days: [scope.day], slots: [scope.slot], filters, mode }
            : scope.kind === "day"
              ? { week_of: weekOf, days: [scope.day], filters, mode }
              : { week_of: weekOf, filters, mode, include_sunday: includeSunday };
      const res = await fetch("/api/plan/randomize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as RollResponse;
      if (!res.ok) {
        setError(j.error ?? `Failed (${res.status})`);
        return;
      }
      saveTheme(filters);
      setResult({ addedIds: j.added_ids, added: j.added.length, unfilled: j.unfilled.length, constraints: j.constraints });
      onDone();
    } catch {
      setError("No connection — try again.");
    } finally {
      setBusy(false);
    }
  }

  const themeCount = [filters.source, filters.healthy, filters.quick, filters.wantToTry, filters.favourites]
    .filter(Boolean).length + (filters.cuisines?.length ? 1 : 0);
  const scopeLabel =
    scope.kind === "slot"
      ? `${formatDayLong(scope.day)} ${SLOT_LABEL[scope.slot].toLowerCase()}`
      : scope.kind === "day"
        ? formatDayLong(scope.day)
        : "this week";
  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} onClick={onClick} data-on={on} className="chip-toggle shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em]">
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--color-ink)]/45 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="roll-title"
    >
      <div
        className="animate-slide-up flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-[var(--color-card)] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-muted)]">
                Randomize · {scope.kind === "week" ? "Week" : scope.kind === "day" ? formatDayLong(scope.day) : `${formatDayLong(scope.day)} · ${SLOT_LABEL[scope.slot]}`}
              </div>
              <h2 id="roll-title" className="font-display-italic mt-1 flex items-center gap-2 text-2xl text-[var(--color-ink)]">
                <Die size={24} className={`shrink-0 text-[var(--color-terra)] ${busy ? "animate-dice" : ""}`} />
                Roll {scope.kind === "week" ? "the week" : scope.kind === "day" ? "the day" : SLOT_LABEL[scope.slot].toLowerCase()}
              </h2>
            </div>
            <button onClick={onClose} className="btn-quiet px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
              Close
            </button>
          </div>

          {/* Theme */}
          <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-[var(--color-muted)]">Added by</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Lydia", "Johnny", "Claude"].map((s) =>
              chip(filters.source === s, s, () => upd({ source: filters.source === s ? null : s })),
            )}
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[var(--color-muted)]">Style</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {chip(!!filters.healthy, "♥ Heart healthy", () => upd({ healthy: !filters.healthy }))}
            {chip(!!filters.quick, "≤ 30 min", () => upd({ quick: !filters.quick }))}
            {chip(!!filters.wantToTry, "Want to try", () => upd({ wantToTry: !filters.wantToTry }))}
            {chip(!!filters.favourites, "★ Favourites", () => upd({ favourites: !filters.favourites }))}
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[var(--color-muted)]">Cuisine</div>
          {/* Edge fade tells the thumb there are more chips off-screen. */}
          <div
            className="scrollbar-none -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1"
            style={{ WebkitMaskImage: "linear-gradient(to right, black 0, black calc(100% - 2.5rem), transparent 100%)", maskImage: "linear-gradient(to right, black 0, black calc(100% - 2.5rem), transparent 100%)" }}
          >
            {cuisines.map((c) => chip((filters.cuisines ?? []).includes(c), c, () => toggleCuisine(c)))}
          </div>

          {/* Honest availability line */}
          <div className="mt-4 rounded-xl border border-[var(--color-line-soft)] bg-[var(--color-paper)]/45 px-3.5 py-2.5 text-xs text-[var(--color-body)]">
            <span className="font-semibold">{pool.length}</span> {themeCount ? "match the theme" : "dishes in the pantry"} ·{" "}
            <span className="font-semibold">{fillable.length}</span> {mode === "replace" ? (fillable.length === 1 ? "slot to re-roll" : "slots to re-roll") : (fillable.length === 1 ? "empty slot" : "empty slots")} {scope.kind === "week" ? "Mon–Sat" : ""}
            {cookedKept > 0 && <span className="text-[var(--color-sage)]"> · {cookedKept} cooked kept</span>}
            {slotGaps.length > 0 && fillable.length > 0 && (
              <div className="mt-1 text-[11px] text-[var(--color-terra-dark)]">
                No {themeCount ? "matching" : ""} {slotGaps.map((s) => SLOT_LABEL[s].toLowerCase()).join(" or ")} recipes — those slots will stay open.
              </div>
            )}
            {pool.length > 0 && pool.length < fillable.length && (
              <div className="mt-1 text-[11px] text-[var(--color-mustard)]">Small pool — some dishes will repeat across the week.</div>
            )}
          </div>

          {/* Mode + Sunday */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-muted)]">
            <label className="flex min-h-9 items-center gap-1.5">
              <input type="radio" name="roll-mode" checked={mode === "fill_empty"} onChange={() => { setMode("fill_empty"); setResult(null); }} className="accent-[var(--color-terra)]" />
              Fill empty slots
            </label>
            <label className="flex min-h-9 items-center gap-1.5">
              <input type="radio" name="roll-mode" checked={mode === "replace"} onChange={() => { setMode("replace"); setResult(null); }} className="accent-[var(--color-terra)]" />
              Re-roll everything
            </label>
            {scope.kind === "week" && (
              <label className="flex min-h-9 items-center gap-1.5">
                <input type="checkbox" checked={includeSunday} onChange={(e) => { setIncludeSunday(e.target.checked); setResult(null); }} className="accent-[var(--color-terra)]" />
                Include Sunday
              </label>
            )}
          </div>
          {mode === "replace" && !result && (
            <p className="mt-1 text-[11px] text-[var(--color-terra-dark)]">Replaces every planned meal in {scopeLabel} with a fresh roll. Cooked meals stay.</p>
          )}

          {/* Roll / result */}
          {!result ? (
            <button
              onClick={() => void roll()}
              disabled={busy || fillable.length === 0 || pool.length === 0}
              className="btn-primary mt-4 w-full px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em]"
            >
              {busy ? "Rolling…" : fillable.length === 0 ? (mode === "fill_empty" ? "Nothing empty to fill" : "Nothing to re-roll") : pool.length === 0 ? "No dishes match" : `Roll ${fillable.length} ${fillable.length === 1 ? "slot" : "slots"}`}
            </button>
          ) : (
            <div className="mt-4 rounded-2xl border border-[var(--color-sage)]/40 bg-[var(--color-sage)]/10 p-3.5">
              <p className="text-sm text-[var(--color-ink)]">
                <span className="font-semibold">{result.added} {result.added === 1 ? "meal" : "meals"} rolled in.</span>
                {result.unfilled > 0 && <span className="text-[var(--color-terra-dark)]"> {result.unfilled} left open (no match).</span>}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {result.constraints.map((c) => (
                  <span
                    key={c.key}
                    className={
                      c.state === "violated"
                        ? "rounded-full bg-[var(--color-terra)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-cream)]"
                        : c.state === "met"
                          ? "text-[11px] font-medium text-[var(--color-sage)]"
                          : "text-[11px] text-[var(--color-muted)]"
                    }
                  >
                    {c.text}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => void roll(result.addedIds)} disabled={busy || result.addedIds.length === 0} className="btn-ink flex-1 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]">
                  {busy ? "Rolling…" : <><Die size={12} /> Roll those again</>}
                </button>
                <button onClick={onClose} className="btn-quiet flex-1 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]">
                  Done
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-[var(--color-terra-dark)]">{error}</p>}
          <p className="mt-3 text-[10px] leading-relaxed text-[var(--color-faint)]">
            Rolls respect the week&rsquo;s guard rails — oily fish up, chicken and shellfish capped — skip anything cooked, avoid repeats and recent dishes, lean into your 4★+ favourites, and never roll anything rated 2★ or below.
          </p>
        </div>
      </div>
    </div>
  );
}
