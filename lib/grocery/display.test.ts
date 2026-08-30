import { displayGroceryRow } from "./display";

const row = (name: string, qty_min: number | null, unit: string | null = null, qty_max: number | null = null, category: string | null = "produce") =>
  displayGroceryRow({ name, qty_min, qty_max, unit, category });

describe("displayGroceryRow", () => {
  test("plain mass rows pass through with vulgar fractions", () => {
    expect(row("broccoli", 200, "g")).toEqual({ qty: "200", unit: "g", name: "broccoli", note: null });
    expect(row("dashi", 1.5, "cup")).toEqual({ qty: "1½", unit: "cups", name: "dashi", note: null });
  });

  test("whole vegetables round up with the math kept as a note", () => {
    expect(row("onion", 2.25)).toEqual({ qty: "3", unit: null, name: "onions", note: "recipes need 2¼" });
    expect(row("carrot", 3.5)).toEqual({ qty: "4", unit: null, name: "carrots", note: "recipes need 3½" });
  });

  test("pseudo-unit stuck in the name is promoted and rounded", () => {
    expect(row("packs fresh yakisoba noodles", 1.2, null, null, "grain")).toEqual({
      qty: "2", unit: "packs", name: "fresh yakisoba noodles", note: "recipes need 1.2",
    });
  });

  test("garlic cloves translate to heads", () => {
    expect(row("garlic", 21, "clove")).toEqual({ qty: "2", unit: "heads", name: "garlic", note: "21 cloves" });
    // small clove counts stay as cloves
    expect(row("garlic", 4, "clove")).toEqual({ qty: "4", unit: "cloves", name: "garlic", note: null });
  });

  test("spring onions by the dozen become bunches", () => {
    expect(row("spring onion", 13)).toEqual({ qty: "2", unit: "bunches", name: "spring onion", note: "about 13 stalks" });
  });

  test("grated/minced produce shows the buyable thing", () => {
    expect(row("grated ginger", 1, "tsp")).toEqual({ qty: "", unit: null, name: "ginger", note: "1 tsp grated" });
    expect(row("grated daikon", 0.25, "cup")).toEqual({ qty: "", unit: null, name: "daikon", note: "¼ cup grated" });
  });

  test("either-or names resolve to the first with the alternative as a note", () => {
    expect(row("leek or scallion", 60, "g")).toEqual({ qty: "60", unit: "g", name: "leek", note: "or scallion" });
  });

  test("discrete units never show fractions", () => {
    expect(row("coconut milk", 1.5, "can", null, "pantry")).toEqual({
      qty: "2", unit: "cans", name: "coconut milk", note: "recipes need 1½",
    });
  });

  test("ranges survive", () => {
    expect(row("red chilli", 1, null, 2)).toEqual({ qty: "1–2", unit: null, name: "red chillies", note: null });
  });

  test("names that should not pluralize", () => {
    expect(row("kailan", 2)).toEqual({ qty: "2", unit: null, name: "kailan", note: null });
    expect(row("broccoli", 2)).toEqual({ qty: "2", unit: null, name: "broccoli", note: null });
  });
});
