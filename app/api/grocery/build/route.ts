import { NextRequest, NextResponse } from "next/server";
import { buildWeekGroceries } from "@/lib/grocery/build";
import { currentWeekMonday, isValidYmd, weekMondayOf } from "@/lib/week";
import { plannerGate } from "@/lib/role.server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/grocery/build { week_of? } → BuildResult. Rebuilds the week's list from its planned meals. */
export async function POST(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  let body: { week_of?: string } = {};
  try {
    body = (await req.json()) as { week_of?: string };
  } catch {
    /* empty body is fine */
  }
  const weekOf = isValidYmd(body.week_of) ? weekMondayOf(body.week_of) : currentWeekMonday();
  try {
    const result = await buildWeekGroceries(weekOf);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
