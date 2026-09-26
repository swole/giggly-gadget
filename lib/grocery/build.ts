// Build (or rebuild) a week's grocery list from its planned meals.
//
// planned_meals (week) → ingredients_parsed (those recipes) → per-line eaters factor
// → buildGroceryList() unit-converting merge → staple flag + shop → reconcile against
// existing rows → apply. Manual rows and checked state survive; ids stay stable.

import { supabaseAdmin } from "@/lib/supabase/server";
import { buildGroceryList, type GroceryItemInput } from "@/lib/ingredients/normalize";
import { eatersFactor, type Eaters } from "@/lib/portions";
import { addDays } from "@/lib/week";
import { leftoverSources, mealTravel } from "@/lib/plan/travel";
import { getTripsOverlapping } from "@/lib/plan/queries";
import type { Slot } from "@/lib/plan/types";
import { isStaple, toStapleSet } from "./staples";
import { shopFor } from "./shop";
import { reconcileGrocery, type DesiredRow, type ExistingRow } from "./reconcile";

export type BuildResult = {
  week_of: string;
  meals: number;
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
  kept_manual: number;
  staples: number;
  recipes_without_ingredients: string[];
};

type MealRow = { id: number; recipe_id: string | null; eaters: Eaters; leftover_of: number | null; planned_for: string; slot: Slot };
type IngRow = {
  recipe_id: string;
  name: string | null;
  qty_min: number | null;
  qty_max: number | null;
  unit: string | null;
  category: string | null;
  scalable: boolean;
  to_taste: boolean;
};

export async function buildWeekGroceries(weekOf: string): Promise<BuildResult> {
  const supa = supabaseAdmin();
  const to = addDays(weekOf, 6);

  // 1. planned meals for the week (leftovers carry no shopping) + anyone travelling
  const [{ data: mealsData, error: mErr }, trips] = await Promise.all([
    supa
      .from("planned_meals")
      .select("id, recipe_id, eaters, leftover_of, planned_for, slot")
      .gte("planned_for", weekOf)
      .lte("planned_for", to),
    getTripsOverlapping(weekOf, to),
  ]);
  if (mErr) throw mErr;
  const rows = (mealsData ?? []) as MealRow[];
  // Leftovers carry no shopping; one-off items (custom_text, recipe_id null) have no ingredients.
  // A traveller is taken out of each meal (lib/plan/travel.ts); a meal with leftovers planned
  // from it keeps its usual amount so the traveller's share becomes the leftovers.
  const withLeftovers = leftoverSources(rows);
  const meals = rows
    .filter((m): m is MealRow & { recipe_id: string } => m.leftover_of === null && m.recipe_id !== null)
    .map((m) => ({ ...m, cook: mealTravel(m, trips, withLeftovers.has(m.id)).cook }))
    .filter((m): m is typeof m & { cook: Eaters } => m.cook !== null);
  const recipeIds = Array.from(new Set(meals.map((m) => m.recipe_id)));

  // 2. ingredients for those recipes (+ titles for the "no ingredients" report)
  let ings: IngRow[] = [];
  const titles = new Map<string, string>();
  if (recipeIds.length > 0) {
    const [{ data: ingData, error: iErr }, { data: recData }] = await Promise.all([
      supa
        .from("ingredients_parsed")
        .select("recipe_id, name, qty_min, qty_max, unit, category, scalable, to_taste")
        .in("recipe_id", recipeIds),
      supa.from("recipes").select("id, title").in("id", recipeIds),
    ]);
    if (iErr) throw iErr;
    ings = (ingData ?? []) as IngRow[];
    for (const r of (recData ?? []) as { id: string; title: string }[]) titles.set(r.id, r.title);
  }
  const byRecipe = new Map<string, IngRow[]>();
  for (const i of ings) {
    if (!byRecipe.has(i.recipe_id)) byRecipe.set(i.recipe_id, []);
    byRecipe.get(i.recipe_id)!.push(i);
  }
  const recipesWithout = recipeIds
    .filter((id) => !(byRecipe.get(id) ?? []).some((i) => i.scalable && i.name))
    .map((id) => titles.get(id) ?? id);

  // 3. expand meals × lines, applying the per-category eaters factor
  const inputs: GroceryItemInput[] = [];
  for (const m of meals) {
    for (const line of byRecipe.get(m.recipe_id) ?? []) {
      if (!line.scalable || line.to_taste || !line.name || line.qty_min === null) continue;
      const f = eatersFactor(m.cook, line.category);
      inputs.push({
        recipe_id: m.recipe_id,
        name: line.name,
        qty_min: Number(line.qty_min) * f,
        qty_max: line.qty_max === null ? null : Number(line.qty_max) * f,
        unit: line.unit,
        category: line.category,
        scalable: true,
        to_taste: false,
      });
    }
  }

  // 4. merge across recipes (unit-converting), then staple + shop
  const { data: stapleRows } = await supa.from("pantry_staples").select("name");
  const staples = toStapleSet(((stapleRows ?? []) as { name: string }[]).map((r) => r.name));
  const merged = buildGroceryList(inputs);
  const desired: DesiredRow[] = merged.map((g) => ({
    name: g.name,
    qty_min: g.qty_min,
    qty_max: g.qty_max,
    unit: g.unit,
    category: g.category,
    recipe_ids: g.recipe_ids,
    shop: shopFor(g.name, g.category),
    staple: isStaple(g.name, staples),
  }));

  // 5 + 6. reconcile against what is already there, then apply. Two builds can race (two phones,
  // or the auto-rebuild after a burst of plan edits); a unique-violation on insert means someone
  // else inserted the same row first, so re-read and reconcile once more.
  let plan = await reconcileOnce();
  const insertRows = () =>
    plan.inserts.length > 0
      ? supa.from("grocery_list").insert(plan.inserts.map((r) => ({ ...r, week_of: weekOf, checked: false })))
      : Promise.resolve({ error: null as null | { code?: string; message: string } });
  const ins = await insertRows();
  if (ins.error) {
    if (ins.error.code !== "23505") throw ins.error;
    plan = await reconcileOnce();
    const again = await insertRows();
    if (again.error) throw again.error;
  }
  for (const u of plan.updates) {
    const { error } = await supa.from("grocery_list").update(u.patch).eq("id", u.id);
    if (error) throw error;
  }
  if (plan.deletes.length > 0) {
    const { error } = await supa.from("grocery_list").delete().in("id", plan.deletes);
    if (error) throw error;
  }

  async function reconcileOnce() {
    const { data: existingData, error: eErr } = await supa.from("grocery_list").select("*").eq("week_of", weekOf);
    if (eErr) throw eErr;
    return reconcileGrocery(desired, (existingData ?? []) as ExistingRow[]);
  }

  return {
    week_of: weekOf,
    meals: meals.length,
    inserted: plan.inserts.length,
    updated: plan.updates.length,
    deleted: plan.deletes.length,
    unchanged: plan.unchanged,
    kept_manual: plan.keptManual,
    staples: desired.filter((d) => d.staple).length,
    recipes_without_ingredients: recipesWithout,
  };
}
