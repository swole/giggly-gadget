import { ROTATION, resolveRotation, rotationWeekFor } from "./rotation";
import { weekDates } from "@/lib/week";

describe("rotationWeekFor", () => {
  test("anchor week is 1, then 2, 3, 1…", () => {
    expect(rotationWeekFor("2026-08-24")).toBe(1);
    expect(rotationWeekFor("2026-08-31")).toBe(2);
    expect(rotationWeekFor("2026-09-07")).toBe(3);
    expect(rotationWeekFor("2026-09-14")).toBe(1);
  });
  test("weeks before the anchor still cycle", () => {
    expect(rotationWeekFor("2026-08-17")).toBe(3);
  });
});

describe("ROTATION shape", () => {
  test("three weeks of seven days, five cooked dinners each, Sunday breakfast only", () => {
    for (const n of [1, 2, 3] as const) {
      const w = ROTATION[n];
      expect(w).toHaveLength(7);
      expect(w.filter((d) => d.dinner?.length).length).toBe(5);
      expect(w[6].dinner).toBeUndefined();
      expect(w[6].breakfast).toHaveLength(1);
    }
  });
  test("every week has at least three oily-fish slots (saba / salmon / mackerel / assam pedas)", () => {
    const oily = /saba|salmon|mackerel|assam pedas|sardine/i;
    for (const n of [1, 2, 3] as const) {
      const titles = ROTATION[n].flatMap((d) => Object.values(d).flat().map((x) => x.title));
      expect(titles.filter((t) => oily.test(t)).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("resolveRotation", () => {
  const dates = weekDates("2026-08-24");
  test("matches by id", () => {
    const recipes = [{ id: "3c5198fd-3b9c-8132-89b6-fdd759926f2d", title: "Renamed In Notion" }];
    const r = resolveRotation(1, dates, recipes);
    expect(r.items).toEqual([{ planned_for: "2026-08-24", slot: "breakfast", recipe_id: "3c5198fd-3b9c-8132-89b6-fdd759926f2d" }]);
  });
  test("falls back to a normalised title match and reports the rest as unmatched", () => {
    const recipes = [{ id: "new-id", title: "tofu   BIBIMBAP" }];
    const r = resolveRotation(1, dates, recipes);
    expect(r.items).toEqual([{ planned_for: "2026-08-24", slot: "lunch", recipe_id: "new-id" }]);
    expect(r.unmatched.length).toBeGreaterThan(10);
    expect(r.unmatched).toContain("Mapo Tofu, Rebuilt Low-Sodium");
  });
});
