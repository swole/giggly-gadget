import {
  backFor,
  coversMeal,
  dayChipText,
  effectiveEaters,
  eatersChip,
  kitchenTravelLine,
  leftoverSources,
  mealTravel,
  mealsMissed,
  parseTripInput,
  travelOnDay,
  travelPortionNote,
  travellersAt,
  tripRange,
  tripSummary,
  tripWeeks,
} from "./travel";
import { lunchAway } from "./lunch";
import type { LunchLocationRow, TripRow } from "./types";
import { weekMondayOf } from "@/lib/week";

// Johnny's week of 28 Sep 2026: out Monday to Thursday, but eats Monday breakfast first.
const trip = (over: Partial<TripRow> = {}): TripRow => ({
  id: 1,
  person: "johnny",
  from_date: "2026-09-28",
  from_slot: "lunch",
  to_date: "2026-10-01",
  to_slot: "dinner",
  created_by: "Johnny",
  created_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-26T00:00:00Z",
  ...over,
});

describe("trip coverage", () => {
  const t = trip();

  it("starts after Monday breakfast and ends after Thursday dinner", () => {
    expect(coversMeal(t, "2026-09-28", "breakfast")).toBe(false);
    expect(coversMeal(t, "2026-09-28", "lunch")).toBe(true);
    expect(coversMeal(t, "2026-09-30", "breakfast")).toBe(true);
    expect(coversMeal(t, "2026-10-01", "dinner")).toBe(true);
    expect(coversMeal(t, "2026-10-02", "breakfast")).toBe(false);
  });

  it("counts a snack between lunch and dinner", () => {
    expect(coversMeal(trip({ from_slot: "dinner" }), "2026-09-28", "snack")).toBe(false);
    expect(coversMeal(trip({ to_date: "2026-09-28", to_slot: "lunch" }), "2026-09-28", "snack")).toBe(false);
    expect(coversMeal(t, "2026-09-28", "snack")).toBe(true);
  });

  it("lists travellers per meal", () => {
    const both = [t, trip({ id: 2, person: "lydia", from_date: "2026-09-30", from_slot: "breakfast", to_date: "2026-09-30", to_slot: "dinner" })];
    expect(travellersAt(both, "2026-09-28", "breakfast")).toEqual([]);
    expect(travellersAt(both, "2026-09-29", "dinner")).toEqual(["johnny"]);
    expect(travellersAt(both, "2026-09-30", "lunch")).toEqual(["johnny", "lydia"]);
  });

  it("counts the main meals missed", () => {
    expect(mealsMissed(t)).toBe(11); // Mon lunch + dinner, then three a day Tue to Thu
    expect(mealsMissed(trip({ from_slot: "breakfast", to_date: "2026-09-28", to_slot: "breakfast" }))).toBe(1);
  });
});

describe("who eats", () => {
  it("takes the traveller out of the eaters", () => {
    expect(effectiveEaters("both", ["johnny"])).toBe("lydia");
    expect(effectiveEaters("both", ["lydia"])).toBe("johnny");
    expect(effectiveEaters("lydia", ["johnny"])).toBe("lydia");
    expect(effectiveEaters("johnny", ["johnny"])).toBeNull();
    expect(effectiveEaters("both", ["johnny", "lydia"])).toBeNull();
    expect(effectiveEaters("both", [])).toBe("both");
  });

  it("marks only the travellers who were planned to eat", () => {
    const trips = [trip()];
    expect(mealTravel({ planned_for: "2026-09-28", slot: "breakfast", eaters: "both" }, trips)).toEqual({ eaters: "both", away: [], cook: "both" });
    expect(mealTravel({ planned_for: "2026-09-29", slot: "dinner", eaters: "both" }, trips)).toEqual({ eaters: "lydia", away: ["johnny"], cook: "lydia" });
    // A Lydia-only meal is untouched by Johnny's trip.
    expect(mealTravel({ planned_for: "2026-09-29", slot: "dinner", eaters: "lydia" }, trips)).toEqual({ eaters: "lydia", away: [], cook: "lydia" });
  });

  it("cooks the usual amount when leftovers are planned from the meal", () => {
    const t = mealTravel({ planned_for: "2026-10-01", slot: "dinner", eaters: "both" }, [trip()], true);
    expect(t).toEqual({ eaters: "lydia", away: ["johnny"], cook: "both" });
    // Nobody home but leftovers later: still cook it.
    const gone = mealTravel({ planned_for: "2026-09-29", slot: "dinner", eaters: "johnny" }, [trip()], true);
    expect(gone).toEqual({ eaters: null, away: ["johnny"], cook: "johnny" });
  });

  it("finds leftover sources", () => {
    expect(leftoverSources([{ leftover_of: null }, { leftover_of: 7 }, { leftover_of: 7 }, { leftover_of: 9 }])).toEqual(new Set([7, 9]));
  });

  it("keeps the old portion note when nobody travels", () => {
    expect(travelPortionNote({ eaters: "both", away: [], cook: "both" })).toMatch(/^Cook the full recipe/);
  });

  it("writes the travelling portion notes", () => {
    expect(travelPortionNote({ eaters: "lydia", away: ["johnny"], cook: "lydia" })).toBe(
      "Johnny is travelling. Lydia only: about 40% of the protein and grains, half of everything else.",
    );
    expect(travelPortionNote({ eaters: "lydia", away: ["johnny"], cook: "both" }, ["Fri 2 lunch"])).toBe(
      "Johnny is travelling. Cook the usual amount: plate Lydia's share now and keep the rest for Fri 2 lunch.",
    );
    expect(travelPortionNote({ eaters: null, away: ["johnny", "lydia"], cook: null })).toBe("Johnny and Lydia are travelling. Nobody is home for this meal.");
  });

  it("shows the chip", () => {
    expect(eatersChip("lydia")).toBe("L");
    expect(eatersChip(null)).toBe("Away");
  });
});

