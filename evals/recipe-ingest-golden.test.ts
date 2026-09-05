/**
 * Golden run for the `recipe-ingest` Claude skill (9. Claude/skills/recipe-ingest).
 *
 * The skill turns a messy Inbox recipe into a Notion page the sync can parse. Its known
 * failure modes are all mechanical (name-first lines, `block` as a unit, parentheticals,
 * un-purchasable names, tag rules), so they are checked with the app's own parser and
 * tag lint rather than by eye. Skipped unless GOLDEN_ACTUAL points at the JSON the skill
 * produced in eval mode: { properties: {title, meal_type, cuisine, difficulty, prep_min,
 * cook_min, servings, tags: string[], source, want_to_try}, body: "<markdown>" }.
 *
 * Run:  GOLDEN_ACTUAL=/abs/path/actual.json npx jest evals   (see evals/recipe-ingest/)
 */
import fs from "node:fs";
import path from "node:path";
import { parseIngredients, type ParsedIngredient } from "@/lib/ingredients/parse";
import { lintRecipe } from "@/lib/tag-lint";

const actualPath = process.env.GOLDEN_ACTUAL;

type Expected = {
  properties: Record<string, string | number>;
  required_tags: string[];
  forbidden_tags: string[];
  ingredient_count: number;
  ingredients: Array<{ name?: string; name_includes?: string; unit?: string | null; qty_min?: number; qty_max?: number; to_taste?: boolean; scalable?: boolean }>;
  forbidden_names: string[];
};
type Actual = { properties: Record<string, unknown> & { tags: string[] }; body: string };

// Jest still executes a describe.skip body at collection time, so the file reads must sit
// behind a real branch or an unset GOLDEN_ACTUAL crashes the suite instead of skipping it.
if (!actualPath) {
  test.skip("recipe-ingest golden run (set GOLDEN_ACTUAL=<actual.json> to run)", () => {});
} else describe("recipe-ingest golden run", () => {
  const expected: Expected = JSON.parse(fs.readFileSync(path.join(__dirname, "recipe-ingest", "expected.json"), "utf8"));
  const actual: Actual = JSON.parse(fs.readFileSync(actualPath as string, "utf8"));
  const parsed: ParsedIngredient[] = parseIngredients(actual.body);
  const names = parsed.map((p) => p.name.toLowerCase());

  test("mapped properties match (meal type, cuisine, difficulty, times, servings, source)", () => {
    for (const [k, v] of Object.entries(expected.properties)) expect([k, actual.properties[k]]).toEqual([k, v]);
  });

  test("tag rules: required present, forbidden absent, cap 5", () => {
    const tags = actual.properties.tags;
    for (const t of expected.required_tags) expect(tags).toContain(t);
    for (const t of expected.forbidden_tags) expect(tags).not.toContain(t);
    expect(tags.length).toBeLessThanOrEqual(5);
  });

  test("tag lint is clean", () => {
    const p = actual.properties;
    const findings = lintRecipe({
      title: String(p.title ?? ""),
      meal_type: (p.meal_type as string) ?? null,
      cuisine: (p.cuisine as string) ?? null,
      tags: p.tags ?? null,
      prep_min: (p.prep_min as number) ?? null,
      cook_min: (p.cook_min as number) ?? null,
      source: (p.source as string) ?? null,
    });
    expect(findings).toEqual([]);
  });

  test("body carries the two headers the sync needs", () => {
    expect(actual.body).toMatch(/^##\s*Ingredients\s*$/m);
    expect(actual.body).toMatch(/^##\s*(Instructions|Method|Steps|Directions)\b/m);
  });

  test("every ingredient line parses as scalable (or to-taste), and the count is right", () => {
    expect(parsed.map((p) => p.raw)).toHaveLength(expected.ingredient_count);
    for (const p of parsed) expect([p.raw, p.scalable || p.to_taste]).toEqual([p.raw, true]);
  });

  test("names are purchasable things in the strict grammar", () => {
    for (const e of expected.ingredients) {
      const hit = e.name
        ? parsed.find((p) => p.name.toLowerCase() === e.name)
        : parsed.find((p) => p.name.toLowerCase().includes(e.name_includes as string));
      expect([e.name ?? e.name_includes, hit?.raw]).toEqual([e.name ?? e.name_includes, hit?.raw]);
      expect(hit).toBeDefined();
      if (!hit) continue;
      if (e.unit !== undefined) expect([hit.raw, hit.unit]).toEqual([hit.raw, e.unit]);
      if (e.qty_min !== undefined) expect([hit.raw, hit.qty_min]).toEqual([hit.raw, e.qty_min]);
      if (e.qty_max !== undefined) expect([hit.raw, hit.qty_max]).toEqual([hit.raw, e.qty_max]);
      if (e.to_taste) expect([hit.raw, hit.to_taste]).toEqual([hit.raw, true]);
      if (e.scalable) expect([hit.raw, hit.scalable]).toEqual([hit.raw, true]);
    }
  });

  test("no garbage names (block tofu, grated ginger, cloves garlic, bracket residue)", () => {
    for (const bad of expected.forbidden_names) expect(names).not.toContain(bad);
  });
});
