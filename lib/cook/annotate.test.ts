import { annotateAmounts } from "./annotate";

const ing = (name: string, qty_min: number | null, unit: string | null = null, extra: Partial<{ qty_max: number | null; scalable: boolean; to_taste: boolean }> = {}) => ({
  name,
  qty_min,
  qty_max: extra.qty_max ?? null,
  unit,
  scalable: extra.scalable ?? true,
  to_taste: extra.to_taste ?? false,
});

describe("annotateAmounts", () => {
  test("mentions get the amount inline", () => {
    expect(annotateAmounts("Slice the tofu into strips.", [ing("silken tofu", 415, "g")])).toBe(
      "Slice the tofu (415 g) into strips.",
    );
  });

  test("longest ingredient name wins over a shorter overlap", () => {
    const result = annotateAmounts("Add the spring onion.", [ing("onion", 1), ing("spring onion", 2, "stalk")]);
    expect(result).toBe("Add the spring onion (2 stalk).");
  });

  test("steps that already quantify are left alone", () => {
    expect(annotateAmounts("Heat 1.5 tbsp oil in the wok.", [ing("vegetable oil", 3.5, "tbsp")])).toBe(
      "Heat 1.5 tbsp oil in the wok.",
    );
  });

  test("word boundaries: oil never matches boil", () => {
    expect(annotateAmounts("Bring to the boil.", [ing("oil", 2, "tbsp")])).toBe("Bring to the boil.");
  });

  test("prep prefixes match the bare noun", () => {
    expect(annotateAmounts("Stir in the ginger.", [ing("grated ginger", 1, "tsp")])).toBe(
      "Stir in the ginger (1 tsp).",
    );
  });

  test("to-taste and unquantified lines never annotate", () => {
    expect(annotateAmounts("Season with soy sauce.", [ing("soy sauce", null), ing("salt", 1, "pinch", { to_taste: true })])).toBe(
      "Season with soy sauce.",
    );
  });

  test("each ingredient annotates once per step", () => {
    expect(annotateAmounts("Add the tofu, then more tofu.", [ing("tofu", 300, "g")])).toBe(
      "Add the tofu (300 g), then more tofu.",
    );
  });
});
