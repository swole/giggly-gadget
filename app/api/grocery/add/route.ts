import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentWeekMonday } from "@/lib/week";

export const runtime = "nodejs";

type Body = {
  recipe_id: string;
  scale_factor: number;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.recipe_id || typeof body.scale_factor !== "number") {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const week = currentWeekMonday();

  // 1. Load this recipe's parsed ingredients
  const { data: ings, error: ingErr } = await supa
    .from("ingredients_parsed")
    .select("*")
    .eq("recipe_id", body.recipe_id);
  if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 });

  let added = 0;
  let merged = 0;

  for (const ing of ings ?? []) {
    if (!ing.scalable || ing.to_taste) continue;
    if (!ing.name) continue;

    const scaledMin = (ing.qty_min ?? 0) * body.scale_factor;
    const scaledMax =
      ing.qty_max !== null ? (ing.qty_max as number) * body.scale_factor : null;

    // Look for an existing row for (week, name, unit)
    let existingQuery = supa
      .from("grocery_list")
      .select("*")
      .eq("week_of", week)
      .eq("name", ing.name);
    existingQuery = ing.unit === null
      ? existingQuery.is("unit", null)
      : existingQuery.eq("unit", ing.unit);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      const newRecipeIds = Array.from(
        new Set([...(existing.recipe_ids ?? []), body.recipe_id])
      );
      const newMin = (Number(existing.qty_min) || 0) + scaledMin;
      const newMax =
        existing.qty_max !== null && scaledMax !== null
          ? Number(existing.qty_max) + scaledMax
          : null;
      const { error: updErr } = await supa
        .from("grocery_list")
        .update({
          qty_min: newMin,
          qty_max: newMax,
          recipe_ids: newRecipeIds,
          checked: false, // reset check when qty changes
        })
        .eq("id", existing.id);
      if (!updErr) merged++;
    } else {
      const { error: insErr } = await supa.from("grocery_list").insert({
        week_of: week,
        name: ing.name,
        qty_min: scaledMin,
        qty_max: scaledMax,
        unit: ing.unit,
        category: ing.category,
        recipe_ids: [body.recipe_id],
      });
      if (!insErr) added++;
    }
  }

  return NextResponse.json({ ok: true, added, merged, week });
}
