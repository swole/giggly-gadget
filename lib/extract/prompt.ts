// Prompt for turning a web page / pasted text / photo into a RecipeDraft.
// The ingredient grammar here MUST match lib/ingredients/parse.ts, because the sync
// parses these lines into grocery-list rows.

import type { RecipeJsonLd } from "./fetch-page";
import { flattenInstructions, isoDurationToMinutes } from "./fetch-page";
import { CUISINES, DIFFICULTIES, MEAL_TYPES, TAGS } from "@/lib/recipe-draft";

export const SYSTEM_PROMPT = `You turn recipes into a strict structured format for a home-cooking app used by a household in Singapore (a couple plus a live-in helper who cooks). Be faithful to the source; do not invent ingredients or steps. Keep the dish's own character. When information is missing, use null rather than guessing.

INGREDIENT LINE GRAMMAR (non-negotiable — a parser reads these):
  "<qty>[-<qty>] [<unit>] <name>[, <modifier>]"
  - qty: a number (use decimals or unicode fractions: 0.5, ½, 1.5, 1-2 for ranges). Put the quantity FIRST.
  - unit (optional), only from: g kg ml l tbsp tsp cup oz lb clove can jar bottle slice piece bunch sprig stalk pinch dash handful. Prefer metric (g/ml) when the source gives it or it is obvious. Never invent a unit: "2 eggs" has no unit. Use "piece" for thumbs of ginger, "bunch" for herbs, "handful" for loose leaves.
  - name: the purchasable thing, lower-case, singular where natural ("egg", "spring onion", "firm tofu"). The name is everything before the FIRST comma, so keep it short and do not put notes in it.
  - modifier: after a comma — prep or notes ("diced", "for the sauce", "skin on"). Split "juice of 2 lemons" into "2 lemon, juiced". Split compound lines ("garlic and ginger") into separate lines.
  - Seasonings without a real amount: write "<name>, to taste" (this marks them unscalable). Derived liquids (stock from soaking, marinade) are written without a leading number so they are not shopped for.
  - Do NOT use parentheses for notes; the parser strips them. Use the comma modifier.
  Examples: "415 g soft tofu, 2 cm cubes" · "1-2 red chilli, chopped fine" · "4 clove garlic" · "1 piece ginger, a thumb" · "½ cucumber" · "2 tsp light soy, measured" · "white pepper, to taste"

STEPS: imperative, one action group per step, keep the source's order and timings. Drop serving suggestions that are not steps.

FIELDS: cuisine ∈ [${CUISINES.join(", ")}]; meal_type ∈ [${MEAL_TYPES.join(", ")}]; difficulty ∈ [${DIFFICULTIES.join(", ")}]; tags (0-4) from [${TAGS.join(", ")}] — "Heart Healthy" only when the dish is plant-or-fish forward, low in saturated fat and not deep-fried; "Quick" when total time ≤ 30 min; "Vegan"/"Vegetarian" only when strictly true. prep_min / cook_min as integers or null. servings as the source states or null. title in Title Case without the site name. emoji: one fitting emoji.`;

export function buildUserText(input: {
  kind: "url" | "text";
  url?: string;
  title?: string | null;
  jsonld?: RecipeJsonLd | null;
  text: string;
}): string {
  const parts: string[] = [];
  if (input.kind === "url") parts.push(`Source URL: ${input.url}`);
  if (input.title) parts.push(`Page title: ${input.title}`);
  if (input.jsonld) {
    const j = input.jsonld;
    const steps = flattenInstructions(j.recipeInstructions);
    parts.push(
      "STRUCTURED DATA FOUND ON THE PAGE (schema.org/Recipe) — prefer this over the page text when they disagree:",
      `name: ${j.name ?? ""}`,
      j.description ? `description: ${j.description}` : "",
      `prepTime: ${j.prepTime ?? ""} (${isoDurationToMinutes(j.prepTime) ?? "?"} min) · cookTime: ${j.cookTime ?? ""} (${isoDurationToMinutes(j.cookTime) ?? "?"} min) · yield: ${JSON.stringify(j.recipeYield ?? null)}`,
      `cuisine: ${JSON.stringify(j.recipeCuisine ?? null)} · category: ${JSON.stringify(j.recipeCategory ?? null)} · keywords: ${JSON.stringify(j.keywords ?? null)}`,
      "ingredients:",
      ...(j.recipeIngredient ?? []).map((l) => `  - ${l}`),
      "instructions:",
      ...steps.map((s, i) => `  ${i + 1}. ${s}`),
    );
  }
  parts.push(
    input.jsonld ? "PAGE TEXT (for anything the structured data is missing):" : "RECIPE TEXT:",
    input.text,
  );
  return parts.filter((p) => p !== "").join("\n");
}

