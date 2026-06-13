import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notionClient } from "@/lib/notion";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let value: boolean;
  try {
    const body = (await req.json()) as { value: boolean };
    value = Boolean(body.value);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const notion = notionClient();

  const [supaRes, notionRes] = await Promise.allSettled([
    supa.from("recipes").update({ want_to_try: value }).eq("id", id),
    notion.pages.update({
      page_id: id,
      properties: {
        "Want to Try": { checkbox: value },
      },
    }),
  ]);

  const supaErr =
    supaRes.status === "rejected"
      ? String(supaRes.reason)
      : (supaRes.value.error?.message ?? null);
  const notionErr =
    notionRes.status === "rejected" ? String(notionRes.reason) : null;

  if (supaErr || notionErr) {
    return NextResponse.json(
      { ok: false, supabase: supaErr, notion: notionErr },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, value });
}
