// Themed randomizer: pick recipes for empty plan cells under a theme (who added it,
// healthy, cuisine, quick, want-to-try, favourites) while respecting the dietitian
// guard rails (oily fish ≥ 3 · chicken ≤ 1 · prawn/seafood ≤ 2) and avoiding repeats.
//
// Pure and side-effect free: the API route feeds it recipes + current meals and inserts
// what it returns; the sheet reuses filterPool/poolBySlot for its live match counts.

import type { PlannerRecipe, Slot } from "./types";
import type { ProteinClass } from "./constraints";

export type RollFilters = {
  /**
   * Whose food: Notion Source select — "Lydia" | "Johnny" | "Claude".
   * "Lydia" also matches the `Lydia` TAG: her 26 saved-video recipes were
   * bulk-imported under Source=Johnny/Claude and carry the tag instead, so a
   * pure source match rolled 0 dishes for the theme the hero copy promises.
   */
  source?: string | null;
  /** Tags include "Heart Healthy". */
  healthy?: boolean;
  /** OR within the list; empty/undefined = any cuisine. */
  cuisines?: string[];
  /** prep+cook ≤ 30 min (recipes without a time are excluded). */
  quick?: boolean;
  wantToTry?: boolean;
  /** rating ≥ 4. */
  favourites?: boolean;
};

export type RollCell = { planned_for: string; slot: Slot };
export type RollPick = { planned_for: string; slot: Slot; recipe_id: string };

/** Meals already staying in the week (cooked, or outside the roll's scope). */
export type KeepMeal = { recipe_id: string; slot: string; leftover_of: number | null };

/**
 * Rolls place one main per cell, so slots map to their main Meal Type only —
 * no Sides as a whole dinner, no Desserts as a snack.
 */
export const ROLL_SLOT_MEAL_TYPES: Record<Slot, string[]> = {
  breakfast: ["Breakfast"],
  lunch: ["Lunch"],
  dinner: ["Dinner"],
  snack: ["Snack"],
};

export function matchesFilters(r: PlannerRecipe, f: RollFilters): boolean {
  // The household has spoken: dishes rated 2 or below never roll again.
  if (r.rating !== null && r.rating <= 2) return false;
  if (f.source) {
    const bySource = r.source === f.source;
    const byPickTag = f.source === "Lydia" && (r.tags ?? []).includes("Lydia");
    if (!bySource && !byPickTag) return false;
  }
  if (f.healthy && !(r.tags ?? []).includes("Heart Healthy")) return false;
  if (f.cuisines && f.cuisines.length > 0 && !(r.cuisine && f.cuisines.includes(r.cuisine))) return false;
  if (f.quick) {
    const t = (r.prep_min ?? 0) + (r.cook_min ?? 0);
    if (t === 0 || t > 30) return false;
  }
  if (f.wantToTry && !r.want_to_try) return false;
  if (f.favourites && !((r.rating ?? 0) >= 4)) return false;
  return true;
}

/** Theme filter only — slot matching happens per cell. */
export function filterPool(recipes: PlannerRecipe[], f: RollFilters): PlannerRecipe[] {
  return recipes.filter((r) => matchesFilters(r, f));
}

/** The themed pool split by slot, for live counts and empty-slot warnings. */
export function poolBySlot(recipes: PlannerRecipe[], f: RollFilters, slots: Slot[]): Record<Slot, PlannerRecipe[]> {
  const pool = filterPool(recipes, f);
  const out = {} as Record<Slot, PlannerRecipe[]>;
  for (const s of slots) {
    out[s] = pool.filter((r) => r.meal_type && ROLL_SLOT_MEAL_TYPES[s].includes(r.meal_type));
  }
  return out;
}

const CHICKEN_CAP = 1;
const SHELLFISH_CAP = 2;
const OILY_FLOOR = 3;

type Counts = { chicken: number; shellfish: number; oily: number };

