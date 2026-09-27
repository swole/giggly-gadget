import { checkMove, nextPosition, type MoveMeal } from "./move";
import type { Slot } from "./types";

// The week of 28 Sep 2026: soup on Monday dinner with its leftovers on Tuesday lunch,
// a wrap on Tuesday and Wednesday breakfast, and a one-off on Monday breakfast.
const meal = (id: number, planned_for: string, slot: Slot, recipe_id: string | null, leftover_of: number | null = null): MoveMeal & { position: number } => ({
  id,
  recipe_id,
  planned_for,
  slot,
  leftover_of,
  position: 0,
});

const soup = meal(1, "2026-09-28", "dinner", "soup");
const soupLeftovers = meal(2, "2026-09-29", "lunch", "soup", 1);
const wrapTue = meal(3, "2026-09-29", "breakfast", "wrap");
const wrapWed = meal(4, "2026-09-30", "breakfast", "wrap");
const rice = meal(5, "2026-09-28", "breakfast", null);
const week = [soup, soupLeftovers, wrapTue, wrapWed, rice];

describe("checkMove", () => {
  it("treats a drop back on its own mealtime as a no-op", () => {
    expect(checkMove(wrapTue, { planned_for: "2026-09-29", slot: "breakfast" }, week)).toEqual({ ok: true, same: true });
  });

  it("moves a meal to another day", () => {
    expect(checkMove(wrapTue, { planned_for: "2026-09-28", slot: "breakfast" }, week)).toEqual({ ok: true, same: false });
  });

  it("moves a meal from breakfast to lunch on the same day", () => {
    expect(checkMove(wrapTue, { planned_for: "2026-09-29", slot: "lunch" }, week)).toEqual({ ok: true, same: false });
  });

  it("refuses a mealtime that already has the same recipe", () => {
    expect(checkMove(wrapTue, { planned_for: "2026-09-30", slot: "breakfast" }, week)).toEqual({
      ok: false,
      reason: "duplicate",
      message: "Wed 30 breakfast already has it",
    });
  });

  it("never calls one-offs duplicates", () => {
    const water = meal(6, "2026-09-30", "lunch", null);
    expect(checkMove(rice, { planned_for: "2026-09-30", slot: "lunch" }, [...week, water])).toEqual({ ok: true, same: false });
  });

  it("keeps leftovers after the meal they come from", () => {
    expect(checkMove(soupLeftovers, { planned_for: "2026-09-28", slot: "lunch" }, week)).toMatchObject({
      ok: false,
      reason: "before-source",
      message: "Leftovers have to come after Mon 28 dinner",
    });
    // the source's own mealtime already holds the recipe
    expect(checkMove(soupLeftovers, { planned_for: "2026-09-28", slot: "dinner" }, week)).toMatchObject({ ok: false, reason: "duplicate" });
    expect(checkMove(soupLeftovers, { planned_for: "2026-09-30", slot: "lunch" }, week)).toEqual({ ok: true, same: false });
  });

  it("orders a snack between lunch and dinner", () => {
    const dal = meal(7, "2026-10-01", "lunch", "dal");
    const dalLeftovers = meal(8, "2026-10-02", "breakfast", "dal", 7);
    const all = [...week, dal, dalLeftovers];
    expect(checkMove(dalLeftovers, { planned_for: "2026-10-01", slot: "snack" }, all)).toEqual({ ok: true, same: false });
    expect(checkMove(soupLeftovers, { planned_for: "2026-09-28", slot: "snack" }, week)).toMatchObject({ ok: false, reason: "before-source" });
    expect(checkMove(dal, { planned_for: "2026-10-01", slot: "dinner" }, all)).toEqual({ ok: true, same: false });
    expect(checkMove(dal, { planned_for: "2026-10-02", slot: "breakfast" }, all)).toMatchObject({ ok: false, reason: "duplicate" });
  });

  it("keeps a meal before its leftovers", () => {
    expect(checkMove(soup, { planned_for: "2026-09-29", slot: "dinner" }, week)).toEqual({
      ok: false,
      reason: "after-leftovers",
      message: "Its leftovers on Tue 29 lunch would come first",
    });
    expect(checkMove(soup, { planned_for: "2026-09-29", slot: "breakfast" }, week)).toEqual({ ok: true, same: false });
  });

  it("measures against the earliest of several leftovers", () => {
    const more = meal(9, "2026-10-01", "lunch", "soup", 1);
    expect(checkMove(soup, { planned_for: "2026-09-30", slot: "dinner" }, [...week, more])).toMatchObject({
      ok: false,
      message: "Its leftovers on Tue 29 lunch would come first",
    });
  });

  it("does not block leftovers whose source is outside the week", () => {
    const orphan = meal(10, "2026-10-02", "lunch", "stew", 999);
    expect(checkMove(orphan, { planned_for: "2026-09-28", slot: "lunch" }, [...week, orphan])).toEqual({ ok: true, same: false });
  });
});

describe("nextPosition", () => {
  it("starts an empty mealtime at 0", () => {
    expect(nextPosition(week, 3, { planned_for: "2026-10-03", slot: "dinner" })).toBe(0);
  });

  it("goes after what is already there", () => {
    const side = { ...meal(11, "2026-09-28", "dinner", "greens"), position: 4 };
    expect(nextPosition([...week, side], 3, { planned_for: "2026-09-28", slot: "dinner" })).toBe(5);
  });

  it("ignores the meal being moved", () => {
    const solo = { ...wrapTue, position: 7 };
    expect(nextPosition([solo], 3, { planned_for: "2026-09-29", slot: "breakfast" })).toBe(0);
  });
});
