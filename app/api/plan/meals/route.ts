import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentWeekMonday, isValidYmd, weekMondayOf } from "@/lib/week";
import { parseSlot, type NewPlannedMeal } from "@/lib/plan/types";
import { parseEaters } from "@/lib/portions";
import { getPlannedMealsForWeek } from "@/lib/plan/queries";
import { roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";
import { scheduleGroceryRebuild } from "@/lib/grocery/auto-build";

export const runtime = "nodejs";

/** GET /api/plan/meals?week=YYYY-MM-DD  → { week_of, meals } */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("week");
  const weekOf = isValidYmd(q) ? weekMondayOf(q) : currentWeekMonday();
  const meals = await getPlannedMealsForWeek(weekOf);
  return NextResponse.json({ week_of: weekOf, meals });
}

/** POST /api/plan/meals  { planned_for, slot, recipe_id | custom_text, eaters?, note?, leftover_of? } → { meal }
 *  recipe_id plans a recipe; custom_text plans a one-off ("White rice") with no recipe behind it. */
export async function POST(req: NextRequest) {
  let body: Partial<NewPlannedMeal>;
  try {
    body = (await req.json()) as Partial<NewPlannedMeal>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const slot = parseSlot(body.slot);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const customText = typeof body.custom_text === "string" ? body.custom_text.trim() : null;
  const hasRecipe = typeof body.recipe_id === "string" && UUID.test(body.recipe_id);
  if (!isValidYmd(body.planned_for) || !slot || (!hasRecipe && !customText) || (hasRecipe && customText)) {
    return NextResponse.json({ error: "planned_for, slot and exactly one of recipe_id / custom_text are required" }, { status: 400 });
  }
  if (customText && customText.length > 80) {
    return NextResponse.json({ error: "custom_text must be 80 characters or fewer" }, { status: 400 });
  }
  if (customText && body.leftover_of != null) {
    return NextResponse.json({ error: "a one-off item cannot be leftovers" }, { status: 400 });
  }
  if (body.eaters !== undefined && body.eaters !== null && !parseEaters(body.eaters)) {
    return NextResponse.json({ error: "bad eaters" }, { status: 400 });
  }
  if (body.note !== undefined && body.note !== null && (typeof body.note !== "string" || body.note.length > 240)) {
    return NextResponse.json({ error: "note must be text up to 240 characters" }, { status: 400 });
  }
  if (body.leftover_of !== undefined && body.leftover_of !== null && !(Number.isInteger(body.leftover_of) && Number(body.leftover_of) > 0)) {
    return NextResponse.json({ error: "bad leftover_of" }, { status: 400 });
  }
  const eaters = parseEaters(body.eaters ?? "both") ?? "both";

  const supa = supabaseAdmin();

  // next position in this day+slot
  const { data: last } = await supa
    .from("planned_meals")
    .select("position")
    .eq("planned_for", body.planned_for)
    .eq("slot", slot)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supa
    .from("planned_meals")
    .insert({
      planned_for: body.planned_for,
      slot,
      recipe_id: hasRecipe ? body.recipe_id : null,
      custom_text: customText,
      eaters,
      position,
      note: body.note ?? null,
      leftover_of: body.leftover_of ?? null,
      added_by: labelFor(roleFromRequest(req)),
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation: same recipe already in this day+slot
    if (error.code === "23505") {
      const { data: existing } = await supa
        .from("planned_meals")
        .select("*")
        .eq("planned_for", body.planned_for)
        .eq("slot", slot)
        .eq("recipe_id", body.recipe_id)
        .maybeSingle();
      return NextResponse.json({ error: "duplicate", meal: existing }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!body.leftover_of) scheduleGroceryRebuild(weekMondayOf(body.planned_for));
  return NextResponse.json({ meal: data });
}