describe("words", () => {
  it("names the range", () => {
    expect(tripRange(trip())).toBe("Mon 28 lunch to Thu 1 dinner");
    expect(tripRange(trip({ from_slot: "breakfast" }))).toBe("Mon 28 to Thu 1");
    expect(tripRange(trip({ to_date: "2026-09-28" }))).toBe("Mon 28, lunch to dinner");
    expect(tripSummary(trip())).toBe("Johnny travelling, Mon 28 lunch to Thu 1 dinner");
  });

  it("says when they are back", () => {
    expect(backFor(trip())).toBe("breakfast on Fri 2");
    expect(backFor(trip({ to_slot: "breakfast" }))).toBe("lunch on Thu 1");
    expect(backFor(trip({ to_slot: "lunch" }))).toBe("dinner on Thu 1");
  });

  it("describes each day", () => {
    const trips = [trip()];
    expect(travelOnDay(trips, "2026-09-27")).toEqual([]);
    const mon = travelOnDay(trips, "2026-09-28");
    expect(mon.map((d) => d.missed)).toEqual([["lunch", "dinner"]]);
    expect(dayChipText(mon[0])).toBe("Johnny away from lunch");
    expect(kitchenTravelLine(mon[0])).toBe("Johnny leaves after breakfast, back for breakfast on Fri 2.");
    const tue = travelOnDay(trips, "2026-09-29")[0];
    expect(dayChipText(tue)).toBe("Johnny away");
    expect(kitchenTravelLine(tue)).toBe("Johnny is travelling, back for breakfast on Fri 2.");
    expect(travelOnDay(trips, "2026-10-02")).toEqual([]);

    const home = travelOnDay([trip({ from_date: "2026-09-27", from_slot: "breakfast", to_date: "2026-09-28", to_slot: "breakfast" })], "2026-09-28")[0];
    expect(dayChipText(home)).toBe("Johnny back for lunch");
    expect(kitchenTravelLine(home)).toBe("Johnny is back for lunch.");

    const lunchOnly = travelOnDay([trip({ to_date: "2026-09-28", to_slot: "lunch" })], "2026-09-28")[0];
    expect(dayChipText(lunchOnly)).toBe("Johnny away at lunch");
    expect(kitchenTravelLine(lunchOnly)).toBe("Johnny is out for lunch.");

    // Back after breakfast, off again before dinner: two trips, odd meals out.
    const twice = travelOnDay(
      [trip({ from_date: "2026-09-27", from_slot: "dinner", to_date: "2026-09-28", to_slot: "breakfast" }), trip({ id: 2, from_slot: "dinner" })],
      "2026-09-28",
    )[0];
    expect(twice.missed).toEqual(["breakfast", "dinner"]);
    expect(dayChipText(twice)).toBe("Johnny away at breakfast and dinner");
  });
});

describe("lunch packing", () => {
  const row = (person: "johnny" | "lydia"): LunchLocationRow => ({ planned_for: "2026-09-29", person, location: "office", updated_by: null, updated_at: "x" });

  it("never packs a lunch for someone travelling", () => {
    const rows = [row("johnny"), row("lydia")];
    const away = travellersAt([trip()], "2026-09-29", "lunch");
    expect(lunchAway(rows, "2026-09-29", away)).toEqual(["lydia"]);
    expect(lunchAway(rows, "2026-09-29")).toEqual(["johnny", "lydia"]);
  });
});

describe("validation", () => {
  it("accepts a good trip", () => {
    const r = parseTripInput({ person: "johnny", from_date: "2026-09-28", from_slot: "lunch", to_date: "2026-10-01", to_slot: "dinner" });
    expect(r).toEqual({ ok: true, trip: { person: "johnny", from_date: "2026-09-28", from_slot: "lunch", to_date: "2026-10-01", to_slot: "dinner" } });
  });

  it("rejects bad ones", () => {
    expect(parseTripInput({ person: "shallaine", from_date: "2026-09-28", from_slot: "lunch", to_date: "2026-10-01", to_slot: "dinner" }).ok).toBe(false);
    expect(parseTripInput({ person: "johnny", from_date: "2026-09-28", from_slot: "dinner", to_date: "2026-09-28", to_slot: "lunch" }).ok).toBe(false);
    expect(parseTripInput({ person: "johnny", from_date: "2026-02-30", from_slot: "lunch", to_date: "2026-03-01", to_slot: "dinner" }).ok).toBe(false);
    expect(parseTripInput({ person: "johnny", from_date: "2026-01-01", from_slot: "lunch", to_date: "2026-06-01", to_slot: "dinner" }).ok).toBe(false);
    expect(parseTripInput(null).ok).toBe(false);
  });

  it("lists the weeks a trip touches", () => {
    expect(tripWeeks(trip(), weekMondayOf)).toEqual(["2026-09-28"]);
    expect(tripWeeks(trip({ from_date: "2026-09-26", to_date: "2026-10-06" }), weekMondayOf)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
  });
});
