import { filterPool, poolBySlot, rollCells, type RollCell } from "./randomize";
import type { PlannerRecipe } from "./types";
import type { ProteinClass } from "./constraints";

let n = 0;
function recipe(over: Partial<PlannerRecipe>): PlannerRecipe {
  n++;
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    title: over.title ?? `Recipe ${n}`,
    image_url: null,
    cuisine: null,
    meal_type: "Dinner",
    tags: [],
    prep_min: 10,
    cook_min: 20,
    servings: 2,
    last_made: null,
    want_to_try: false,
    source: null,
    rating: null,
    ...over,
  };
}

function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("filterPool", () => {
  const lydiaHealthy = recipe({ source: "Lydia", tags: ["Heart Healthy"] });
  const lydiaPlain = recipe({ source: "Lydia" });
  const johnnyHealthy = recipe({ source: "Johnny", tags: ["Heart Healthy"] });
  const chineseHealthy = recipe({ cuisine: "Chinese", tags: ["Heart Healthy"] });
  const chinesePlain = recipe({ cuisine: "Chinese" });
  const all = [lydiaHealthy, lydiaPlain, johnnyHealthy, chineseHealthy, chinesePlain];

  it("source AND healthy (recipes Lydia added that are heart healthy)", () => {
    expect(filterPool(all, { source: "Lydia", healthy: true })).toEqual([lydiaHealthy]);
  });

  it("Lydia's picks: the Lydia TAG counts, not just Source=Lydia", () => {
    // Her 26 saved-video recipes were imported under Source=Johnny with the tag.
    const taggedImport = recipe({ source: "Johnny", tags: ["Healthy", "Lydia"] });
    const johnnyOwn = recipe({ source: "Johnny" });
    expect(filterPool([taggedImport, johnnyOwn, lydiaPlain], { source: "Lydia" })).toEqual([taggedImport, lydiaPlain]);
    // Johnny/Claude stay pure added-by matches — the tag never leaks into them.
    expect(filterPool([taggedImport, johnnyOwn, lydiaPlain], { source: "Claude" })).toEqual([]);
  });

  it("healthy AND cuisine", () => {
    expect(filterPool(all, { healthy: true, cuisines: ["Chinese"] })).toEqual([chineseHealthy]);
  });

  it("quick excludes recipes without a time and over 30 min", () => {
    const fast = recipe({ prep_min: 5, cook_min: 20 });
    const slow = recipe({ prep_min: 20, cook_min: 40 });
    const untimed = recipe({ prep_min: null, cook_min: null });
    expect(filterPool([fast, slow, untimed], { quick: true })).toEqual([fast]);
  });

  it("favourites means rating 4 or better", () => {
    const five = recipe({ rating: 5 });
    const three = recipe({ rating: 3 });
    const unrated = recipe({ rating: null });
    expect(filterPool([five, three, unrated], { favourites: true })).toEqual([five]);
  });
});

describe("poolBySlot", () => {
  it("slots take their main meal type only — no Sides, Desserts, or untyped", () => {
    const dinner = recipe({ meal_type: "Dinner" });
    const side = recipe({ meal_type: "Side" });
    const dessert = recipe({ meal_type: "Dessert" });
    const untyped = recipe({ meal_type: null });
    const by = poolBySlot([dinner, side, dessert, untyped], {}, ["dinner", "snack"]);
    expect(by.dinner).toEqual([dinner]);
    expect(by.snack).toEqual([]);
  });
});

