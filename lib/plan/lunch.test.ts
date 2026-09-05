import { lunchAway, lunchLocationOf, packNote, packShort, toggleLunchLocation } from "./lunch";
import type { LunchLocationRow } from "./types";

const row = (planned_for: string, person: "johnny" | "lydia", location: "home" | "office"): LunchLocationRow => ({
  planned_for,
  person,
  location,
  updated_by: null,
  updated_at: "2026-09-05T00:00:00Z",
});

describe("lunch locations", () => {
  const rows = [row("2026-09-08", "johnny", "office"), row("2026-09-08", "lydia", "home"), row("2026-09-09", "lydia", "office")];

  it("no row means home", () => {
    expect(lunchLocationOf(rows, "2026-09-10", "johnny")).toBe("home");
    expect(lunchLocationOf(rows, "2026-09-08", "johnny")).toBe("office");
    expect(lunchLocationOf(rows, "2026-09-08", "lydia")).toBe("home");
  });

  it("lunchAway lists the office people in display order", () => {
    expect(lunchAway(rows, "2026-09-08")).toEqual(["johnny"]);
    expect(lunchAway(rows, "2026-09-09")).toEqual(["lydia"]);
    expect(lunchAway(rows, "2026-09-10")).toEqual([]);
    expect(lunchAway([...rows, row("2026-09-09", "johnny", "office")], "2026-09-09")).toEqual(["johnny", "lydia"]);
  });

  it("toggle flips between home and office", () => {
    expect(toggleLunchLocation("home")).toBe("office");
    expect(toggleLunchLocation("office")).toBe("home");
  });

  it("pack notes read naturally", () => {
    expect(packNote([])).toBeNull();
    expect(packNote(["johnny"])).toBe("Pack Johnny's lunch for the office");
    expect(packNote(["johnny", "lydia"])).toBe("Pack both lunches for the office");
    expect(packShort([])).toBeNull();
    expect(packShort(["lydia"])).toBe("pack lunch: Lydia");
    expect(packShort(["johnny", "lydia"])).toBe("pack lunch: Johnny + Lydia");
  });
});
