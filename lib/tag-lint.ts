// Recipe tagging rules, in code. One source of truth for four enforcement points:
//   - lib/notion-sync.ts runs lintRecipe on every page it upserts and returns the
//     findings in the sync JSON (`lint`), so a badly tagged recipe is visible the
//     moment it lands, whichever route added it
//   - scripts/tag-lint.mjs audits the whole Notion database and applies the
//     mechanical fixes (`--fix`)
//   - lib/extract/prompt.ts words the same rules for Claude when a recipe is added in-app
//   - AGENTS.md "Recipe tagging rules" is the human-readable version
// Keep the four in step.
//
// No "@/" imports and no app dependencies: node runs this file directly (type stripping).

export const SIDE_DISH_TAG = "Side Dish";
export const QUICK_MAX_MIN = 30;

export type LintInput = {
  title: string;
  meal_type: string | null;
  cuisine: string | null;
  tags: string[] | null;
  prep_min: number | null;
  cook_min: number | null;
  source: string | null;
};

export type LintCode =
  | "reference-row"
  | "no-meal-type"
  | "no-cuisine"
  | "side-without-tag"
  | "quick-too-long"
  | "vegan-not-vegetarian"
  | "no-tags";

export type LintFinding = {
  code: LintCode;
  message: string;
  /** A mechanical fix the lint script may apply with --fix. Judgment calls carry none. */
  fix?: { addTags?: string[]; removeTags?: string[] };
};

export function lintRecipe(r: LintInput): LintFinding[] {
  const out: LintFinding[] = [];
  const tags = r.tags ?? [];
  if (r.source === "Reference") {
    return [{ code: "reference-row", message: "Source=Reference: not a recipe, the sync drops it" }];
  }
  if (!r.meal_type) out.push({ code: "no-meal-type", message: "no Meal Type (Breakfast / Lunch / Dinner / Snack / Dessert / Side)" });
  if (!r.cuisine) out.push({ code: "no-cuisine", message: "no Cuisine" });
  if (r.meal_type === "Side" && !tags.includes(SIDE_DISH_TAG)) {
    out.push({
      code: "side-without-tag",
      message: `Meal Type is Side but the "${SIDE_DISH_TAG}" tag is missing`,
      fix: { addTags: [SIDE_DISH_TAG] },
    });
  }
  const total = (r.prep_min ?? 0) + (r.cook_min ?? 0);
  if (tags.includes("Quick") && total > QUICK_MAX_MIN) {
    out.push({
      code: "quick-too-long",
      message: `tagged Quick but prep + cook is ${total} min (Quick means ${QUICK_MAX_MIN} or under)`,
      fix: { removeTags: ["Quick"] },
    });
  }
  if (tags.includes("Vegan") && !tags.includes("Vegetarian")) {
    out.push({
      code: "vegan-not-vegetarian",
      message: "Vegan without Vegetarian (a vegan dish is vegetarian too)",
      fix: { addTags: ["Vegetarian"] },
    });
  }
  if (tags.length === 0) out.push({ code: "no-tags", message: "no tags at all" });
  return out;
}

/** "Title: finding · finding" for a sync response or a report; null when clean. */
export function formatFindings(title: string, findings: LintFinding[]): string | null {
  if (findings.length === 0) return null;
  return `${title}: ${findings.map((f) => f.message).join(" · ")}`;
}
