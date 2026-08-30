import { classifyProtein, weekConstraintStatus } from "./constraints";

describe("classifyProtein", () => {
  test("ingredients first: fish-fragrant eggplant has no fish", () => {
    expect(classifyProtein("Fish-Fragrant Eggplant", ["eggplant", "garlic", "doubanjiang", "light soy"]).size).toBe(0);
  });
  test("yong tau foo counts as white fish via the paste", () => {
    const c = classifyProtein("Yong Tau Foo, Homemade", ["white fish fillet", "firm tofu", "bittergourd", "okra"]);
    expect(c.has("white_fish")).toBe(true);
    expect(c.has("oily_fish")).toBe(false);
    expect(c.has("tofu")).toBe(true);
  });
  test("mackerel / saba / salmon are oily", () => {
    expect(classifyProtein("Grilled Saba", ["fresh mackerel fillet", "brown rice"]).has("oily_fish")).toBe(true);
    expect(classifyProtein("x", ["salmon fillet"]).has("oily_fish")).toBe(true);
  });
  test("fish sauce and oyster sauce are not protein", () => {
    const c = classifyProtein("Thai Larb Tempeh", ["tempeh", "fish sauce", "lime", "mint"]);
    expect(c.has("white_fish")).toBe(false);
    expect(c.has("oily_fish")).toBe(false);
    expect(c.has("tofu")).toBe(true);
  });
  test("king oyster mushroom is not seafood; eggplant is not egg", () => {
    const c = classifyProtein("Mapo Tofu", ["soft tofu", "king oyster mushroom", "shiitake"]);
    expect(c.has("seafood")).toBe(false);
    expect(c.has("tofu")).toBe(true);
    expect(classifyProtein("x", ["eggplant", "garlic"]).has("egg")).toBe(false);
  });
  test("prawn, chicken", () => {
    expect(classifyProtein("x", ["raw prawn", "choy sum"]).has("prawn")).toBe(true);
    expect(classifyProtein("x", ["chicken breast"]).has("chicken")).toBe(true);
    expect(classifyProtein("x", ["chicken stock"]).has("chicken")).toBe(false);
  });
  test("falls back to the title only when nothing parsed", () => {
    expect(classifyProtein("Garlic Shrimp Stir-Fry", []).has("prawn")).toBe(true);
  });
});

describe("weekConstraintStatus", () => {
  test("counts and flags", () => {
    const meals = [
      { recipe_id: "a", slot: "dinner", leftover_of: null },
      { recipe_id: "a", slot: "lunch", leftover_of: 1 }, // leftovers don't count
      { recipe_id: "b", slot: "dinner", leftover_of: null },
      { recipe_id: "c", slot: "dinner", leftover_of: null },
      { recipe_id: "c", slot: "lunch", leftover_of: null },
    ];
    const classes = { a: ["oily_fish" as const], b: ["chicken" as const], c: ["prawn" as const] };
    const s = weekConstraintStatus(meals, classes);
    expect(s.find((x) => x.key === "oily_fish")).toMatchObject({ count: 1, ok: false });
    expect(s.find((x) => x.key === "chicken")).toMatchObject({ count: 1, ok: true });
    expect(s.find((x) => x.key === "shellfish")).toMatchObject({ count: 2, ok: true });
  });

  test("three postures speak in words", () => {
    const meals = [
      { recipe_id: "b", slot: "dinner", leftover_of: null },
      { recipe_id: "b", slot: "lunch", leftover_of: null },
      { recipe_id: "b", slot: "breakfast", leftover_of: null },
    ];
    const classes = { b: ["chicken" as const] };
    const s = weekConstraintStatus(meals, classes);
    expect(s.find((x) => x.key === "chicken")).toMatchObject({ state: "violated", text: "Chicken ×3 — cap is 1" });
    expect(s.find((x) => x.key === "oily_fish")).toMatchObject({ state: "pending", text: "3 more oily fish" });
    expect(s.find((x) => x.key === "shellfish")).toMatchObject({ state: "met", text: "Prawn / seafood 0 of 2 ✓" });
  });
});