function countsFrom(recipeIds: string[], classByRecipe: Record<string, ProteinClass[]>): Counts {
  const c: Counts = { chicken: 0, shellfish: 0, oily: 0 };
  for (const id of recipeIds) {
    const cls = new Set(classByRecipe[id] ?? []);
    if (cls.has("chicken")) c.chicken++;
    if (cls.has("prawn") || cls.has("seafood")) c.shellfish++;
    if (cls.has("oily_fish")) c.oily++;
  }
  return c;
}

/** Weighted sample; weights must be > 0. Returns the index. */
function sample(weights: number[], rng: () => number): number {
  let total = 0;
  for (const w of weights) total += w;
  let t = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i];
    if (t <= 0) return i;
  }
  return weights.length - 1;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

export type RollResult = {
  picks: RollPick[];
  /** Cells with no matching recipe under the theme. */
  unfilled: RollCell[];
  /** Size of the themed pool across all slots (before slot matching). */
  pool: number;
};

/**
 * Fill `cells` from `recipes` under `filters`.
 * - one pick per cell, matched to the slot's main meal type
 * - never repeats a recipe within the week if an alternative exists
 * - keeps chicken ≤ 1 and prawn/seafood ≤ 2 (counting `keepMeals`) unless a cell has no other option
 * - boosts oily fish until the week reaches ≥ 3
 * - nudges away from dishes made in the last 10 days
 */
export function rollCells(opts: {
  cells: RollCell[];
  recipes: PlannerRecipe[];
  filters: RollFilters;
  classByRecipe: Record<string, ProteinClass[]>;
  keepMeals: KeepMeal[];
  today?: string; // YYYY-MM-DD, for recency weighting
  rng?: () => number;
}): RollResult {
  const { cells, recipes, filters, classByRecipe, keepMeals } = opts;
  const rng = opts.rng ?? Math.random;
  const themed = filterPool(recipes, filters);

  const kept = keepMeals.filter((m) => m.leftover_of === null).map((m) => m.recipe_id);
  const counts = countsFrom(kept, classByRecipe);
  const used = new Set(keepMeals.map((m) => m.recipe_id));

  const picks: RollPick[] = [];
  const unfilled: RollCell[] = [];

  for (const cell of cells) {
    const types = ROLL_SLOT_MEAL_TYPES[cell.slot];
    const slotPool = themed.filter((r) => r.meal_type && types.includes(r.meal_type));
    if (slotPool.length === 0) {
      unfilled.push(cell);
      continue;
    }

    const capOk = slotPool.filter((r) => {
      const cls = new Set(classByRecipe[r.id] ?? []);
      if (cls.has("chicken") && counts.chicken >= CHICKEN_CAP) return false;
      if ((cls.has("prawn") || cls.has("seafood")) && counts.shellfish >= SHELLFISH_CAP) return false;
      return true;
    });
    let pool = capOk.length > 0 ? capOk : slotPool; // a full cap never leaves a cell empty
    const fresh = pool.filter((r) => !used.has(r.id));
    if (fresh.length > 0) pool = fresh;

    const weights = pool.map((r) => {
      let w = 1;
      const cls = new Set(classByRecipe[r.id] ?? []);
      if (counts.oily < OILY_FLOOR && cls.has("oily_fish")) w *= 4;
      if (opts.today && r.last_made && daysBetween(opts.today, r.last_made) <= 10) w *= 0.3;
      // Ratings bite: 4★ 1.5× · 4.5★ 2× · 5★ 2.5×; a 2.5 limps at half weight (≤2 never reaches the pool).
      if (r.rating !== null) {
        if (r.rating >= 4) w *= r.rating - 2.5;
        else if (r.rating === 2.5) w *= 0.5;
      }
      return w;
    });

    const chosen = pool[sample(weights, rng)];
    picks.push({ planned_for: cell.planned_for, slot: cell.slot, recipe_id: chosen.id });
    used.add(chosen.id);
    const cls = new Set(classByRecipe[chosen.id] ?? []);
    if (cls.has("chicken")) counts.chicken++;
    if (cls.has("prawn") || cls.has("seafood")) counts.shellfish++;
    if (cls.has("oily_fish")) counts.oily++;
  }

  return { picks, unfilled, pool: themed.length };
}
