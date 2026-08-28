import { prepHints, proteinSplit } from "./hints";

describe("prepHints", () => {
  test("finds marinate / soak / overnight sentences", () => {
    const md = `## Instructions
1. Marinate the fish slices in the egg white, cornflour and white pepper for 15 minutes. This is what keeps them silky.
2. Soak the dried shiitake in hot water for 20 minutes. Keep the water.
3. Fry the rempah.
4. Lid on, fridge overnight. At least 6 hours.`;
    const h = prepHints(md);
    expect(h[0]).toMatch(/^Marinate the fish slices/);
    expect(h[1]).toMatch(/^Soak the dried shiitake/);
    expect(h[2]).toMatch(/fridge overnight/);
    expect(h).toHaveLength(3);
  });
  test("Sunday batch jobs count; same-day tofu pressing does not", () => {
    const h = prepHints("1. NAMUL, do this on Sunday. Blanch the spinach.\n2. Press the tofu, cube it and sear it.");
    expect(h).toEqual(["NAMUL, do this on Sunday."]);
  });
  test("'bring to the boil' and long simmers are not prep-ahead hints", () => {
    expect(prepHints("1. Bring a large pot of water to the boil.\n2. Simmer for at least 2 hours until tender.\n3. Bring the sauce to a simmer.")).toEqual([]);
    expect(prepHints("1. Brine the chicken for 4 hours.")).toEqual(["Brine the chicken for 4 hours."]);
    expect(prepHints("1. Chill in the fridge for at least 3 hours.")).toEqual(["Chill in the fridge for at least 3 hours."]);
  });
  test("nothing when there is nothing", () => {
    expect(prepHints("1. Heat the oil.\n2. Fry the egg.")).toEqual([]);
    expect(prepHints(null)).toEqual([]);
  });
  test("derived liquids in the ingredient list are not hints", () => {
    expect(prepHints(null, ["- shiitake water, 250 ml, from soaking the dried shiitake", "- 4 dried shiitake, soaked for the water"])).toEqual(["4 dried shiitake, soaked for the water"]);
  });
  test("reads ingredient raws too and trims long lines", () => {
    const h = prepHints(null, ["- 6 dried shiitake, soaked for the water, " + "x".repeat(150)]);
    expect(h).toHaveLength(1);
    expect(h[0].length).toBeLessThanOrEqual(110);
    expect(h[0].endsWith("…")).toBe(true);
  });
});

describe("proteinSplit", () => {
  test("parses the household note", () => {
    expect(proteinSplit("…vegetables equal). Protein 42 g / 28 g.\n**Watch:** …")).toEqual({ j: 42, l: 28 });
  });
  test("null when absent", () => {
    expect(proteinSplit("no numbers here")).toBeNull();
    expect(proteinSplit(null)).toBeNull();
  });
});
