import { formatFindings, lintRecipe, SIDE_DISH_TAG } from "./tag-lint";

const base = { title: "T", meal_type: "Dinner", cuisine: "Chinese", tags: ["Comfort Food"], prep_min: 10, cook_min: 20, source: "Johnny" };

describe("lintRecipe", () => {
  it("a well-tagged main passes", () => {
    expect(lintRecipe(base)).toEqual([]);
  });
  it("Reference rows are reported once and nothing else", () => {
    const f = lintRecipe({ ...base, source: "Reference", meal_type: null, tags: [] });
    expect(f.map((x) => x.code)).toEqual(["reference-row"]);
  });
  it("missing Meal Type and Cuisine", () => {
    expect(lintRecipe({ ...base, meal_type: null, cuisine: null }).map((f) => f.code)).toEqual(["no-meal-type", "no-cuisine"]);
  });
  it("a Side needs the Side Dish tag, with a mechanical fix", () => {
    const f = lintRecipe({ ...base, meal_type: "Side" });
    expect(f[0].code).toBe("side-without-tag");
    expect(f[0].fix).toEqual({ addTags: [SIDE_DISH_TAG] });
    expect(lintRecipe({ ...base, meal_type: "Side", tags: [SIDE_DISH_TAG] })).toEqual([]);
  });
  it("Quick over 30 minutes is flagged; unknown times are not", () => {
    expect(lintRecipe({ ...base, tags: ["Quick"], prep_min: 20, cook_min: 25 })[0].code).toBe("quick-too-long");
    expect(lintRecipe({ ...base, tags: ["Quick"], prep_min: null, cook_min: null })).toEqual([]);
  });
  it("Vegan implies Vegetarian", () => {
    expect(lintRecipe({ ...base, tags: ["Vegan"] })[0].code).toBe("vegan-not-vegetarian");
    expect(lintRecipe({ ...base, tags: ["Vegan", "Vegetarian"] })).toEqual([]);
  });
  it("no tags is an info finding", () => {
    expect(lintRecipe({ ...base, tags: [] }).map((f) => f.code)).toEqual(["no-tags"]);
  });
  it("formatFindings joins with middle dots", () => {
    expect(formatFindings("X", [])).toBeNull();
    expect(formatFindings("X", lintRecipe({ ...base, meal_type: "Side", tags: [] }))).toBe(
      'X: Meal Type is Side but the "Side Dish" tag is missing · no tags at all',
    );
  });
});
