import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addDays, isValidYmd, weekMondayOf } from "@/lib/week";
import { roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";
import { scheduleGroceryRebuild } from "@/lib/grocery/auto-build";
import { plannerGate } from "@/lib/role.server";

export const runtime = "nodejs";

type Body = { from_week?: string; to_week?: string; mode?: "fill_empty" | "replace" };

/** POST /api/plan/copy { from_week, to_week, mode? } → { copied, skipped, removed }. Shifts meals by whole weeks. */
export async function POST(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!isValidYmd(body.from_week) || !isValidYmd(body.to_week)) {
    return NextResponse.json({ error: "from_week and to_week required" }, { status: 400 });
  }
  const from = weekMondayOf(body.from_week);
  const to = weekMondayOf(body.to_week);
  if (from === to) return NextResponse.json({ error: "same week" }, { status: 400 });
  const shiftDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  const mode = body.mode === "replace" ? "replace" : "fill_empty";
  const addedBy = labelFor(roleFromRequest(req));

  const supa = supabaseAdmin();
  const { data: src } = await supa
    .from("planned_meals")
    .select("planned_for, slot, recipe_id, eaters, position, note")
    .gte("planned_for", from)
    .lte("planned_for", addDays(from, 6))
    .is("leftover_of", null);

  let removed = 0;
  if (mode === "replace") {
    const { data: del } = await supa
      .from("planned_meals")
      .delete()
      .gte("planned_for", to)
      .lte("planned_for", addDays(to, 6))
      .select("id");
    removed = del?.length ?? 0;
  }
  const { data: existing } = await supa
    .from("planned_meals")
    .select("planned_for, slot, recipe_id")
    .gte("planned_for", to)
    .lte("planned_for", addDays(to, 6));
  const occupied = new Set((existing ?? []).map((m) => `${m.planned_for}|${m.slot}`));
  const present = new Set((existing ?? []).map((m) => `${m.planned_for}|${m.slot}|${m.recipe_id}`));

  let copied = 0, skipped = 0;
  for (const m of src ?? []) {
    const date = addDays(m.planned_for as string, shiftDays);
    const cell = `${date}|${m.slot}`;
    if (present.has(`${cell}|${m.recipe_id}`)) { skipped++; continue; }
    if (mode === "fill_empty" && occupied.has(cell)) { skipped++; continue; }
    const { error } = await supa.from("planned_meals").insert({
      planned_for: date,
      slot: m.slot,
      recipe_id: m.recipe_id,
      eaters: m.eaters,
      position: m.position,
      note: m.note,
      added_by: addedBy,
    });
    if (error) { skipped++; continue; }
    occupied.add(cell);
    copied++;
  }
  if (copied > 0 || removed > 0) scheduleGroceryRebuild(to);
  return NextResponse.json({ from_week: from, to_week: to, mode, copied, skipped, removed });
}
