import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidYmd } from "@/lib/week";
import { parseLunchLocation, parseLunchPerson } from "@/lib/plan/types";
import { plannerGate, roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";

export const runtime = "nodejs";

/**
 * PUT /api/plan/lunch { planned_for, person, location } → { row }
 * One row per day + person. "home" is the default when no row exists; once a
 * planner has touched a day the value is stored either way, so toggling is
 * always an upsert and Realtime always sees an INSERT or UPDATE.
 */
export async function PUT(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  let body: { planned_for?: string; person?: string; location?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const person = parseLunchPerson(body.person);
  const location = parseLunchLocation(body.location);
  if (!isValidYmd(body.planned_for) || !person || !location) {
    return NextResponse.json({ error: "planned_for, person (johnny | lydia) and location (home | office) are required" }, { status: 400 });
  }
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("lunch_locations")
    .upsert(
      { planned_for: body.planned_for, person, location, updated_by: labelFor(roleFromRequest(req)), updated_at: new Date().toISOString() },
      { onConflict: "planned_for,person" },
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}
