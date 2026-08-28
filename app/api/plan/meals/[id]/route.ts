import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidYmd, weekMondayOf } from "@/lib/week";
import { scheduleGroceryRebuild } from "@/lib/grocery/auto-build";
import { parseSlot, type PlannedMealPatch } from "@/lib/plan/types";
import { parseEaters } from "@/lib/portions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** PATCH /api/plan/meals/:id  { eaters?, note?, slot?, planned_for?, position? } → { meal } */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  let body: PlannedMealPatch;
  try {
    body = (await req.json()) as PlannedMealPatch;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.eaters !== undefined) {
    const e = parseEaters(body.eaters);
    if (!e) return NextResponse.json({ error: "bad eaters" }, { status: 400 });
    patch.eaters = e;
  }
  if (body.slot !== undefined) {
    const s = parseSlot(body.slot);
    if (!s) return NextResponse.json({ error: "bad slot" }, { status: 400 });
    patch.slot = s;
  }
  if (body.planned_for !== undefined) {
    if (!isValidYmd(body.planned_for)) return NextResponse.json({ error: "bad date" }, { status: 400 });
    patch.planned_for = body.planned_for;
  }
  if (body.note !== undefined) {
    if (body.note !== null && (typeof body.note !== "string" || body.note.length > 240)) {
      return NextResponse.json({ error: "note must be text up to 240 characters" }, { status: 400 });
    }
    patch.note = body.note === "" ? null : body.note;
  }
  if (body.position !== undefined) {
    if (!Number.isInteger(body.position)) return NextResponse.json({ error: "bad position" }, { status: 400 });
    patch.position = body.position;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const { data: before } = await supa.from("planned_meals").select("planned_for, leftover_of").eq("id", id).maybeSingle();
  const { data, error } = await supa.from("planned_meals").update(patch).eq("id", id).select("*").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "duplicate" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // eaters / date changes move quantities between weeks; leftovers are not shopped for
  if (patch.eaters !== undefined || patch.planned_for !== undefined) {
    scheduleGroceryRebuild(
      before?.planned_for ? weekMondayOf(before.planned_for as string) : null,
      weekMondayOf((data as { planned_for: string }).planned_for),
    );
  }
  return NextResponse.json({ meal: data });
}

/** DELETE /api/plan/meals/:id → { ok } */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const supa = supabaseAdmin();
  const { data: before } = await supa.from("planned_meals").select("planned_for").eq("id", id).maybeSingle();
  // Leftover rows point at this meal; without their original they would turn into full cooks and get shopped for.
  await supa.from("planned_meals").delete().eq("leftover_of", id);
  const { error } = await supa.from("planned_meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (before?.planned_for) scheduleGroceryRebuild(weekMondayOf(before.planned_for as string));
  return NextResponse.json({ ok: true });
}
