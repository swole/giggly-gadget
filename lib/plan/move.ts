// Moving a planned meal to another day or mealtime (drag and drop on /plan).
//
// A move rewrites the row's planned_for + slot + position. Two things can make a drop
// wrong, and the planner refuses those with a reason, so a drop never saves a broken week:
// the target already holds the same recipe (the (planned_for, slot, recipe_id) unique
// index would reject it anyway), and leftovers landing at or before the meal they come
// from, from either end of the pair. Pure, unit-tested in move.test.ts; the PATCH route
// runs the same check server-side.

import type { PlannedMeal, Slot } from "./types";
import { mealLabel, mealPoint } from "./travel";

export type MoveTarget = { planned_for: string; slot: Slot };

export type MoveMeal = Pick<PlannedMeal, "id" | "recipe_id" | "planned_for" | "slot" | "leftover_of">;

export type MoveCheck =
  | { ok: true; same: boolean } // same = dropped back where it was, nothing to save
  | { ok: false; reason: "duplicate" | "before-source" | "after-leftovers"; message: string };

export function checkMove(meal: MoveMeal, to: MoveTarget, meals: MoveMeal[]): MoveCheck {
  if (meal.planned_for === to.planned_for && meal.slot === to.slot) return { ok: true, same: true };

  const clash =
    meal.recipe_id !== null &&
    meals.some((m) => m.id !== meal.id && m.recipe_id === meal.recipe_id && m.planned_for === to.planned_for && m.slot === to.slot);
  if (clash) return { ok: false, reason: "duplicate", message: `${mealLabel(to.planned_for, to.slot)} already has it` };

  const target = mealPoint(to.planned_for, to.slot);
  if (meal.leftover_of !== null) {
    const source = meals.find((m) => m.id === meal.leftover_of);
    if (source && target <= mealPoint(source.planned_for, source.slot)) {
      return { ok: false, reason: "before-source", message: `Leftovers have to come after ${mealLabel(source.planned_for, source.slot)}` };
    }
  }

  const firstLeftover = meals
    .filter((m) => m.leftover_of === meal.id)
    .sort((a, b) => mealPoint(a.planned_for, a.slot).localeCompare(mealPoint(b.planned_for, b.slot)))[0];
  if (firstLeftover && target >= mealPoint(firstLeftover.planned_for, firstLeftover.slot)) {
    return {
      ok: false,
      reason: "after-leftovers",
      message: `Its leftovers on ${mealLabel(firstLeftover.planned_for, firstLeftover.slot)} would come first`,
    };
  }

  return { ok: true, same: false };
}

/** A moved meal goes to the end of its new mealtime. */
export function nextPosition(meals: Pick<PlannedMeal, "id" | "planned_for" | "slot" | "position">[], movingId: number, to: MoveTarget): number {
  const there = meals.filter((m) => m.id !== movingId && m.planned_for === to.planned_for && m.slot === to.slot);
  return there.length === 0 ? 0 : Math.max(...there.map((m) => m.position)) + 1;
}
