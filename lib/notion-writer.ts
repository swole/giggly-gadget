// RecipeDraft → Notion page payload. Built from the structured draft (not free
// markdown) so the body always matches the sync parser's contract:
//   ## Ingredients (bulleted) → ## Instructions (numbered) → ## Notes (paragraphs)
// blocksToMarkdown() round-trips these block types back into exactly that.

import type { RecipeDraft } from "./recipe-draft";

// Minimal block types we emit (kept local so we do not depend on @notionhq/client's
// large union types in tests).
export type RichText = { type: "text"; text: { content: string }; annotations?: { bold?: boolean; italic?: boolean } };
export type Block =
  | { object: "block"; type: "heading_2"; heading_2: { rich_text: RichText[] } }
  | { object: "block"; type: "paragraph"; paragraph: { rich_text: RichText[] } }
  | { object: "block"; type: "bulleted_list_item"; bulleted_list_item: { rich_text: RichText[] } }
  | { object: "block"; type: "numbered_list_item"; numbered_list_item: { rich_text: RichText[] } };

const MAX_RT = 2000; // Notion rich_text content limit per object

/** Split long text into ≤2000-char rich_text objects; map **bold** and _italic_ to annotations. */
export function toRichText(s: string): RichText[] {
  const out: RichText[] = [];
  const pieces = s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter((p) => p.length > 0);
  for (const p of pieces) {
    let content = p;
    let annotations: RichText["annotations"] | undefined;
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      content = p.slice(2, -2);
      annotations = { bold: true };
    } else if (/^_[^_]+_$/.test(p) && p.length > 2) {
      content = p.slice(1, -1);
      annotations = { italic: true };
    }
    for (let i = 0; i < content.length; i += MAX_RT) {
      const chunk = content.slice(i, i + MAX_RT);
      out.push(annotations ? { type: "text", text: { content: chunk }, annotations } : { type: "text", text: { content: chunk } });
    }
  }
  return out.length > 0 ? out : [{ type: "text", text: { content: "" } }];
}

const h2 = (t: string): Block => ({ object: "block", type: "heading_2", heading_2: { rich_text: toRichText(t) } });
const para = (t: string): Block => ({ object: "block", type: "paragraph", paragraph: { rich_text: toRichText(t) } });
const bullet = (t: string): Block => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: toRichText(t) } });
const numbered = (t: string): Block => ({ object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: toRichText(t) } });

export function draftToBlocks(d: RecipeDraft): Block[] {
  const blocks: Block[] = [];
  if (d.intro && d.intro.trim()) blocks.push(para(d.intro.trim()));
  blocks.push(h2("Ingredients"));
  for (const line of d.ingredients) blocks.push(bullet(line.trim()));
  blocks.push(h2("Instructions"));
  for (const step of d.steps) blocks.push(numbered(step.trim()));
  if (d.notes && d.notes.trim()) {
    blocks.push(h2("Notes"));
    for (const p of d.notes.trim().split(/\n{2,}/)) blocks.push(para(p.trim()));
  }
  return blocks;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type NotionProperties = Record<string, unknown>;

/** Who brought the recipe in — mirrors the Notion `Source` select (Reference rows are never created by the app). */
export type RecipeSource = "Claude" | "Johnny" | "Lydia";
export const RECIPE_SOURCES: readonly RecipeSource[] = ["Claude", "Johnny", "Lydia"];

export function draftToProperties(
  d: RecipeDraft,
  opts: { source: RecipeSource; wantToTry: boolean },
): NotionProperties {
  return {
    Title: { title: [{ text: { content: d.title } }] },
    Cuisine: { select: { name: d.cuisine } },
    "Meal Type": { select: { name: d.meal_type } },
    Difficulty: { select: { name: d.difficulty } },
    "Prep Time": { number: d.prep_min },
    "Cook Time": { number: d.cook_min },
    Servings: { number: d.servings },
    Tags: { multi_select: d.tags.map((name) => ({ name })) },
    "Source URL": { url: d.source_url ?? null },
    Source: { select: { name: opts.source } },
    Area: { select: { name: "Personal" } },
    "Want to Try": { checkbox: opts.wantToTry },
  };
}
