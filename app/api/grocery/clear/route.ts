import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentWeekMonday } from "@/lib/week";

export const runtime = "nodejs";

export async function POST() {
  const supa = supabaseAdmin();
  const week = currentWeekMonday();
  const { error } = await supa.from("grocery_list").delete().eq("week_of", week);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cleared_week: week });
}