export const IMAGE_INSTRUCTION =
  "This photo shows a recipe (a cookbook page, a screenshot, or handwriting). Read it carefully and transcribe it into the structured format. If a quantity is unreadable, use your best reading and note it in the modifier.";

/** A cooking video: reconstruct the recipe from description / caption / transcript. */
export function buildVideoText(v: {
  platform: "youtube" | "tiktok";
  url: string;
  title: string | null;
  author: string | null;
  description: string | null;
  transcript: string | null;
  duration_s: number | null;
  linked_recipe?: { url: string; title: string | null; jsonld: RecipeJsonLd } | null;
}): string {
  const parts: string[] = [
    `This is a cooking VIDEO on ${v.platform === "youtube" ? "YouTube" : "TikTok"}. Reconstruct the recipe the video teaches.`,
    `Source URL: ${v.url}`,
    v.title ? `Video title: ${v.title}` : "",
    v.author ? `Channel / creator: ${v.author}` : "",
    v.duration_s ? `Length: ${Math.round(v.duration_s / 60)} min` : "",
    "",
    "HOW TO READ IT:",
    "- The description/caption often holds the real ingredient list and amounts; trust it first. The transcript (auto-captions) gives the method, order, timings and any amounts said aloud; spelling of ingredients in auto-captions can be wrong — fix obvious mishearings.",
    "- Ignore sponsor reads, channel promos, hashtags, links, music credits, merch, and chapters timestamps.",
    "- If an amount is never stated anywhere, estimate a sensible home-cook amount for the servings shown and list every estimated ingredient by name in `notes` as \"Estimated from the video: …\". Never leave a shoppable ingredient without a leading quantity.",
    "- If there is clearly more than one recipe in the video, pick the main one named in the title and say so in `notes`.",
    "- title: the dish itself, not the video title (\"Mapo Tofu\", not \"THE BEST Mapo Tofu You'll Ever Make!!\"). intro: one sentence on the dish; mention the creator by name.",
    "- Put the short creator credit in notes too, e.g. \"From <creator> on YouTube\".",
    "",
  ];
  if (v.linked_recipe) {
    const j = v.linked_recipe.jsonld;
    const steps = flattenInstructions(j.recipeInstructions);
    parts.push(
      `THE DESCRIPTION LINKS TO THE WRITTEN RECIPE (${v.linked_recipe.url}) — schema.org/Recipe data from that page. Treat it as the authoritative ingredient list and method; use the video text only to fill gaps:`,
      `name: ${j.name ?? ""}`,
      j.description ? `description: ${j.description}` : "",
      `prepTime: ${j.prepTime ?? ""} (${isoDurationToMinutes(j.prepTime) ?? "?"} min) · cookTime: ${j.cookTime ?? ""} (${isoDurationToMinutes(j.cookTime) ?? "?"} min) · yield: ${JSON.stringify(j.recipeYield ?? null)}`,
      "ingredients:",
      ...(j.recipeIngredient ?? []).map((l) => `  - ${l}`),
      "instructions:",
      ...steps.map((s, i) => `  ${i + 1}. ${s}`),
      "",
    );
  }
  if (v.description) parts.push("DESCRIPTION / CAPTION:", v.description, "");
  else parts.push("DESCRIPTION / CAPTION: (none available)", "");
  if (v.transcript) parts.push("TRANSCRIPT (auto-captions, no punctuation):", v.transcript);
  else parts.push("TRANSCRIPT: (not available — work from the description and your knowledge of the dish; mark estimates in notes)");
  return parts.filter((p) => p !== "").join("\n");
}
