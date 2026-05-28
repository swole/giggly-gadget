import { supabaseAdmin } from "./supabase/server";

export type Recipe = {
  id: string;
  title: string;
  cuisine: string | null;
  meal_type: string | null;
  difficulty: string | null;
  prep_min: number | null;
  cook_min: number | null;
  servings: number | null;
  rating: number | null;
  tags: string[];
  source_url: string | null;
  notes: string | null;
  last_made: string | null;
  want_to_try: boolean;
  image_url: string | null;
  instructions_md?: string | null;
};

export async function listRecipes(): Promise<Recipe[]> {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("recipes")
    .select("*")
    .order("title");
  if (error) throw error;
  return (data ?? []).map(withImageDefault) as Recipe[];
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? (withImageDefault(data) as Recipe) : null;
}

// Tolerates pre- and post-0002 schemas: image_url is null when the column doesn't exist yet.
function withImageDefault(row: Record<string, unknown>): Record<string, unknown> {
  if (!("image_url" in row)) return { ...row, image_url: null };
  return row;
}

export type ParsedIngredientRow = {
  recipe_id: string;
  line_index: number;
  raw: string;
  qty_min: number | null;
  qty_max: number | null;
  unit: string | null;
  name: string | null;
  modifier: string | null;
  optional: boolean;
  to_taste: boolean;
  scalable: boolean;
  category: string | null;
};

export async function getRecipeIngredients(id: string): Promise<ParsedIngredientRow[]> {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("ingredients_parsed")
    .select("*")
    .eq("recipe_id", id)
    .order("line_index");
  if (error) throw error;
  return (data ?? []) as ParsedIngredientRow[];
}

export function totalMinutes(r: Pick<Recipe, "prep_min" | "cook_min">): number | null {
  const a = r.prep_min ?? 0;
  const b = r.cook_min ?? 0;
  if (a === 0 && b === 0) return null;
  return a + b;
}

// Extract just the instructions/method section from the recipe markdown body.
// Returns lines as an array of step strings (numbered list items, paragraphs).
export function extractMethodSteps(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const instHeader =
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:👩‍🍳\s*|👨‍🍳\s*)?(?:instructions|method|directions|steps)\b[^\n]*\n/i;
  const m = markdown.match(instHeader);
  if (!m || m.index === undefined) return [];
  const after = markdown.slice(m.index + m[0].length);

  // Stop at the next major section header (Notes, Tips, etc.)
  const nextSection = /(?:^|\n)\s*(?:#{1,6}\s+)(?:notes?|tips?|variations?|storage|serving)/i;
  const endMatch = after.match(nextSection);
  const block = endMatch && endMatch.index !== undefined
    ? after.slice(0, endMatch.index)
    : after;

  // Split by numbered list items or blank-line separated paragraphs
  const numbered = block.match(/^\s*\d+\.\s+.+$(?:\n(?!\s*\d+\.\s|\s*#)\s*.+$)*/gm);
  if (numbered && numbered.length > 0) {
    return numbered.map((s) => s.replace(/^\s*\d+\.\s+/, "").trim()).filter(Boolean);
  }

  // Fallback: split on blank lines
  return block
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}
