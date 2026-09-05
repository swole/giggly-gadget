// Side/soup pairing. The scaling rule: every recipe already carries Cuisine and
// Meal Type — pairing derives from those, so new recipes pair automatically the
// moment they're synced. No per-recipe pairing lists to maintain.
//
// A "pairable" is a Side by meal type, any dish tagged "Side Dish" (a main that can
// also sit beside another main: greens, tofu, eggs, dal), or any soup (many soups here are stored
// as Dinner/Lunch mains — a Chinese dinner is a main + greens + soup, so they
// pair as well as they headline). Matching walks outward: same cuisine, then
// same family (Chinese/Korean/Japanese eat together happily), then adjacent
// families, then universal sides (cuisine "Other" or an explicit Universal tag).

import type { PlannerRecipe } from "./types";
import { SIDE_DISH_TAG } from "@/lib/tag-lint";

export type PairRole = "side" | "soup";

const SOUP_RE = /\b(soup|broth|minestrone|chowder|jjigae|stew pot|tang\b|guk\b)\b/i;

/** What a recipe can be alongside a main — or null if it's a main-only dish. */
export function pairRole(r: Pick<PlannerRecipe, "meal_type" | "title" | "tags">): PairRole | null {
  if (SOUP_RE.test(r.title)) return "soup";
  if (r.meal_type === "Side" || (r.tags ?? []).includes(SIDE_DISH_TAG)) return "side";
  return null;
}

const FAMILY: Record<string, string> = {
  Chinese: "east-asian",
  Korean: "east-asian",
  Japanese: "east-asian",
  Thai: "southeast-asian",
  Vietnamese: "southeast-asian",
  Malay: "southeast-asian",
  Indian: "south-asian",
  Italian: "western",
  French: "western",
  American: "western",
  Mediterranean: "western",
  Mexican: "western",
};

const ADJACENT: Record<string, string[]> = {
  "east-asian": ["southeast-asian"],
  "southeast-asian": ["east-asian", "south-asian"],
  "south-asian": ["southeast-asian"],
  western: [],
};

/**
 * 0 = don't suggest · 1 = universal/adjacent · 2 = same family · 3 = same cuisine.
 */
export function pairScore(
  main: Pick<PlannerRecipe, "cuisine">,
  side: Pick<PlannerRecipe, "cuisine" | "tags" | "meal_type" | "title">,
): number {
  if (pairRole(side) === null) return 0;
  const universal = side.cuisine === null || side.cuisine === "Other" || (side.tags ?? []).includes("Universal");
  if (!main.cuisine) return universal ? 1 : 0;
  if (side.cuisine === main.cuisine) return 3;
  const mf = FAMILY[main.cuisine];
  const sf = side.cuisine ? FAMILY[side.cuisine] : undefined;
  if (mf && sf && mf === sf) return 2;
  if (mf && sf && (ADJACENT[mf] ?? []).includes(sf)) return 1;
  return universal ? 1 : 0;
}

/**
 * Pairable recipes for the given mains, best first: score, then rating, then
 * least-recently made. Mains with mixed cuisines take each side's best score.
 */
export function suggestPairings(mains: PlannerRecipe[], recipes: PlannerRecipe[]): { recipe: PlannerRecipe; score: number; role: PairRole }[] {
  const out: { recipe: PlannerRecipe; score: number; role: PairRole }[] = [];
  for (const r of recipes) {
    if (mains.some((m) => m.id === r.id)) continue;
    const role = pairRole(r);
    if (!role) continue;
    const score = Math.max(0, ...mains.map((m) => pairScore(m, r)));
    if (score > 0) out.push({ recipe: r, score, role });
  }
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      (b.recipe.rating ?? 0) - (a.recipe.rating ?? 0) ||
      (a.recipe.last_made ?? "0000").localeCompare(b.recipe.last_made ?? "0000"),
  );
}
