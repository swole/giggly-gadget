import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notionClient } from "@/lib/notion";
import { secretGate } from "@/lib/role.server";

export const runtime = "nodejs";
export const maxDuration = 300;

// One-shot endpoint: clear Want to Try on every flagged recipe (Notion + Supabase).
// Runs sequentially with a tiny gap to respect Notion's 3 req/s rate limit.
export async function POST(req: NextRequest) {
  const denied = secretGate(req);
  if (denied) return denied;
  const supa = supabaseAdmin();
  const notion = notionClient();

  const { data, error } = await supa
    .from("recipes")
    .select("id, title")
    .eq("want_to_try", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = data?.length ?? 0;
  let cleared = 0;
  const failures: { id: string; title: string; reason: string }[] = [];

  for (const r of data ?? []) {
    try {
      await notion.pages.update({
        page_id: r.id,
        properties: { "Want to Try": { checkbox: false } },
      });
      await supa.from("recipes").update({ want_to_try: false }).eq("id", r.id);
      cleared++;
    } catch (e) {
      failures.push({
        id: r.id,
        title: r.title,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
    // Tiny pause to stay under Notion's rate limit
    await new Promise((res) => setTimeout(res, 350));
  }

  return NextResponse.json({ total, cleared, failures });
}

export async function GET(req: NextRequest) {
  const denied = secretGate(req);
  if (denied) return denied;
  return POST(req);
}
