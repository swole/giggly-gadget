import { renderQty, formatRange, scaleFactor } from "./scale";

describe("renderQty", () => {
  test("integers", () => {
    expect(renderQty(2)).toBe("2");
    expect(renderQty(10)).toBe("10");
  });
  test("clean fractions", () => {
    expect(renderQty(0.5)).toBe("1/2");
    expect(renderQty(0.25)).toBe("1/4");
    expect(renderQty(0.75)).toBe("3/4");
    expect(renderQty(1 / 3)).toBe("1/3");
    expect(renderQty(2 / 3)).toBe("2/3");
  });
  test("mixed fractions", () => {
    expect(renderQty(1.5)).toBe("1 1/2");
    expect(renderQty(2.25)).toBe("2 1/4");
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
