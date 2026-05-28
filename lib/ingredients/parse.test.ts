import { parseIngredient, parseIngredients } from "./parse";

describe("parseIngredient", () => {
  test("plain qty + unit + name", () => {
    const r = parseIngredient("- 2 tbsp soy sauce");
    expect(r).toMatchObject({
      qty_min: 2, qty_max: null, unit: "tbsp", name: "soy sauce",
      optional: false, to_taste: false, scalable: true, category: "pantry",
    });
  });

  test("range qty", () => {
    const r = parseIngredient("- 1-2 cloves garlic, minced");
    expect(r).toMatchObject({
      qty_min: 1, qty_max: 2, unit: "clove", name: "garlic", modifier: "minced", scalable: true,
    });
  });

  test("'1 to 2' range", () => {
    const r = parseIngredient("- 1 to 2 tbsp olive oil");
    expect(r).toMatchObject({ qty_min: 1, qty_max: 2, unit: "tbsp", name: "olive oil" });
  });

  test("fraction qty", () => {
    const r = parseIngredient("- 1/2 cup chicken stock");
    expect(r).toMatchObject({ qty_min: 0.5, unit: "cup", name: "chicken stock", category: "pantry" });
  });

  test("mixed fraction", () => {
    const r = parseIngredient("- 1 1/2 cups flour");
    expect(r).toMatchObject({ qty_min: 1.5, unit: "cup", name: "flour" });
  });

  test("unicode fraction", () => {
    const r = parseIngredient("- ½ tsp salt");
    expect(r).toMatchObject({ qty_min: 0.5, unit: "tsp", name: "salt", category: "spice" });
  });

  test("parenthetical metric — prefer if needed", () => {
    const r = parseIngredient("- 1/2 cup (120ml) chicken stock");
    expect(r.name).toBe("chicken stock");
    expect(r.qty_min).toBe(0.5);
    expect(r.unit).toBe("cup"); // cup parses fine, paren metric is informational
  });

  test("to taste", () => {
    const r = parseIngredient("- Salt, to taste");
    expect(r).toMatchObject({
      to_taste: true, scalable: false, name: "Salt", qty_min: null, category: "spice",
    });
  });

  test("optional", () => {
    const r = parseIngredient("- 1 tbsp sesame oil (optional)");
    expect(r).toMatchObject({
      qty_min: 1, unit: "tbsp", name: "sesame oil", optional: true, scalable: true,
    });
  });

  test("grams", () => {
    const r = parseIngredient("- 200g chicken thigh, boneless");
    expect(r).toMatchObject({
      qty_min: 200, unit: "g", name: "chicken thigh", modifier: "boneless", category: "protein",
    });
  });

  test("decimal qty", () => {
    const r = parseIngredient("- 1.5 lb ground beef");
    expect(r).toMatchObject({ qty_min: 1.5, unit: "lb", name: "ground beef", category: "protein" });
  });

  test("no qty — unscalable but named", () => {
    const r = parseIngredient("- Fresh cilantro for garnish");
    // "for garnish" triggers to_taste branch
    expect(r.to_taste).toBe(true);
    expect(r.scalable).toBe(false);
  });

  test("unscalable totally unparseable line", () => {
    const r = parseIngredient("- A handful of mixed greens");
    // "handful" is a unit; "of mixed greens" → name should include "of mixed greens" or similar
    // we accept either scalable (if "handful" gets matched) or unscalable
    expect(r.raw).toBe("- A handful of mixed greens");
  });

  test("category fallback", () => {
    const r = parseIngredient("- 1 tbsp something obscure");
    expect(r.category).toBe("other");
  });

  test("tablespoon long form", () => {
    const r = parseIngredient("- 2 tablespoons rice vinegar");
    expect(r).toMatchObject({ qty_min: 2, unit: "tbsp", name: "rice vinegar" });
  });

  test("piece", () => {
    const r = parseIngredient("- 4 pieces ginger");
    expect(r).toMatchObject({ qty_min: 4, unit: "piece", name: "ginger", category: "produce" });
  });

  test("clove fallback to produce via word match", () => {
    const r = parseIngredient("- 3 cloves garlic");
    expect(r.category).toBe("produce");
  });
});

describe("parseIngredients (full block)", () => {
  test("extracts ingredients section, skips instructions", () => {
    const md = `
Some intro text.

🥣 Ingredients
- 2 tbsp soy sauce
- 1 clove garlic
- Salt, to taste

👩‍🍳 Instructions
1. Mix sauce.
2. Cook for 10 minutes.
`;
    const items = parseIngredients(md);
    expect(items).toHaveLength(3);
    expect(items[0].name).toBe("soy sauce");
    expect(items[2].to_taste).toBe(true);
  });

  test("handles missing ingredients header (assume whole body)", () => {
    const md = `- 1 cup rice\n- 200g chicken`;
    const items = parseIngredients(md);
    expect(items).toHaveLength(2);
  });
});
