import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentWeekMonday, isValidYmd, weekMondayOf } from "@/lib/week";
import { categorize } from "@/lib/ingredients/categorize";
import { shopFor } from "@/lib/grocery/shop";
import { roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";

export const runtime = "nodejs";

/** POST /api/grocery/manual { name, qty?, unit?, week_of? } → { row }. A free-text item anyone can add. */
export async function POST(req: NextRequest) {
  let body: { name?: string; qty?: number | null; unit?: string | null; week_of?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const weekOf = isValidYmd(body.week_of) ? weekMondayOf(body.week_of) : currentWeekMonday();
  const unit = body.unit?.trim() || null;
  const qty = typeof body.qty === "number" && Number.isFinite(body.qty) ? body.qty : null;
  const category = categorize(name);

  const supa = supabaseAdmin();
  // Same (name, unit) already on the list this week → bump it instead of duplicating.
  let q = supa.from("grocery_list").select("*").eq("week_of", weekOf).ilike("name", name.replace(/[%_\\]/g, "\\$&")).limit(1);
  q = unit === null ? q.is("unit", null) : q.eq("unit", unit);
  const { data: existingRows } = await q;
  const existing = existingRows?.[0] ?? null;
  if (existing) {
    const { data, error } = await supa
      .from("grocery_list")
      .update({
        qty_min: qty === null ? existing.qty_min : Number(existing.qty_min ?? 0) + qty,
        checked: false,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data, merged: true });
  }

  const { data, error } = await supa
    .from("grocery_list")
    .insert({
      week_of: weekOf,
      name,
      qty_min: qty,
      qty_max: null,
      unit,
      category,
      recipe_ids: [],
      source: "manual",
      shop: shopFor(name, category),
      staple: false,
      added_by: labelFor(roleFromRequest(req)),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data, merged: false });
}
