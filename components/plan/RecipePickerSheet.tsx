"use client";

// Bottom sheet for choosing a recipe for a slot. Search + chips; defaults to the
// slot's Meal Type(s) so "Tuesday dinner" opens on dinners, but every chip clears.

import { thumb } from "@/lib/images";
import { useEffect, useMemo, useState } from "react";
import type { PlannerRecipe, Slot } from "@/lib/plan/types";
import { SLOT_LABEL, SLOT_MEAL_TYPES } from "@/lib/plan/types";
import { suggestPairings } from "@/lib/plan/pairing";
import { formatDayLong } from "@/lib/week";

type Filter = "slot" | "heart" | "try" | "quick" | "recent" | "pairs";

export type LeftoverCandidate = { id: number; recipe_id: string; planned_for: string; slot: Slot; title: string };

// One-off items the household adds again and again ("White rice") — remembered per device.
const RECENT_CUSTOMS_KEY = "gg-recent-customs-v1";

function loadRecentCustoms(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_CUSTOMS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberCustom(text: string) {
  try {
    const next = [text, ...loadRecentCustoms().filter((x) => x.toLowerCase() !== text.toLowerCase())].slice(0, 8);
    localStorage.setItem(RECENT_CUSTOMS_KEY, JSON.stringify(next));
  } catch {
    /* private mode — the add still works */
  }
}

export function RecipePickerSheet({
  day,
  slot,
  recipes,
  leftoverCandidates = [],
  pairWith = [],
  onPick,
  onPickCustom,
  onPickLeftover,
  onClose,
}: {
  day: string;
  slot: Slot;
  recipes: PlannerRecipe[];
  leftoverCandidates?: LeftoverCandidate[];
  /** Mains already in this slot — the picker opens on sides/soups that pair with them. */
  pairWith?: PlannerRecipe[];
  onPick: (recipeId: string) => Promise<void> | void;
  /** Add a one-off item (no recipe behind it), e.g. "White rice". */
  onPickCustom?: (text: string) => Promise<void> | void;
  onPickLeftover?: (plannedMealId: number, recipeId: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"recipes" | "leftovers">("recipes");
  const [filters, setFilters] = useState<Set<Filter>>(new Set([pairWith.length > 0 ? "pairs" : "slot"]));
  const [busy, setBusy] = useState<string | null>(null);
  const [recentCustoms] = useState<string[]>(() => (typeof window === "undefined" ? [] : loadRecentCustoms()));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  function toggle(f: Filter) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const mealTypes = SLOT_MEAL_TYPES[slot];
    // "Pairs" replaces the slot default: sides/soups that go with what's already planned, best match first.
    const base = filters.has("pairs") && pairWith.length > 0 ? suggestPairings(pairWith, recipes).map((s) => s.recipe) : recipes;
    let out = base.filter((r) => {
      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      if (filters.has("slot") && !needle && !(r.meal_type && mealTypes.includes(r.meal_type))) return false;
      if (filters.has("heart") && !(r.tags ?? []).includes("Heart Healthy")) return false;
      if (filters.has("try") && !r.want_to_try) return false;
      if (filters.has("quick")) {
        const t = (r.prep_min ?? 0) + (r.cook_min ?? 0);
        if (t === 0 || t > 30) return false;
      }
      return true;
    });
    if (filters.has("recent")) {
      out = out.slice().sort((a, b) => (b.last_made ?? "").localeCompare(a.last_made ?? ""));
    }
    return out;
  }, [recipes, q, filters, slot, pairWith]);

  async function pick(id: string) {
    setBusy(id);
    await onPick(id);
    setBusy(null);
    onClose();
  }

  async function pickCustom(text: string) {
    if (!onPickCustom) return;
    const t = text.trim().slice(0, 80);
    if (!t) return;
    setBusy(`custom:${t}`);
    await onPickCustom(t);
    rememberCustom(t);
    setBusy(null);
    onClose();
  }

  async function pickLeftover(c: LeftoverCandidate) {
    if (!onPickLeftover) return;
    setBusy(String(c.id));
    await onPickLeftover(c.id, c.recipe_id);
    setBusy(null);
    onClose();
  }

  const chip = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => toggle(f)}
      className={`shrink-0 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors ${
        filters.has(f)
          ? "border-[var(--color-terra)] bg-[var(--color-terra)] text-[var(--color-cream)]"
          : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-terra)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-[var(--color-card)] shadow-2xl sm:max-h-[80vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">
                {SLOT_LABEL[slot]} · {formatDayLong(day)}
              </div>
              <h2 className="font-display-italic mt-1 text-2xl text-[var(--color-ink)]">Add a dish</h2>
            </div>
            <button
              onClick={onClose}
              className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)] hover:text-[var(--color-terra)]"
            >
              Close
            </button>
          </div>
          {leftoverCandidates.length > 0 && (
            <div className="mt-3 flex overflow-hidden rounded-full border border-[var(--color-line)] text-[10px] uppercase tracking-[0.16em]">
              {(["recipes", "leftovers"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 px-3 py-1.5 ${mode === m ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "text-[var(--color-muted)]"}`}
                >
                  {m === "recipes" ? "Recipes" : "Leftovers from this week"}
                </button>
              ))}
            </div>
          )}
          {mode === "recipes" && (
          <>
          <input
            autoFocus={typeof window !== "undefined" && !window.matchMedia("(pointer: coarse)").matches}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipes…"
            className="mt-4 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)]/50 px-4 py-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:border-[var(--color-terra)] focus:outline-none"
          />
          <div className="scrollbar-none -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-3">
            {pairWith.length > 0 && chip("pairs", `Pairs with ${pairWith[0].title.length > 22 ? pairWith[0].title.slice(0, 22) + "…" : pairWith[0].title}`)}
            {chip("slot", SLOT_LABEL[slot])}
            {chip("heart", "Heart healthy")}
            {chip("try", "Want to try")}
            {chip("quick", "≤ 30 min")}
            {chip("recent", "Recent")}
          </div>
          {onPickCustom && !q.trim() && recentCustoms.length > 0 && (
            <div className="scrollbar-none -mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-3">
              <span className="shrink-0 text-[9px] uppercase tracking-[0.16em] text-[var(--color-faint)]">One-offs</span>
              {recentCustoms.map((t) => (
                <button
                  key={t}
                  onClick={() => void pickCustom(t)}
                  disabled={busy !== null}
                  className="shrink-0 rounded-full border border-dashed border-[var(--color-line)] bg-[var(--color-paper)]/30 px-3 py-1 text-[11px] text-[var(--color-body)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)] disabled:opacity-60"
                >
                  {busy === `custom:${t}` ? "…" : `+ ${t}`}
                </button>
              ))}
            </div>
          )}
          </>
          )}
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-[var(--color-line)]/40 overflow-y-auto border-t border-[var(--color-line)]/60 px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {mode === "leftovers" &&
            leftoverCandidates.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => pickLeftover(c)}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-paper)]/60 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base text-[var(--color-ink)]">Leftovers · {c.title}</span>
                    <span className="block text-[11px] text-[var(--color-muted)]">
                      cooked {formatDayLong(c.planned_for)} {SLOT_LABEL[c.slot].toLowerCase()} · no shopping needed
                    </span>
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-terra)]">{busy === String(c.id) ? "…" : "Add"}</span>
                </button>
              </li>
            ))}
          {mode === "recipes" && list.length === 0 && !(onPickCustom && q.trim().length >= 2) && (
            <li className="px-3 py-10 text-center text-sm text-[var(--color-faint)]">No recipes match.</li>
          )}
          {mode === "recipes" && list.length === 0 && onPickCustom && q.trim().length >= 2 && (
            <li className="px-3 pb-2 pt-6 text-center text-sm text-[var(--color-faint)]">No recipes match — add it as a one-off instead:</li>
          )}
          {mode === "recipes" && list.map((r) => {
            const mins = (r.prep_min ?? 0) + (r.cook_min ?? 0);
            return (
              <li key={r.id}>
                <button
                  onClick={() => pick(r.id)}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-paper)]/60 disabled:opacity-60"
                >
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--color-paper-2)]">
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb(r.image_url, 120)!} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base text-[var(--color-ink)]">{r.title}</span>
                    <span className="block truncate text-[11px] text-[var(--color-muted)]">
                      {[r.cuisine, r.meal_type, mins ? `${mins} min` : null].filter(Boolean).join(" · ")}
                      {(r.tags ?? []).includes("Heart Healthy") && (
                        <span className="ml-2 text-[var(--color-sage)]">♥ heart healthy</span>
                      )}
                    </span>
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-terra)]">
                    {busy === r.id ? "…" : "Add"}
                  </span>
                </button>
              </li>
            );
          })}
          {mode === "recipes" && onPickCustom && q.trim().length >= 2 && (
            <li>
              <button
                onClick={() => void pickCustom(q)}
                disabled={busy !== null}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-paper)]/60 disabled:opacity-60"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-paper)]/30 text-lg" aria-hidden>
                  ✎
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base text-[var(--color-ink)]">
                    Add &ldquo;{q.trim().slice(0, 80)}&rdquo; as a one-off
                  </span>
                  <span className="block text-[11px] text-[var(--color-muted)]">no recipe — just a line for the cook, no shopping</span>
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-terra)]">
                  {busy === `custom:${q.trim().slice(0, 80)}` ? "…" : "Add"}
                </span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
