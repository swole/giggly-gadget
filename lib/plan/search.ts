// Picker search: word-based, accent- and punctuation-blind, over title + cuisine + tags.
// "salmon" finds Crisp-Skin Salmon; "crisp skin" and "crisp-skin" are the same query;
// "korean quick" needs both words somewhere in the haystack. Pure, so it is unit-tested.

import type { PlannerRecipe } from "./types";

/** Lower-case, drop accents, and turn every run of punctuation into a single space. */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The typed query as words; empty when nothing meaningful was typed. */
export function searchWords(q: string): string[] {
  return normalizeSearch(q).split(" ").filter(Boolean);
}

/** Every typed word must appear somewhere in the recipe's title, cuisine or tags. */
export function matchesSearch(r: Pick<PlannerRecipe, "title" | "cuisine" | "tags">, words: string[]): boolean {
  if (words.length === 0) return true;
  const hay = normalizeSearch([r.title, r.cuisine ?? "", ...(r.tags ?? [])].join(" "));
  return words.every((w) => hay.includes(w));
}
