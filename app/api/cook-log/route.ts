import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todayInTz } from "@/lib/week";
import { roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";

export const runtime = "nodejs";

type Body = {
  recipe_id: string;
  planned_meal_id?: number | null;
  cooked_by?: string | null;
  servings?: number | null;
  rating?: number | null;
  notes?: string | null;
  /** true = un-mark: remove the latest cook for this recipe, clear the planned meal, recompute last_made */
  undo?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const plannedMealId = Number.isInteger(body.planned_meal_id) ? Number(body.planned_meal_id) : null;
  // One-off plan items ("White rice") have no recipe: only the planned meal's cooked
  // stamp applies — no cook_log row, no last_made.
  if (!body.recipe_id || !UUID.test(body.recipe_id)) {
    if (!plannedMealId) return NextResponse.json({ error: "missing recipe_id" }, { status: 400 });
    const supa = supabaseAdmin();
    const cookedBy = body.cooked_by ?? labelFor(roleFromRequest(req));
    const patch = body.undo
      ? { cooked_at: null, cooked_by: null }
      : { cooked_at: new Date().toISOString(), cooked_by: cookedBy };
    const { error } = await supa.from("planned_meals").update(patch).eq("id", plannedMealId).is("recipe_id", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, undone: !!body.undo });
  }
  const supa = supabaseAdmin();

  if (body.undo) {
    // 1. drop the most recent cook of this recipe (cook_log has no planned-meal column)
    const { data: last } = await supa
      .from("cook_log")
      .select("id")
      .eq("recipe_id", body.recipe_id)
      .order("cooked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.id) await supa.from("cook_log").delete().eq("id", last.id);
    // 2. clear the planned meal
    if (plannedMealId) {
      await supa.from("planned_meals").update({ cooked_at: null, cooked_by: null }).eq("id", plannedMealId);
    }
    // 3. last_made = the previous cook, if any
    const { data: prev } = await supa
      .from("cook_log")
      .select("cooked_at")
      .eq("recipe_id", body.recipe_id)
      .order("cooked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastMade = prev?.cooked_at ? todayInTz(undefined, new Date(prev.cooked_at as string)) : null;
    await supa.from("recipes").update({ last_made: lastMade }).eq("id", body.recipe_id);
    return NextResponse.json({ ok: true, undone: true, last_made: lastMade });
  }

  // Who cooked: explicit body wins, else the device's role cookie.
  const cookedBy = body.cooked_by ?? labelFor(roleFromRequest(req));
  const now = new Date();
  const today = todayInTz(undefined, now); // SG calendar date, never the UTC one

  const { data, error } = await supa
    .from("cook_log")
    .insert({
      recipe_id: body.recipe_id,
      cooked_by: cookedBy,
      servings: body.servings ?? null,
      rating: body.rating ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bump `last_made` on the recipe (SG date) and stamp the planned meal if there is one.
  const tasks: PromiseLike<unknown>[] = [
    supa.from("recipes").update({ last_made: today }).eq("id", body.recipe_id),
  ];
  if (plannedMealId) {
    tasks.push(
      supa
        .from("planned_meals")
        .update({ cooked_at: now.toISOString(), cooked_by: cookedBy })
        .eq("id", plannedMealId),
    );
  }
  await Promise.allSettled(tasks);

  return NextResponse.json({ ok: true, log: data, last_made: today });
}