describe("rollCells", () => {
  const cellsFor = (dates: string[], slot: "breakfast" | "lunch" | "dinner"): RollCell[] =>
    dates.map((d) => ({ planned_for: d, slot }));

  it("fills each cell with a slot-matched recipe and reports the unfillable", () => {
    const bfast = recipe({ meal_type: "Breakfast" });
    const dinner = recipe({ meal_type: "Dinner" });
    const res = rollCells({
      cells: [
        { planned_for: "2026-08-31", slot: "breakfast" },
        { planned_for: "2026-08-31", slot: "dinner" },
        { planned_for: "2026-08-31", slot: "lunch" },
      ],
      recipes: [bfast, dinner],
      filters: {},
      classByRecipe: {},
      keepMeals: [],
      rng: seq(0, 0, 0),
    });
    expect(res.picks).toHaveLength(2);
    expect(res.picks.find((p) => p.slot === "breakfast")?.recipe_id).toBe(bfast.id);
    expect(res.picks.find((p) => p.slot === "dinner")?.recipe_id).toBe(dinner.id);
    expect(res.unfilled).toEqual([{ planned_for: "2026-08-31", slot: "lunch" }]);
  });

  it("never repeats a recipe while alternatives exist", () => {
    const a = recipe({});
    const b = recipe({});
    const c = recipe({});
    const res = rollCells({
      cells: cellsFor(["2026-08-31", "2026-09-01", "2026-09-02"], "dinner"),
      recipes: [a, b, c],
      filters: {},
      classByRecipe: {},
      keepMeals: [],
      rng: seq(0, 0, 0),
    });
    expect(new Set(res.picks.map((p) => p.recipe_id)).size).toBe(3);
  });

  it("repeats only when the pool runs dry", () => {
    const only = recipe({});
    const res = rollCells({
      cells: cellsFor(["2026-08-31", "2026-09-01"], "dinner"),
      recipes: [only],
      filters: {},
      classByRecipe: {},
      keepMeals: [],
      rng: seq(0, 0),
    });
    expect(res.picks).toHaveLength(2);
    expect(res.picks.every((p) => p.recipe_id === only.id)).toBe(true);
  });

  it("keeps chicken ≤ 1 counting meals already in the week", () => {
    const keptChicken = recipe({});
    const moreChicken = recipe({});
    const fish = recipe({});
    const classByRecipe: Record<string, ProteinClass[]> = {
      [keptChicken.id]: ["chicken"],
      [moreChicken.id]: ["chicken"],
      [fish.id]: ["white_fish"],
    };
    const res = rollCells({
      cells: cellsFor(["2026-08-31", "2026-09-01"], "dinner"),
      recipes: [moreChicken, fish],
      filters: {},
      classByRecipe,
      keepMeals: [{ recipe_id: keptChicken.id, slot: "dinner", leftover_of: null }],
      rng: seq(0, 0),
    });
    expect(res.picks.map((p) => p.recipe_id)).not.toContain(moreChicken.id);
  });

  it("keeps prawn/seafood ≤ 2 across picks", () => {
    const prawn1 = recipe({});
    const prawn2 = recipe({});
    const prawn3 = recipe({});
    const tofu = recipe({});
    const classByRecipe: Record<string, ProteinClass[]> = {
      [prawn1.id]: ["prawn"],
      [prawn2.id]: ["seafood"],
      [prawn3.id]: ["prawn"],
      [tofu.id]: ["tofu"],
    };
    // rng 0 favours first-listed: without the cap all three prawns would land
    const res = rollCells({
      cells: cellsFor(["2026-08-31", "2026-09-01", "2026-09-02"], "dinner"),
      recipes: [prawn1, prawn2, prawn3, tofu],
      filters: {},
      classByRecipe,
      keepMeals: [],
      rng: seq(0, 0, 0),
    });
    const shellfish = res.picks.filter((p) => [prawn1.id, prawn2.id, prawn3.id].includes(p.recipe_id));
    expect(shellfish).toHaveLength(2);
    expect(res.picks.map((p) => p.recipe_id)).toContain(tofu.id);
  });

  it("a cap violation is allowed only when the cell has no other option", () => {
    const chickenA = recipe({});
    const chickenB = recipe({});
    const classByRecipe: Record<string, ProteinClass[]> = {
      [chickenA.id]: ["chicken"],
      [chickenB.id]: ["chicken"],
    };
    const res = rollCells({
      cells: cellsFor(["2026-08-31", "2026-09-01"], "dinner"),
      recipes: [chickenA, chickenB],
      filters: {},
      classByRecipe,
      keepMeals: [],
      rng: seq(0, 0),
    });
    expect(res.picks).toHaveLength(2); // second cell still fills, cap or not
  });

  it("leftover rows do not count toward the caps", () => {
    const keptChicken = recipe({});
    const moreChicken = recipe({});
    const classByRecipe: Record<string, ProteinClass[]> = {
      [keptChicken.id]: ["chicken"],
      [moreChicken.id]: ["chicken"],
    };
    const res = rollCells({
      cells: cellsFor(["2026-08-31"], "dinner"),
      recipes: [moreChicken],
      filters: {},
      classByRecipe,
      keepMeals: [{ recipe_id: keptChicken.id, slot: "dinner", leftover_of: 99 }],
      rng: seq(0),
    });
    expect(res.picks.map((p) => p.recipe_id)).toContain(moreChicken.id);
  });

  it("boosts oily fish while the week is under the floor", () => {
    const plain = recipe({});
    const oily = recipe({});
    const classByRecipe: Record<string, ProteinClass[]> = {
      [plain.id]: [],
      [oily.id]: ["oily_fish"],
    };
    // weights [1, 4]: rng 0.5 → t = 2.5 lands on the oily one; without the boost 0.5 → plain
    const res = rollCells({
      cells: cellsFor(["2026-08-31"], "dinner"),
      recipes: [plain, oily],
      filters: {},
      classByRecipe,
      keepMeals: [],
      rng: seq(0.5),
    });
    expect(res.picks[0].recipe_id).toBe(oily.id);
  });

  it("nudges away from dishes made in the last 10 days", () => {
    const recent = recipe({ last_made: "2026-08-28" });
    const rested = recipe({ last_made: "2026-07-01" });
    // weights [0.3, 1]: rng 0.5 → t = 0.65 skips the recent one
    const res = rollCells({
      cells: cellsFor(["2026-08-31"], "dinner"),
      recipes: [recent, rested],
      filters: {},
      classByRecipe: {},
      keepMeals: [],
      today: "2026-08-30",
      rng: seq(0.5),
    });
    expect(res.picks[0].recipe_id).toBe(rested.id);
  });

  it("theme filters carry through to the roll", () => {
    const lydiaHealthyDinner = recipe({ source: "Lydia", tags: ["Heart Healthy"], meal_type: "Dinner" });
    const johnnyDinner = recipe({ source: "Johnny", meal_type: "Dinner" });
    const res = rollCells({
      cells: cellsFor(["2026-08-31", "2026-09-01"], "dinner"),
      recipes: [lydiaHealthyDinner, johnnyDinner],
      filters: { source: "Lydia", healthy: true },
      classByRecipe: {},
      keepMeals: [],
      rng: seq(0, 0),
    });
    expect(res.picks.every((p) => p.recipe_id === lydiaHealthyDinner.id)).toBe(true);
    expect(res.pool).toBe(1);
  });

  it("dishes rated ≤ 2 never roll, even as the only slot option", () => {
    const dud = recipe({ meal_type: "Dinner", rating: 2 });
    const halfDud = recipe({ meal_type: "Dinner", rating: 1.5 });
    const res = rollCells({
      cells: cellsFor(["2026-08-31"], "dinner"),
      recipes: [dud, halfDud],
      filters: {},
      classByRecipe: {},
      keepMeals: [],
      rng: seq(0),
    });
    expect(res.picks).toEqual([]);
    expect(res.unfilled).toHaveLength(1);
    expect(res.pool).toBe(0);
  });

  it("high ratings tip the draw: a 5★ dish outweighs an unrated one", () => {
    const star = recipe({ meal_type: "Dinner", rating: 5 }); // weight 2.5
    const meh = recipe({ meal_type: "Dinner", rating: null }); // weight 1
    // rng 0.6 → t = 0.6 × 3.5 = 2.1, inside the 5★ dish's 2.5 span regardless of order bias toward first
    const res = rollCells({
      cells: cellsFor(["2026-08-31"], "dinner"),
      recipes: [star, meh],
      filters: {},
      classByRecipe: {},
      keepMeals: [],
      rng: seq(0.6),
    });
    expect(res.picks[0].recipe_id).toBe(star.id);
  });

  it("a 2.5★ dish limps at half weight but can still roll", () => {
    const limping = recipe({ meal_type: "Dinner", rating: 2.5 }); // weight 0.5
    const res = rollCells({
      cells: cellsFor(["2026-08-31"], "dinner"),
      recipes: [limping],
      filters: {},
      classByRecipe: {},
      keepMeals: [],
      rng: seq(0.9),
    });
    expect(res.picks[0].recipe_id).toBe(limping.id);
  });
});
