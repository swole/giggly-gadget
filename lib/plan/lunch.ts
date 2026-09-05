// Lunch is the one meal that may leave the house: each planner either eats it at
// home or takes it packed to the office. One row per day + person in lunch_locations;
// no row means home. Pure helpers shared by the planner pills, the kitchen, the
// WhatsApp digest and the print sheet.

import { LUNCH_PEOPLE, type LunchLocation, type LunchLocationRow, type LunchPerson } from "./types";

export const LUNCH_PERSON_LABEL: Record<LunchPerson, string> = { johnny: "Johnny", lydia: "Lydia" };
export const LUNCH_PERSON_SHORT: Record<LunchPerson, string> = { johnny: "J", lydia: "L" };

export function lunchLocationOf(rows: LunchLocationRow[], day: string, person: LunchPerson): LunchLocation {
  return rows.find((r) => r.planned_for === day && r.person === person)?.location ?? "home";
}

/** Who takes lunch to the office that day, in display order. */
export function lunchAway(rows: LunchLocationRow[], day: string): LunchPerson[] {
  return LUNCH_PEOPLE.filter((p) => lunchLocationOf(rows, day, p) === "office");
}

export function toggleLunchLocation(cur: LunchLocation): LunchLocation {
  return cur === "home" ? "office" : "home";
}

/** The helper's line on the kitchen card; null when everyone eats at home. */
export function packNote(away: LunchPerson[]): string | null {
  if (away.length === 0) return null;
  if (away.length === LUNCH_PEOPLE.length) return "Pack both lunches for the office";
  return `Pack ${LUNCH_PERSON_LABEL[away[0]]}'s lunch for the office`;
}

/** Short form for the digest and the print sheet. */
export function packShort(away: LunchPerson[]): string | null {
  if (away.length === 0) return null;
  return `pack lunch: ${away.map((p) => LUNCH_PERSON_LABEL[p]).join(" + ")}`;
}
