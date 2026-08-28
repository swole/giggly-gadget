import { chunk, draftToBlocks, draftToProperties, toRichText } from "./notion-writer";
import type { RecipeDraft } from "./recipe-draft";
import { blocksToMarkdown } from "./notion-blocks";
import { parseIngredients } from "./ingredients/parse";
import { extractMethodSteps } from "./recipes";

const draft: RecipeDraft = {
  title: "Steamed Tofu with Prawns",
  emoji: "🧄",
  cuisine: "Chinese",
  meal_type: "Dinner",
  difficulty: "Easy",
  prep_min: 10,
  cook_min: 12,
  servings: 2,
  tags: ["Heart Healthy", "Quick"],
  intro: "Cantonese garlic-steamed tofu.",
  ingredients: ["415 g soft tofu", "165 g raw prawn, minced", "1 garlic, a whole head, chopped very fine", "white pepper, to taste"],
  steps: ["Slice the tofu into slabs.", "Top with prawn and garlic. Steam 10 minutes.", "Pour the sauce over and serve."],
  notes: "Soft tofu is low in protein, so the prawn weight is what makes this work.\n\n**Watch:** a whole head of garlic is the point.",
  source_url: null,
};

describe("toRichText", () => {
  test("plain text is one object", () => {
    expect(toRichText("hello")).toEqual([{ type: "text", text: { content: "hello" } }]);
  });
  test("bold and italic become annotations", () => {
    const rt = toRichText("a **bold** and _it_ end");
    expect(rt.map((r) => r.text.content)).toEqual(["a ", "bold", " and ", "it", " end"]);
    expect(rt[1].annotations).toEqual({ bold: true });
    expect(rt[3].annotations).toEqual({ italic: true });
  });
  test("splits at 2000 chars", () => {
    const rt = toRichText("x".repeat(4500));
    expect(rt.map((r) => r.text.content.length)).toEqual([2000, 2000, 500]);
  });
});

describe("draftToBlocks", () => {
  const blocks = draftToBlocks(draft);
  test("order: intro, Ingredients h2, bullets, Instructions h2, numbered, Notes h2, paragraphs", () => {
    expect(blocks.map((b) => b.type)).toEqual([
      "paragraph",
      "heading_2",
      "bulleted_list_item", "bulleted_list_item", "bulleted_list_item", "bulleted_list_item",
      "heading_2",
      "numbered_list_item", "numbered_list_item", "numbered_list_item",
      "heading_2",
      "paragraph", "paragraph",
    ]);
  });
  test("round-trips through the sync's markdown + parsers", () => {
    // The sync reads Notion blocks → markdown → parseIngredients / extractMethodSteps.
    // Our writer must produce blocks those functions understand.
    // Notion returns rich_text with plain_text; our request shape carries text.content.
    const asResponse = blocks.map((b) => {
      const t = b.type as string;
      const data = (b as unknown as Record<string, { rich_text: { text: { content: string }; annotations?: unknown }[] }>)[t];
      return {
        id: "x",
        type: t,
        [t]: { rich_text: data.rich_text.map((r) => ({ plain_text: r.text.content, annotations: r.annotations })) },
      };
    });
    const md = blocksToMarkdown(asResponse as unknown as Parameters<typeof blocksToMarkdown>[0]);
    const ings = parseIngredients(md);
    expect(ings.map((i) => i.name)).toEqual(["soft tofu", "raw prawn", "garlic", "white pepper"]);
    expect(ings.filter((i) => i.scalable)).toHaveLength(3);
    expect(ings[3].to_taste).toBe(true);
    const steps = extractMethodSteps(md);
    expect(steps).toHaveLength(3);
    expect(steps[1]).toMatch(/Steam 10 minutes/);
  });
});

describe("draftToProperties / chunk", () => {
  test("maps every Notion property with exact names", () => {
    const p = draftToProperties(draft, { source: "Claude", wantToTry: true }) as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(
      ["Area", "Cook Time", "Cuisine", "Difficulty", "Meal Type", "Prep Time", "Servings", "Source", "Source URL", "Tags", "Title", "Want to Try"].sort(),
    );
    expect(p.Tags).toEqual({ multi_select: [{ name: "Heart Healthy" }, { name: "Quick" }] });
    expect(p.Source).toEqual({ select: { name: "Claude" } });
    expect(p.Area).toEqual({ select: { name: "Personal" } });
    expect(p["Want to Try"]).toEqual({ checkbox: true });
    expect(p["Source URL"]).toEqual({ url: null });
  });
  test("chunk by 100", () => {
    expect(chunk(Array.from({ length: 250 }, (_, i) => i), 100).map((c) => c.length)).toEqual([100, 100, 50]);
  });
});
