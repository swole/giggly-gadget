import { renderQty, formatRange, scaleFactor } from "./scale";

describe("renderQty", () => {
  test("integers", () => {
    expect(renderQty(2)).toBe("2");
    expect(renderQty(10)).toBe("10");
  });
  test("clean fractions render as vulgar glyphs", () => {
    expect(renderQty(0.5)).toBe("½");
    expect(renderQty(0.25)).toBe("¼");
    expect(renderQty(0.75)).toBe("¾");
    expect(renderQty(1 / 3)).toBe("⅓");
    expect(renderQty(2 / 3)).toBe("⅔");
  });
  test("mixed fractions sit tight against the whole (no 11/2 misread)", () => {
    expect(renderQty(1.5)).toBe("1½");
    expect(renderQty(2.25)).toBe("2¼");
    expect(renderQty(3.75)).toBe("3¾");
  });
  test("fallback to decimal", () => {
    expect(renderQty(1.7)).toBe("1.7");
  });
});

describe("formatRange", () => {
  test("single value", () => expect(formatRange(2, null)).toBe("2"));
  test("range", () => expect(formatRange(1, 2)).toBe("1–2"));
  test("equal range collapses", () => expect(formatRange(2, 2)).toBe("2"));
});

describe("scaleFactor", () => {
  test("doubling", () => {
    expect(scaleFactor(2, { kind: "servings", target: 4 })).toBe(2);
  });
  test("meal prep × 5 days", () => {
    expect(scaleFactor(2, { kind: "mealPrep", days: 5, servingsPerDay: 1 })).toBe(2.5);
  });
  test("missing original defaults to 2", () => {
    expect(scaleFactor(null, { kind: "servings", target: 6 })).toBe(3);
  });
});
