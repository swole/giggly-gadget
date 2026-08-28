import { isStaple, toStapleSet } from "./staples";

const STAPLES = toStapleSet(["light soy", "soy sauce", "olive oil", "brown rice", "chia seeds", "dried shiitake", "Sesame Oil"]);

describe("isStaple", () => {
  test("exact", () => {
    expect(isStaple("light soy", STAPLES)).toBe(true);
    expect(isStaple("olive oil", STAPLES)).toBe(true);
    expect(isStaple("Sesame oil", STAPLES)).toBe(true); // case-insensitive
  });
  test("singular / plural", () => {
    expect(isStaple("chia seed", STAPLES)).toBe(true);
  });
  test("qualifier-prefixed names match the tail", () => {
    expect(isStaple("extra virgin olive oil", STAPLES)).toBe(true);
    expect(isStaple("dark soy sauce", STAPLES)).toBe(true);
  });
  test("fresh items are not staples", () => {
    expect(isStaple("soft tofu", STAPLES)).toBe(false);
    expect(isStaple("choy sum", STAPLES)).toBe(false);
    expect(isStaple("shiitake", STAPLES)).toBe(false); // fresh shiitake ≠ dried shiitake
  });
  test("null safe", () => {
    expect(isStaple(null, STAPLES)).toBe(false);
    expect(isStaple("", STAPLES)).toBe(false);
  });
});
