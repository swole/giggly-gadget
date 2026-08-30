// Cook-mode step annotation: "Slice the tofu" → "Slice the tofu (415 g)".
// The amount lives two screens back on the detail page; the person at the stove
// needs it in the step. Pure text-in/text-out so timers and markdown render after.

import { formatRange } from "@/lib/scale";
import type { ParsedIngredientRow } from "@/lib/recipes";

// Prep words that lead ingredient names — matching should hit the noun, not the prep.
const PREP_PREFIX_RE = /^(grated|minced|finely grated|finely minced|shredded|julienned|ground|chopped|sliced|fresh|dried)\s+/;

export function annotateAmounts(
  step: string,
  ingredients: Pick<ParsedIngredientRow, "name" | "qty_min" | "qty_max" | "unit" | "scalable" | "to_taste">[],
): string {
  if (!step || ingredients.length === 0) return step;

  const usable = ingredients
    .filter((i) => i.name && i.qty_min !== null && i.scalable && !i.to_taste)
    .map((i) => {
      const base = i.name!.replace(PREP_PREFIX_RE, "").trim().toLowerCase();
      const lastWord = base.split(/\s+/).pop() ?? "";
      return {
        full: i.name!.toLowerCase(),
        base,
        lastWord,
        amount: `${formatRange(i.qty_min, i.qty_max)}${i.unit ? ` ${i.unit}` : ""}`,
      };
    })
    .filter((c) => c.base.length >= 3);

  // "the tofu" should find "silken tofu" — but only when the noun is unambiguous
  // across the recipe (two sauces would fight over "sauce").
  const lastWordCounts = new Map<string, number>();
  for (const c of usable) lastWordCounts.set(c.lastWord, (lastWordCounts.get(c.lastWord) ?? 0) + 1);

  const candidates = usable.sort((a, b) => b.base.length - a.base.length);

  // Match on the ORIGINAL text with overlap tracking, then insert back-to-front, so
  // "spring onion" claiming its span stops plain "onion" double-annotating inside it.
  const taken: Array<[number, number]> = [];
  const insertions: Array<{ at: number; text: string }> = [];
  const overlaps = (s: number, e: number) => taken.some(([ts, te]) => s < te && e > ts);

  for (const c of candidates) {
    const needles = [c.full, c.base, lastWordCounts.get(c.lastWord) === 1 && c.lastWord.length >= 3 ? c.lastWord : null]
      .filter((n, idx, arr): n is string => n !== null && arr.indexOf(n) === idx);
    let placed = false;
    for (const needle of needles) {
      if (placed) break;
      const re = new RegExp(`\\b${escapeRe(needle)}\\b`, "ig");
      let m: RegExpExecArray | null;
      while ((m = re.exec(step)) !== null) {
        const end = m.index + m[0].length;
        if (overlaps(m.index, end)) continue;
        // If the step already gives an amount just before the mention ("heat 1.5 tbsp
        // oil"), the author's per-step figure wins — skip this ingredient entirely.
        const before = step.slice(Math.max(0, m.index - 14), m.index);
        if (/\d/.test(before)) { placed = true; break; }
        taken.push([m.index, end]);
        insertions.push({ at: end, text: ` (${c.amount})` });
        placed = true;
        break;
      }
    }
  }

  let out = step;
  for (const ins of insertions.sort((a, b) => b.at - a.at)) {
    out = `${out.slice(0, ins.at)}${ins.text}${out.slice(ins.at)}`;
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
