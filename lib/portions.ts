// Who is eating a planned meal, and how that scales each ingredient.
//
// Recipes in this household are written for Johnny + Lydia together (Servings = 2 means
// "the two of them"). The plate split is 3:2 on protein and grains (Johnny ~60%), and
// equal on everything else (vegetables, sauces follow the dish). So when only one of
// them eats, the factor is applied per ingredient category rather than per serving.
//
// This is deliberately NOT divided by `servings`: the unit is "the recipe as written".
// The 5-portion baked oats tray with eaters=both still means "cook the tray".

export const EATERS = ["both", "johnny", "lydia"] as const;
export type Eaters = (typeof EATERS)[number];

export const EATERS_LABEL: Record<Eaters, string> = {
  both: "Johnny + Lydia",
  johnny: "Johnny only",
  lydia: "Lydia only",
};

export const EATERS_SHORT: Record<Eaters, string> = {
  both: "J+L",
  johnny: "J",
  lydia: "L",
};

const SPLIT_CATEGORIES = new Set(["protein", "grain"]);

/** Multiplier for one ingredient line given who is eating and the line's category. */
export function eatersFactor(eaters: Eaters, category: string | null | undefined): number {
  if (eaters === "both") return 1;
  const split = SPLIT_CATEGORIES.has(category ?? "");
  if (eaters === "johnny") return split ? 0.6 : 0.5;
  return split ? 0.4 : 0.5; // lydia
}

export function parseEaters(v: string | null | undefined): Eaters | null {
  if (!v) return null;
  return (EATERS as readonly string[]).includes(v) ? (v as Eaters) : null;
}

export function nextEaters(e: Eaters): Eaters {
  const i = EATERS.indexOf(e);
  return EATERS[(i + 1) % EATERS.length];
}

/** One-line note for the helper's meal card. */
export function portionNote(eaters: Eaters): string {
  switch (eaters) {
    case "both":
      return "Cook the full recipe. Plate Johnny 3 parts, Lydia 2 parts on protein and grains; vegetables equal.";
    case "johnny":
      return "Johnny only: about 60% of the protein and grains, half of everything else.";
    case "lydia":
      return "Lydia only: about 40% of the protein and grains, half of everything else.";
  }
}
