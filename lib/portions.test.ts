import { eatersFactor, nextEaters, parseEaters } from "./portions";

describe("eatersFactor", () => {
  test("both = recipe as written", () => {
    expect(eatersFactor("both", "protein")).toBe(1);
    expect(eatersFactor("both", "produce")).toBe(1);
    expect(eatersFactor("both", null)).toBe(1);
  });
  test("Johnny alone gets 60% of protein and grain, half of the rest", () => {
    expect(eatersFactor("johnny", "protein")).toBe(0.6);
    expect(eatersFactor("johnny", "grain")).toBe(0.6);
    expect(eatersFactor("johnny", "produce")).toBe(0.5);
    expect(eatersFactor("johnny", "spice")).toBe(0.5);
    expect(eatersFactor("johnny", null)).toBe(0.5);
  });
  test("Lydia alone gets 40% of protein and grain, half of the rest", () => {
    expect(eatersFactor("lydia", "protein")).toBe(0.4);
    expect(eatersFactor("lydia", "grain")).toBe(0.4);
    expect(eatersFactor("lydia", "produce")).toBe(0.5);
  });
  test("johnny + lydia factors sum to both", () => {
    for (const c of ["protein", "grain", "produce", "pantry", null]) {
      expect(eatersFactor("johnny", c) + eatersFactor("lydia", c)).toBeCloseTo(1);
    }
  });
});

describe("parseEaters / nextEaters", () => {
  test("parse", () => {
    expect(parseEaters("both")).toBe("both");
    expect(parseEaters("nope")).toBeNull();
    expect(parseEaters(undefined)).toBeNull();
  });
  test("cycles both → johnny → lydia → both", () => {
    expect(nextEaters("both")).toBe("johnny");
    expect(nextEaters("johnny")).toBe("lydia");
    expect(nextEaters("lydia")).toBe("both");
  });
});
