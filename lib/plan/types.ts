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

// ---- Lunch locations (migration 0007): at home or packed for the office, per day + person ----
export const LUNCH_PEOPLE = ["johnny", "lydia"] as const;
export type LunchPerson = (typeof LUNCH_PEOPLE)[number];
export const LUNCH_LOCATIONS = ["home", "office"] as const;
export type LunchLocation = (typeof LUNCH_LOCATIONS)[number];

/** One row of lunch_locations. No row for a day + person means "home". */
export type LunchLocationRow = {
  planned_for: string; // YYYY-MM-DD
  person: LunchPerson;
  location: LunchLocation;
  updated_by: string | null;
  updated_at: string;
};

export function parseLunchPerson(v: unknown): LunchPerson | null {
  return typeof v === "string" && (LUNCH_PEOPLE as readonly string[]).includes(v) ? (v as LunchPerson) : null;
}

export function parseLunchLocation(v: unknown): LunchLocation | null {
  return typeof v === "string" && (LUNCH_LOCATIONS as readonly string[]).includes(v) ? (v as LunchLocation) : null;
}

/** One row of planned_meals, as stored. week_of is generated in Postgres.
 *  Carries EITHER a recipe_id OR custom_text (a one-off like "White rice"). */
export type PlannedMeal = {
  id: number;
  recipe_id: string | null;
  custom_text: string | null;
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

/** Display title for a planned meal, recipe or one-off. */
export function mealTitle(m: Pick<PlannedMeal, "recipe_id" | "custom_text">, byId: Record<string, { title: string }> | Map<string, { title: string }>): string {
  if (m.recipe_id === null) return m.custom_text ?? "One-off";
  const r = byId instanceof Map ? byId.get(m.recipe_id) : byId[m.recipe_id];
  return r?.title ?? "Recipe";
}

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
  /** Exactly one of recipe_id / custom_text. */
  recipe_id?: string | null;
  custom_text?: string | null;
  eaters?: Eaters;
  note?: string | null;
  leftover_of?: number | null;
};

export type PlannedMealPatch = Partial<
  Pick<PlannedMeal, "eaters" | "note" | "slot" | "planned_for" | "position">
>;
