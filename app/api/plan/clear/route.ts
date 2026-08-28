import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidYmd, weekDates, weekMondayOf } from "@/lib/week";
import { plannerGate } from "@/lib/role.server";
import { scheduleGroceryRebuild } from "@/lib/grocery/auto-build";

export const runtime = "nodejs";

/**
 * POST /api/plan/clear { week_of } → { removed, kept_cooked }
 * Blanks the week: removes every un-cooked planned meal. Cooked meals stay —
 * they are the household's record of what was actually eaten.
 */
export async function POST(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  let body: { week_of?: string };
  try {
    body = (await req.json()) as { week_of?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!isValidYmd(body.week_of)) return NextResponse.json({ error: "week_of required" }, { status: 400 });
  const weekOf = weekMondayOf(body.week_of);
  const dates = weekDates(weekOf);

  const supa = supabaseAdmin();
  const { data: removedRows, error } = await supa
    .from("planned_meals")
    .delete()
    .gte("planned_for", dates[0])
    .lte("planned_for", dates[6])
    .is("cooked_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await supa
    .from("planned_meals")
    .select("id", { count: "exact", head: true })
    .gte("planned_for", dates[0])
    .lte("planned_for", dates[6]);

  const removed = removedRows?.length ?? 0;
  if (removed > 0) scheduleGroceryRebuild(weekOf);
  return NextResponse.json({ week_of: weekOf, removed, kept_cooked: count ?? 0 });
}
