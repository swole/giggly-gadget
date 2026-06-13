import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseIngredients } from "@/lib/ingredients/parse";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = url.searchParams.get("title");
  if (!title) return NextResponse.json({ error: "?title=... required" }, { status: 400 });

  const supa = supabaseAdmin();
  const { data: recipe } = await supa
    .from("recipes")
    .select("id, title, instructions_md")
    .ilike("title", `%${title}%`)
    .limit(1)
    .maybeSingle();

  if (!recipe) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = parseIngredients(recipe.instructions_md || "");

  // Check what's actually in DB
  const { data: dbRows, error: dbErr } = await supa
    .from("ingredients_parsed")
    .select("*")
    .eq("recipe_id", recipe.id);

  // Try inserting fresh
  let insertResult: { ok: boolean; error?: string; inserted?: number } = { ok: true };
  if (parsed.length > 0) {
    await supa.from("ingredients_parsed").delete().eq("recipe_id", recipe.id);
    const rows = parsed.map((p, i) => ({
      recipe_id: recipe.id,
      line_index: i,
      raw: p.raw,
      qty_min: p.qty_min,
      qty_max: p.qty_max,
      unit: p.unit,
      name: p.name,
      modifier: p.modifier,
      optional: p.optional,
      to_taste: p.to_taste,
      scalable: p.scalable,
      category: p.category,
    }));
    const { error: insErr } = await supa.from("ingredients_parsed").insert(rows);
    insertResult = insErr
      ? { ok: false, error: insErr.message }
      : { ok: true, inserted: rows.length };
  }

  return NextResponse.json({
    title: recipe.title,
    recipe_id: recipe.id,
    parser_count: parsed.length,
    db_count_before: dbRows?.length ?? 0,
    db_query_error: dbErr?.message ?? null,
    insert_attempt: insertResult,
    sample_row: parsed[0] ?? null,
  });
}
