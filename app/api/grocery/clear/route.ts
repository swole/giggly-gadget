import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentWeekMonday, isValidYmd, weekMondayOf } from "@/lib/week";
import { plannerGate } from "@/lib/role.server";

export const runtime = "nodejs";

/** POST /api/grocery/clear { week_of? } → clears every row (plan and manual) for that week. */
export async function POST(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  let body: { week_of?: string } = {};
  try {
    body = (await req.json()) as { week_of?: string };
  } catch {
    /* no body → current week */
  }
  const week = isValidYmd(body.week_of) ? weekMondayOf(body.week_of) : currentWeekMonday();
  const supa = supabaseAdmin();
  const { error } = await supa.from("grocery_list").delete().eq("week_of", week);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cleared_week: week });
}
