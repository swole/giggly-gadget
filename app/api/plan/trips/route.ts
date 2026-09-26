import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { weekMondayOf } from "@/lib/week";
import { parseTripInput, tripWeeks } from "@/lib/plan/travel";
import { plannerGate, roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";
import { scheduleGroceryRebuild } from "@/lib/grocery/auto-build";

export const runtime = "nodejs";

/**
 * POST /api/plan/trips { person, from_date, from_slot, to_date, to_slot } → { trip }
 * Someone travelling misses every meal in the range. Nothing in planned_meals changes:
 * readers take the traveller out at read time, and the grocery list rebuilds for every
 * week the trip touches.
 */
export async function POST(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseTripInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("trips")
    .insert({ ...parsed.trip, created_by: labelFor(roleFromRequest(req)) })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  scheduleGroceryRebuild(...tripWeeks(parsed.trip, weekMondayOf));
  return NextResponse.json({ trip: data });
}
