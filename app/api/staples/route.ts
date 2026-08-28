import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeStapleName } from "@/lib/grocery/staples";
import { currentWeekMonday, isValidYmd, weekMondayOf } from "@/lib/week";
import { roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";

export const runtime = "nodejs";

/** GET /api/staples → { staples: string[] } */
export async function GET() {
  const supa = supabaseAdmin();
  const { data, error } = await supa.from("pantry_staples").select("name").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staples: (data ?? []).map((r) => (r as { name: string }).name) });
}

/**
 * POST /api/staples { name, staple: boolean } → { ok }
 * Marks/unmarks a pantry staple and flips `staple` on matching rows of the current week
 * so the list updates immediately (Realtime carries it to every phone).
 */
export async function POST(req: NextRequest) {
  let body: { name?: string; staple?: boolean; week_of?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const name = normalizeStapleName(body.name ?? "");
  if (!name || typeof body.staple !== "boolean") {
    return NextResponse.json({ error: "name and staple are required" }, { status: 400 });
  }
  const supa = supabaseAdmin();
  if (body.staple) {
    const { error } = await supa
      .from("pantry_staples")
      .upsert({ name, added_by: labelFor(roleFromRequest(req)) }, { onConflict: "name" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supa.from("pantry_staples").delete().eq("name", name);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const weekOf = typeof body.week_of === "string" && isValidYmd(body.week_of) ? weekMondayOf(body.week_of) : currentWeekMonday();
  await supa
    .from("grocery_list")
    .update({ staple: body.staple })
    .gte("week_of", weekOf) // this week and any planned week after it
    .ilike("name", name.replace(/[%_]/g, "\\$&"));
  return NextResponse.json({ ok: true, name, staple: body.staple });
}
