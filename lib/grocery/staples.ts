// Pantry staples: things that live in the cupboard and are not re-bought weekly.
// The list lives in the pantry_staples table (seeded by migration 0003, editable
// from the phone). Names are stored normalized; matching is exact or singular.

import { singularize } from "@/lib/ingredients/categorize";

export function normalizeStapleName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Exact match, singular match, or the name minus a leading qualifier (e.g. "light soy sauce" ~ "soy sauce"). */
export function isStaple(name: string | null | undefined, staples: Set<string>): boolean {
  if (!name) return false;
  const n = normalizeStapleName(name);
  const variants = (x: string) => [x, singularize(x), x + "s", x + "es"];
  if (variants(n).some((v) => staples.has(v))) return true;
  const words = n.split(" ");
  for (let i = 1; i < words.length; i++) {
    const tail = words.slice(i).join(" ");
    if (variants(tail).some((v) => staples.has(v))) return true;
  }
  return false;
}

export function toStapleSet(names: Iterable<string>): Set<string> {
  const s = new Set<string>();
  for (const n of names) s.add(normalizeStapleName(n));
  return s;
}
