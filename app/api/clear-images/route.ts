import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Wipe all image_urls so the next /api/enrich-images run re-fetches everything
// against the current image-search strategy. Used after switching providers.
export async function POST() {
  const supa = supabaseAdmin();
  const { error, count } = await supa
    .from("recipes")
    .update({ image_url: null }, { count: "exact" })
    .not("image_url", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cleared: count ?? 0 });
}

export async function GET() {
  return POST();
}
