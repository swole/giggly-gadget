// Two small readers over a recipe body:
//   prepHints()  — "do this the night before" sentences for the kitchen's Tomorrow card
//   proteinSplit() — the "Protein 42 g / 28 g" note the heart-healthy recipes carry

const HINT_RE =
  /[^.!\n]*\b(marinat\w*|overnight|soak\w*|brine[sd]?|brining|thaw\w*|defrost\w*|the night before|(?:chill|rest|sit|refrigerate)\w* (?:in the fridge )?for at least \d+\s*(?:hours?|hrs?|h)\b|rest(?:s|ed|ing)? in the fridge|chill(?:ed|s)? in the fridge|fold (?:and )?freeze|freeze on a tray|day before|do this on (?:sunday|the weekend)|on sunday|make(?: it| this)? ahead|ahead of time|batch(?:ed)? (?:on|the)\b)[^.!\n]*[.!]?/gi;

/** Sentences that describe prep to do ahead of time, trimmed to ~110 chars, deduplicated, max 3. */
export function prepHints(instructionsMd: string | null | undefined, ingredientRaws: string[] = []): string[] {
  // Ingredient lines only count when they are shoppable (start with a quantity): "4 dried shiitake, soaked overnight"
  // yes; "shiitake water, from soaking the mushrooms" no — a derived liquid is not a job for tonight.
  const raws = ingredientRaws.map((r) => r.replace(/^\s*(?:[-•*]\s*)/, "")).filter((r) => /^[\d½¼¾⅓⅔]/.test(r));
  const text = [instructionsMd ?? "", ...raws].join("\n");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(HINT_RE)) {
    let s = m[0].replace(/^\s*(?:\d+\.\s*|[-•*]\s*)/, "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    if (s.length > 110) s = s.slice(0, 107).trimEnd() + "…";
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 3) break;
  }
  return out;
}

/** "Protein 42 g / 28 g" → { j: 42, l: 28 }; null when absent. */
export function proteinSplit(instructionsMd: string | null | undefined): { j: number; l: number } | null {
  if (!instructionsMd) return null;
  const m = instructionsMd.match(/protein\s*(\d+(?:\.\d+)?)\s*g\s*\/\s*(\d+(?:\.\d+)?)\s*g/i);
  if (!m) return null;
  return { j: Number(m[1]), l: Number(m[2]) };
}
