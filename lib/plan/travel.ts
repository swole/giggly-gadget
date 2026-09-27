// Travelling: who is out of town for which meals.
//
// A trip is an inclusive run of meals, from (from_date, from_slot) to (to_date, to_slot).
// Nothing in planned_meals is rewritten when a trip is added: every reader (planner,
// kitchen, grocery builder, print sheet, digest) takes the traveller out of a meal's
// eaters at read time, so deleting or editing a trip puts the week back exactly as it was.
// Pure helpers, unit-tested in travel.test.ts.

import { EATERS_LABEL, portionNote, type Eaters } from "@/lib/portions";
import { addDays, formatDayLabel, isValidYmd } from "@/lib/week";
import { LUNCH_PEOPLE, SLOT_LABEL, parseLunchPerson, parseSlot, type LunchPerson, type PlannedMeal, type Slot, type TripInput, type TripRow } from "./types";
import { LUNCH_PERSON_LABEL } from "./lunch";

/** Order of a day's meals for trip edges. A snack sits between lunch and dinner. */
export const TRIP_SLOT_ORDER: Record<Slot, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

/** The meals a trip can start or end on in the sheet (a snack is never an edge). */
export const TRIP_EDGE_SLOTS = ["breakfast", "lunch", "dinner"] as const satisfies readonly Slot[];

/** Longest trip the API accepts, in days. */
export const MAX_TRIP_DAYS = 62;

type TripSpan = Pick<TripRow, "person" | "from_date" | "from_slot" | "to_date" | "to_slot">;

// "2026-09-28#1" sorts in meal order as a plain string (also used by move.ts).
export function mealPoint(day: string, slot: Slot): string {
  return `${day}#${TRIP_SLOT_ORDER[slot]}`;
}

/** Does this trip cover the given meal? */
export function coversMeal(trip: TripSpan, day: string, slot: Slot): boolean {
  const p = mealPoint(day, slot);
  return p >= mealPoint(trip.from_date, trip.from_slot) && p <= mealPoint(trip.to_date, trip.to_slot);
}

/** Does this trip touch any day in [from, to] (inclusive)? */
export function tripOverlaps(trip: TripSpan, from: string, to: string): boolean {
  return trip.from_date <= to && trip.to_date >= from;
}

/** Everyone travelling for one meal, in display order. */
export function travellersAt(trips: TripSpan[], day: string, slot: Slot): LunchPerson[] {
  return LUNCH_PEOPLE.filter((p) => trips.some((t) => t.person === p && coversMeal(t, day, slot)));
}

/** Who actually eats once travellers are taken out; null when nobody is home for it. */
export function effectiveEaters(eaters: Eaters, travelling: LunchPerson[]): Eaters | null {
  const j = (eaters === "both" || eaters === "johnny") && !travelling.includes("johnny");
  const l = (eaters === "both" || eaters === "lydia") && !travelling.includes("lydia");
  return j && l ? "both" : j ? "johnny" : l ? "lydia" : null;
}

function plannedFor(eaters: Eaters, p: LunchPerson): boolean {
  return eaters === "both" || eaters === p;
}

export type MealTravel = {
  /** Who eats it now. null = nobody is home for this meal. */
  eaters: Eaters | null;
  /** Travellers taken out of this meal (planned to eat it, but away). Empty on a normal meal. */
  away: LunchPerson[];
  /** How much to cook and shop for. A meal with leftovers planned from it keeps its usual
   *  amount, so a traveller's share becomes the leftovers; otherwise only the people at the table. */
  cook: Eaters | null;
};

export function mealTravel(
  m: Pick<PlannedMeal, "planned_for" | "slot" | "eaters">,
  trips: TripSpan[],
  hasLeftovers = false,
): MealTravel {
  const away = travellersAt(trips, m.planned_for, m.slot).filter((p) => plannedFor(m.eaters, p));
  const eaters = effectiveEaters(m.eaters, away);
  return { eaters, away, cook: hasLeftovers ? m.eaters : eaters };
}

/** Ids of meals that have at least one leftover sitting planned from them. */
export function leftoverSources(meals: Pick<PlannedMeal, "leftover_of">[]): Set<number> {
  const s = new Set<number>();
  for (const m of meals) if (m.leftover_of !== null) s.add(m.leftover_of);
  return s;
}

// ---- words ----

