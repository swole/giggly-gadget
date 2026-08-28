import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentWeekMonday, isValidYmd, weekMondayOf } from "@/lib/week";
import { shopFor } from "@/lib/grocery/shop";
import { isStaple } from "@/lib/grocery/staples";
import { eatersFactor, parseEaters } from "@/lib/portions";
import { roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";

export const runtime = "nodejs";

type Body = {
  recipe_id: string;
  scale_factor: number;
  /** Household mode: per-category split (see lib/portions.ts) overrides scale_factor. */
  eaters?: string | null;
  /** Week to shop into (defaults to the current week); the kitchen passes the planned meal's week. */
  week_of?: string | null;
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
  const week = typeof body.week_of === "string" && isValidYmd(body.week_of) ? weekMondayOf(body.week_of) : currentWeekMonday();
  const eaters = parseEaters(body.eaters);
  const { data: stapleRows } = await supa.from("pantry_staples").select("name");
  const staples = new Set<string>((stapleRows ?? []).map((r) => String(r.name)));
  const addedBy = labelFor(roleFromRequest(req));

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

    const f = eaters ? eatersFactor(eaters, ing.category) : body.scale_factor;
    const scaledMin = (ing.qty_min ?? 0) * f;
    const scaledMax = ing.qty_max !== null ? (ing.qty_max as number) * f : null;

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
        source: "manual", // the planner never touches what it did not create
        added_by: addedBy,
        shop: shopFor(ing.name, ing.category),
        staple: isStaple(ing.name, staples),
      });
      if (!insErr) added++;
    }
  }

  return NextResponse.json({ ok: true, added, merged, week });
}
