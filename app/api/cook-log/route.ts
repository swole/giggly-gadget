import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = {
  recipe_id: string;
  cooked_by?: string | null;
  servings?: number | null;
  rating?: number | null;
  notes?: string | null;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.recipe_id) {
    return NextResponse.json({ error: "missing recipe_id" }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("cook_log")
    .insert({
      recipe_id: body.recipe_id,
      cooked_by: body.cooked_by ?? null,
      servings: body.servings ?? null,
      rating: body.rating ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also bump `last_made` on the recipe
  await supa
    .from("recipes")
    .update({ last_made: new Date().toISOString().slice(0, 10) })
    .eq("id", body.recipe_id);

  return NextResponse.json({ ok: true, log: data });
}
