import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notionClient } from "@/lib/notion";
import { isValidRating, toNotionRatingName } from "@/lib/rating";
import { plannerGate } from "@/lib/role.server";

export const runtime = "nodejs";

// Ratings are 1–5 in half-star steps (0 clears). Notion "Rating" is a select
// whose option names are star emoji plus ½ for halves (⭐ … ⭐⭐⭐⭐½ … ⭐⭐⭐⭐⭐);
// Supabase stores numeric(3,1). lib/rating.ts owns the conversions.
function notionRatingSelect(value: number) {
  const name = toNotionRatingName(value);
  return name ? { select: { name } } : { select: null };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = plannerGate(req);
  if (denied) return denied;
  const { id } = await params;
  let value: number;
  try {
    const body = (await req.json()) as { value: number };
    value = Number(body.value);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!isValidRating(value)) {
    return NextResponse.json({ error: "value must be 0 or 1-5 in 0.5 steps" }, { status: 400 });
  }

  const supa = supabaseAdmin();
  const notion = notionClient();

  const [supaRes, notionRes] = await Promise.allSettled([
    supa
      .from("recipes")
      .update({ rating: value === 0 ? null : value })
      .eq("id", id),
    notion.pages.update({
      page_id: id,
      properties: {
        Rating: notionRatingSelect(value),
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