export function personName(p: LunchPerson): string {
  return LUNCH_PERSON_LABEL[p];
}

function names(ps: LunchPerson[]): string {
  return ps.map(personName).join(" and ");
}

const slotWord = (s: Slot) => SLOT_LABEL[s].toLowerCase();

/** "Mon 28 lunch" */
export function mealLabel(day: string, slot: Slot): string {
  return `${formatDayLabel(day)} ${slotWord(slot)}`;
}

/** The first meal after the trip ends: "breakfast on Fri 2". */
export function backFor(trip: TripSpan): string {
  if (trip.to_slot === "dinner" || trip.to_slot === "snack") return `breakfast on ${formatDayLabel(addDays(trip.to_date, 1))}`;
  if (trip.to_slot === "breakfast") return `lunch on ${formatDayLabel(trip.to_date)}`;
  return `dinner on ${formatDayLabel(trip.to_date)}`;
}

/** "Mon 28 lunch to Thu 1 dinner", or "Mon 28 to Thu 1" for whole days. */
export function tripRange(trip: TripSpan): string {
  const wholeDays = trip.from_slot === "breakfast" && trip.to_slot === "dinner";
  if (trip.from_date === trip.to_date) {
    return wholeDays ? formatDayLabel(trip.from_date) : `${formatDayLabel(trip.from_date)}, ${slotWord(trip.from_slot)} to ${slotWord(trip.to_slot)}`;
  }
  if (wholeDays) return `${formatDayLabel(trip.from_date)} to ${formatDayLabel(trip.to_date)}`;
  return `${mealLabel(trip.from_date, trip.from_slot)} to ${mealLabel(trip.to_date, trip.to_slot)}`;
}

/** Banner / digest line: "Johnny travelling, Mon 28 lunch to Thu 1 dinner". */
export function tripSummary(trip: TripSpan): string {
  return `${personName(trip.person)} travelling, ${tripRange(trip)}`;
}

/** Main meals (breakfast, lunch, dinner) the trip covers. */
export function mealsMissed(trip: TripSpan): number {
  let n = 0;
  for (let d = trip.from_date, guard = 0; d <= trip.to_date && guard <= MAX_TRIP_DAYS; d = addDays(d, 1), guard++) {
    for (const s of TRIP_EDGE_SLOTS) if (coversMeal(trip, d, s)) n++;
  }
  return n;
}

export type DayTravel = { person: LunchPerson; trip: TripRow; missed: Slot[] };

/** Who is away for at least one main meal on this day, and which ones. One entry per person. */
export function travelOnDay(trips: TripRow[], day: string): DayTravel[] {
  const out: DayTravel[] = [];
  for (const p of LUNCH_PEOPLE) {
    const mine = trips.filter((t) => t.person === p && tripOverlaps(t, day, day));
    const missed = TRIP_EDGE_SLOTS.filter((s) => mine.some((t) => coversMeal(t, day, s)));
    if (missed.length === 0) continue;
    // The trip that reaches furthest decides "back for".
    const trip = mine.reduce((a, b) => (mealPoint(b.to_date, b.to_slot) > mealPoint(a.to_date, a.to_slot) ? b : a));
    out.push({ person: p, trip, missed });
  }
  return out;
}

const edgeIndex = (s: Slot) => TRIP_EDGE_SLOTS.indexOf(s as (typeof TRIP_EDGE_SLOTS)[number]);

/** How a day's missed meals read: all day, leaving part-way, back part-way, or odd meals out. */
function dayShape(missed: Slot[]): "all" | "leaves" | "returns" | "some" {
  const idx = missed.map(edgeIndex);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (missed.length === TRIP_EDGE_SLOTS.length) return "all";
  if (!contiguous) return "some";
  if (missed[missed.length - 1] === "dinner") return "leaves";
  if (missed[0] === "breakfast") return "returns";
  return "some";
}

const slotAfter = (s: Slot) => TRIP_EDGE_SLOTS[edgeIndex(s) + 1];
const slotBefore = (s: Slot) => TRIP_EDGE_SLOTS[edgeIndex(s) - 1];

