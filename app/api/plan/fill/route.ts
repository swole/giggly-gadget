import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidYmd, weekDates, weekMondayOf } from "@/lib/week";
import { resolveRotation, rotationWeekFor, type RotationWeekNo } from "@/lib/plan/rotation";
import { roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";
import { scheduleGroceryRebuild } from "@/lib/grocery/auto-build";
import { plannerGate } from "@/lib/role.server";

export const runtime = "nodejs";

type Body = { week_of?: string; rotation_week?: number; mode?: "fill_empty" | "replace" };

/**
 * POST /api/plan/fill { week_of, rotation_week?, mode? } → { added, skipped, removed, unmatched, rotation_week }
 * fill_empty (default): add rotation dishes only into day+slot cells that are empty.
 * replace: clear the week's plan rows first, then add everything.
 */
export async function POST(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!isValidYmd(body.week_of)) return NextResponse.json({ error: "week_of required" }, { status: 400 });
  const weekOf = weekMondayOf(body.week_of);
  const dates = weekDates(weekOf);
  const rot: RotationWeekNo =
    body.rotation_week === 1 || body.rotation_week === 2 || body.rotation_week === 3
      ? body.rotation_week
      : rotationWeekFor(weekOf);
  const mode = body.mode === "replace" ? "replace" : "fill_empty";
  const addedBy = labelFor(roleFromRequest(req));

  const supa = supabaseAdmin();
  const { data: recipes } = await supa.from("recipes").select("id, title");
  const { items, unmatched } = resolveRotation(rot, dates, (recipes ?? []) as { id: string; title: string }[]);

  let removed = 0;
  if (mode === "replace") {
    const { data: del } = await supa
      .from("planned_meals")
      .delete()
      .gte("planned_for", dates[0])
      .lte("planned_for", dates[6])
      .select("id");
    removed = del?.length ?? 0;
  }

  const { data: existing } = await supa
    .from("planned_meals")
    .select("planned_for, slot, recipe_id")
    .gte("planned_for", dates[0])
    .lte("planned_for", dates[6]);
  const occupied = new Set((existing ?? []).map((m) => `${m.planned_for}|${m.slot}`));
  const present = new Set((existing ?? []).map((m) => `${m.planned_for}|${m.slot}|${m.recipe_id}`));

  let added = 0, skipped = 0;
  for (const it of items) {
    const cell = `${it.planned_for}|${it.slot}`;
    if (present.has(`${cell}|${it.recipe_id}`)) { skipped++; continue; }
    if (mode === "fill_empty" && occupied.has(cell)) { skipped++; continue; }
    const { error } = await supa.from("planned_meals").insert({
      planned_for: it.planned_for,
      slot: it.slot,
      recipe_id: it.recipe_id,
      eaters: "both",
      position: 0,
      added_by: addedBy,
    });
    if (error) { skipped++; continue; }
    occupied.add(cell);
    added++;
  }
  if (added > 0 || removed > 0) scheduleGroceryRebuild(weekOf);
  return NextResponse.json({ week_of: weekOf, rotation_week: rot, mode, added, skipped, removed, unmatched });
}
