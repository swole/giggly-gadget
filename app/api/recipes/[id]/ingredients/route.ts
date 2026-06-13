import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("ingredients_parsed")
    .select("name, qty_min, qty_max, unit, modifier, to_taste, scalable, line_index")
    .eq("recipe_id", id)
    .order("line_index");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
