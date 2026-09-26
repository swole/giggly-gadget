import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { weekMondayOf } from "@/lib/week";
import { parseTripInput, tripWeeks } from "@/lib/plan/travel";
import type { TripRow } from "@/lib/plan/types";
import { plannerGate } from "@/lib/role.server";
import { scheduleGroceryRebuild } from "@/lib/grocery/auto-build";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** PATCH /api/plan/trips/:id { person, from_date, from_slot, to_date, to_slot } → { trip }. Rebuilds the old and new weeks. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = plannerGate(req);
  if (denied) return denied;
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseTripInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supa = supabaseAdmin();
  const { data: before } = await supa.from("trips").select("from_date, to_date").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data, error } = await supa
    .from("trips")
    .update({ ...parsed.trip, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  scheduleGroceryRebuild(...tripWeeks(before as Pick<TripRow, "from_date" | "to_date">, weekMondayOf), ...tripWeeks(parsed.trip, weekMondayOf));
  return NextResponse.json({ trip: data });
}

/** DELETE /api/plan/trips/:id → { ok }. The week goes back to who was planned to eat. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = plannerGate(req);
  if (denied) return denied;
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const supa = supabaseAdmin();
  const { data: before } = await supa.from("trips").select("from_date, to_date").eq("id", id).maybeSingle();
  const { error } = await supa.from("trips").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (before) scheduleGroceryRebuild(...tripWeeks(before as Pick<TripRow, "from_date" | "to_date">, weekMondayOf));
  return NextResponse.json({ ok: true });
}
