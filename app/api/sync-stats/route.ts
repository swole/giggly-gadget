import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supa = supabaseAdmin();

  const [
    { count: recipeCount },
    { count: ingCount },
    { count: scalableCount },
    { count: toTasteCount },
    { count: parseIssuesCount },
  ] = await Promise.all([
    supa.from("recipes").select("*", { count: "exact", head: true }),
    supa.from("ingredients_parsed").select("*", { count: "exact", head: true }),
    supa.from("ingredients_parsed").select("*", { count: "exact", head: true }).eq("scalable", true),
    supa.from("ingredients_parsed").select("*", { count: "exact", head: true }).eq("to_taste", true),
    supa.from("parse_issues").select("*", { count: "exact", head: true }),
  ]);

  const { data: ingredients } = await supa
    .from("ingredients_parsed")
    .select("recipe_id, category");
  const recipesWithIng = new Set((ingredients ?? []).map((i) => i.recipe_id));

  const { data: allRecipes } = await supa.from("recipes").select("id, title");
  const emptyRecipes = (allRecipes ?? [])
    .filter((r) => !recipesWithIng.has(r.id))
    .map((r) => r.title);

  const catCounts: Record<string, number> = {};
  for (const i of ingredients ?? []) {
    const k = i.category ?? "null";
    catCounts[k] = (catCounts[k] ?? 0) + 1;
  }

  const { data: issues } = await supa
    .from("parse_issues")
    .select("raw, reason")
    .limit(30);

  return NextResponse.json({
    recipes: recipeCount,
    ingredient_lines: ingCount,
    scalable: scalableCount,
    to_taste: toTasteCount,
    parse_issues: parseIssuesCount,
    parse_rate_pct: ingCount ? Number((((scalableCount ?? 0) / ingCount) * 100).toFixed(1)) : 0,
    empty_recipes: emptyRecipes,
    category_distribution: Object.fromEntries(
      Object.entries(catCounts).sort((a, b) => b[1] - a[1])
    ),
    sample_parse_issues: issues,
  });
}
