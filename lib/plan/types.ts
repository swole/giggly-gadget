import type { Recipe } from "@/lib/recipes";
import type { Eaters } from "@/lib/portions";

export const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Which Notion Meal Types the picker pre-filters to for each slot. */
export const SLOT_MEAL_TYPES: Record<Slot, string[]> = {
  breakfast: ["Breakfast"],
  lunch: ["Lunch", "Side"],
  dinner: ["Dinner", "Side"],
  snack: ["Snack", "Dessert"],
};

export function parseSlot(v: string | null | undefined): Slot | null {
  if (!v) return null;
  return (SLOTS as readonly string[]).includes(v) ? (v as Slot) : null;
}

/** One row of planned_meals, as stored. week_of is generated in Postgres. */
export type PlannedMeal = {
  id: number;
  recipe_id: string;
  planned_for: string; // YYYY-MM-DD
  week_of: string; // YYYY-MM-DD, Monday
  slot: Slot;
  eaters: Eaters;
  position: number;
  note: string | null;
  planned_servings: number | null;
  added_by: string | null;
  added_at: string;
  cooked_at: string | null;
  cooked_by: string | null;
  leftover_of: number | null;
};

/** What the planner and kitchen need to know about a recipe. Kept small for the wire. */
export type PlannerRecipe = Pick<
  Recipe,
  | "id"
  | "title"
  | "image_url"
  | "cuisine"
  | "meal_type"
  | "tags"
  | "prep_min"
  | "cook_min"
  | "servings"
  | "last_made"
  | "want_to_try"
  | "source"
  | "rating"
>;

export type NewPlannedMeal = {
  planned_for: string;
  slot: Slot;
  recipe_id: string;
  eaters?: Eaters;
  note?: string | null;
  leftover_of?: number | null;
};

export type PlannedMealPatch = Partial<
  Pick<PlannedMeal, "eaters" | "note" | "slot" | "planned_for" | "position">
>;
