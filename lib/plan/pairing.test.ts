import { pairRole, pairScore, suggestPairings } from "./pairing";
import type { PlannerRecipe } from "./types";

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

describe("pairRole", () => {
  it("Side meal type → side; soup titles → soup regardless of meal type", () => {
    expect(pairRole(recipe({ meal_type: "Side", title: "Garlic Green Beans" }))).toBe("side");
    expect(pairRole(recipe({ meal_type: "Dinner", title: "Cantonese Herbal Chicken Soup" }))).toBe("soup");
    expect(pairRole(recipe({ meal_type: "Lunch", title: "Kimchi Jjigae" }))).toBe("soup");
    expect(pairRole(recipe({ meal_type: "Dinner", title: "Mapo Tofu" }))).toBeNull();
  });
});

describe("pairScore", () => {
  const chineseMain = recipe({ cuisine: "Chinese", title: "Mapo Tofu" });
  it("same cuisine beats same family beats adjacent", () => {
    const chineseSide = recipe({ meal_type: "Side", cuisine: "Chinese" });
    const koreanSide = recipe({ meal_type: "Side", cuisine: "Korean" });
    const thaiSide = recipe({ meal_type: "Side", cuisine: "Thai" });
    const italianSide = recipe({ meal_type: "Side", cuisine: "Italian" });
    expect(pairScore(chineseMain, chineseSide)).toBe(3);
    expect(pairScore(chineseMain, koreanSide)).toBe(2);
    expect(pairScore(chineseMain, thaiSide)).toBe(1);
    expect(pairScore(chineseMain, italianSide)).toBe(0);
  });
  it("universal sides pair with anything", () => {
    const universal = recipe({ meal_type: "Side", cuisine: "Other" });
    const tagged = recipe({ meal_type: "Side", cuisine: "Italian", tags: ["Universal"] });
    expect(pairScore(chineseMain, universal)).toBe(1);
    expect(pairScore(chineseMain, tagged)).toBe(1);
  });
  it("mains never score", () => {
    expect(pairScore(chineseMain, recipe({ meal_type: "Dinner", cuisine: "Chinese", title: "Kung Pao Chicken" }))).toBe(0);
  });
});

describe("suggestPairings", () => {
  it("sorts by score, then rating, and excludes the mains themselves", () => {
    const main = recipe({ cuisine: "Chinese", title: "Kung Pao Chicken" });
    const soupSameCuisine = recipe({ meal_type: "Dinner", cuisine: "Chinese", title: "Egg Drop Soup", rating: 3 });
    const sideSameCuisine = recipe({ meal_type: "Side", cuisine: "Chinese", rating: 4.5 });
    const koreanSide = recipe({ meal_type: "Side", cuisine: "Korean", rating: 5 });
    const italianSide = recipe({ meal_type: "Side", cuisine: "Italian" });
    const got = suggestPairings([main], [main, soupSameCuisine, sideSameCuisine, koreanSide, italianSide]);
    expect(got.map((g) => g.recipe.id)).toEqual([sideSameCuisine.id, soupSameCuisine.id, koreanSide.id]);
    expect(got[0].score).toBe(3);
    expect(got[2].score).toBe(2);
  });
});
