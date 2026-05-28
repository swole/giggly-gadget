import { buildGroceryList, convert, dimensionOf } from "./normalize";

describe("convert", () => {
  test("tbsp to ml", () => {
    expect(convert(1, "tbsp", "ml")).toBeCloseTo(14.7868, 3);
  });
  test("kg to g", () => {
    expect(convert(2, "kg", "g")).toBe(2000);
  });
  test("same unit", () => {
    expect(convert(3, "cup", "cup")).toBe(3);
  });
  test("cross-dimension returns null", () => {
    expect(convert(1, "g", "ml")).toBeNull();
  });
});

describe("dimensionOf", () => {
  test("mass", () => expect(dimensionOf("g")).toBe("mass"));
  test("volume", () => expect(dimensionOf("tbsp")).toBe("volume"));
  test("count for cloves", () => expect(dimensionOf("clove")).toBe("unknown"));
  test("null/empty is count", () => expect(dimensionOf(null)).toBe("count"));
});

describe("buildGroceryList", () => {
  test("dedupes same ingredient + unit", () => {
    const out = buildGroceryList([
      { recipe_id: "r1", name: "soy sauce", qty_min: 2, qty_max: null, unit: "tbsp", category: "pantry", scalable: true, to_taste: false },
      { recipe_id: "r2", name: "soy sauce", qty_min: 1, qty_max: null, unit: "tbsp", category: "pantry", scalable: true, to_taste: false },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "soy sauce", qty_min: 3, unit: "tbsp", recipe_ids: ["r1", "r2"] });
  });

  test("converts and sums across volume units", () => {
    const out = buildGroceryList([
      { recipe_id: "r1", name: "soy sauce", qty_min: 1, qty_max: null, unit: "tbsp", category: "pantry", scalable: true, to_taste: false },
      { recipe_id: "r2", name: "soy sauce", qty_min: 30, qty_max: null, unit: "ml", category: "pantry", scalable: true, to_taste: false },
    ]);
    expect(out).toHaveLength(1);
    // largestUnit picks tbsp (14.8 ml/tbsp) > ml (1 ml/ml). 30ml -> ~2.03 tbsp + 1 tbsp = ~3 tbsp.
    expect(out[0].unit).toBe("tbsp");
    expect(out[0].qty_min).toBeCloseTo(3.0, 0);
  });

  test("drops to-taste items", () => {
    const out = buildGroceryList([
      { recipe_id: "r1", name: "salt", qty_min: null, qty_max: null, unit: null, category: "spice", scalable: false, to_taste: true },
    ]);
    expect(out).toHaveLength(0);
  });

  test("groups by category in output order", () => {
    const out = buildGroceryList([
      { recipe_id: "r1", name: "salt", qty_min: 1, qty_max: null, unit: "tsp", category: "spice", scalable: true, to_taste: false },
      { recipe_id: "r1", name: "garlic", qty_min: 2, qty_max: null, unit: "clove", category: "produce", scalable: true, to_taste: false },
    ]);
    expect(out.map((i) => i.category)).toEqual(["produce", "spice"]);
  });
});