/** Short planner chip: "Johnny away", "Johnny away from lunch", "Johnny back for dinner". */
export function dayChipText(dt: DayTravel): string {
  const who = personName(dt.person);
  switch (dayShape(dt.missed)) {
    case "all":
      return `${who} away`;
    case "leaves":
      return `${who} away from ${slotWord(dt.missed[0])}`;
    case "returns":
      return `${who} back for ${slotWord(slotAfter(dt.missed[dt.missed.length - 1]))}`;
    default:
      return `${who} away at ${dt.missed.map(slotWord).join(" and ")}`;
  }
}

/** The kitchen's sentence for a day: "Johnny is travelling, back for breakfast on Fri 2." */
export function kitchenTravelLine(dt: DayTravel): string {
  const who = personName(dt.person);
  switch (dayShape(dt.missed)) {
    case "all":
      return `${who} is travelling, back for ${backFor(dt.trip)}.`;
    case "leaves":
      return `${who} leaves after ${slotWord(slotBefore(dt.missed[0]))}, back for ${backFor(dt.trip)}.`;
    case "returns":
      return `${who} is back for ${slotWord(slotAfter(dt.missed[dt.missed.length - 1]))}.`;
    default:
      return `${who} is out for ${dt.missed.map(slotWord).join(" and ")}.`;
  }
}

function eatersWho(e: Eaters): string {
  return e === "both" ? "Johnny and Lydia" : e === "johnny" ? "Johnny" : "Lydia";
}

/** The helper's portion line on a kitchen card. Unchanged from portionNote() when nobody is travelling. */
export function travelPortionNote(t: MealTravel, leftovers: string[] = []): string | null {
  if (t.away.length === 0) return t.eaters ? portionNote(t.eaters) : null;
  const lead = `${names(t.away)} ${t.away.length > 1 ? "are" : "is"} travelling.`;
  if (leftovers.length > 0 && t.cook) {
    const keep = `keep the rest for ${leftovers.join(" and ")}`;
    return t.eaters
      ? `${lead} Cook the usual amount: plate ${eatersWho(t.eaters)}'s share now and ${keep}.`
      : `${lead} Cook the usual amount and ${keep}.`;
  }
  if (t.eaters) return `${lead} ${portionNote(t.eaters)}`;
  return `${lead} Nobody is home for this meal.`;
}

/** Chip text for who eats: "J+L", "L", or "Away" when nobody is home. */
export function eatersChip(e: Eaters | null): string {
  if (e === null) return "Away";
  return e === "both" ? "J+L" : e === "johnny" ? "J" : "L";
}

/** Accessible sentence for the chip. */
export function eatersSentence(t: MealTravel): string {
  const base = t.eaters ? EATERS_LABEL[t.eaters] : "Nobody home";
  return t.away.length > 0 ? `${base}. ${names(t.away)} ${t.away.length > 1 ? "are" : "is"} travelling.` : base;
}

// ---- validation (shared by the sheet and the API) ----

export function parseTripInput(v: unknown): { ok: true; trip: TripInput } | { ok: false; error: string } {
  const b = (v ?? {}) as Record<string, unknown>;
  const person = parseLunchPerson(b.person);
  const from_slot = parseSlot(typeof b.from_slot === "string" ? b.from_slot : null);
  const to_slot = parseSlot(typeof b.to_slot === "string" ? b.to_slot : null);
  const from_date = typeof b.from_date === "string" ? b.from_date : "";
  const to_date = typeof b.to_date === "string" ? b.to_date : "";
  if (!person) return { ok: false, error: "Pick who is travelling." };
  if (!isValidYmd(from_date) || !isValidYmd(to_date) || !from_slot || !to_slot) return { ok: false, error: "Pick the first and last meal away." };
  if (mealPoint(to_date, to_slot) < mealPoint(from_date, from_slot)) return { ok: false, error: "The last meal away comes before the first one." };
  if (to_date > addDays(from_date, MAX_TRIP_DAYS)) return { ok: false, error: `Trips can run ${MAX_TRIP_DAYS} days at most.` };
  return { ok: true, trip: { person, from_date, from_slot, to_date, to_slot } };
}

/** Mondays of every week the trip touches (for grocery rebuilds). */
export function tripWeeks(trip: Pick<TripRow, "from_date" | "to_date">, mondayOf: (d: string) => string): string[] {
  const out: string[] = [];
  for (let w = mondayOf(trip.from_date), guard = 0; w <= trip.to_date && guard < 12; w = addDays(w, 7), guard++) out.push(w);
  return out;
}
