import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { findRecipeImage } from "@/lib/image-search";

export const runtime = "nodejs";
export const maxDuration = 300;

// One-off enrichment for already-synced recipes that don't have an image yet.
// New recipes get auto-enriched at sync time via lib/notion-sync.ts.
// Add ?force=1 to re-enrich recipes that already have an image.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const supa = supabaseAdmin();
  const query = supa.from("recipes").select("id, title, cuisine, image_url");
  const { data, error } = force ? await query : await query.is("image_url", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const report = {
    total: data?.length ?? 0,
    enriched: 0,
    no_match: [] as string[],
  };

  for (const r of data ?? []) {
    const imageUrl = await findRecipeImage(r.title, r.cuisine);
    if (imageUrl) {
      const { error: upErr } = await supa
        .from("recipes")
        .update({ image_url: imageUrl })
        .eq("id", r.id);
      if (!upErr) report.enriched++;
    } else {
      report.no_match.push(r.title);
    }
  }

  return NextResponse.json(report);
}

export async function GET(req: Request) {
  return POST(req);
}
