// Server-side reads for the planner and kitchen. Writes go through /api/plan/* so the
// server can stamp the role.
import { supabaseAdmin } from "@/lib/supabase/server";
import type { LunchLocationRow, PlannedMeal, PlannerRecipe } from "./types";
import { addDays } from "@/lib/week";

const PLANNER_RECIPE_COLS =
  "id, title, image_url, cuisine, meal_type, tags, prep_min, cook_min, servings, last_made, want_to_try, source, rating";

export async function listPlannerRecipes(): Promise<PlannerRecipe[]> {
  const supa = supabaseAdmin();
  const { data, error } = await supa.from("recipes").select(PLANNER_RECIPE_COLS).order("title");
  if (error) throw error;
  return (data ?? []) as PlannerRecipe[];
}

export async function getPlannedMealsForWeek(weekOf: string): Promise<PlannedMeal[]> {
  return getPlannedMealsBetween(weekOf, addDays(weekOf, 6));
}

/** Inclusive date range. */
export async function getPlannedMealsBetween(from: string, to: string): Promise<PlannedMeal[]> {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("planned_meals")
    .select("*")
    .gte("planned_for", from)
    .lte("planned_for", to)
    .order("planned_for")
    .order("slot")
    .order("position");
  if (error) throw error;
  return (data ?? []) as PlannedMeal[];
}

export async function getPlannedMeal(id: number): Promise<PlannedMeal | null> {
  const supa = supabaseAdmin();
  const { data, error } = await supa.from("planned_meals").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as PlannedMeal) ?? null;
}

/** lunch_locations rows in [from, to] (inclusive). Tolerates the table not existing yet (0007 pending): returns []. */
export async function getLunchLocationsBetween(from: string, to: string): Promise<LunchLocationRow[]> {
  const supa = supabaseAdmin();
  const { data, error } = await supa.from("lunch_locations").select("*").gte("planned_for", from).lte("planned_for", to);
  if (error) {
    if (error.code === "42P01" || /lunch_locations/.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as LunchLocationRow[];
}
