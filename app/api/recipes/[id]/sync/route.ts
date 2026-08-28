import { NextRequest, NextResponse } from "next/server";
import { syncRecipePage } from "@/lib/notion-sync";
import { plannerGate } from "@/lib/role.server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/recipes/:id/sync → { ok, error? } — pull one Notion page into Supabase right now. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = plannerGate(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const r = await syncRecipePage(id);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
