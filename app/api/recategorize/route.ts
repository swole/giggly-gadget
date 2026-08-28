import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { categorize } from "@/lib/ingredients/categorize";
import { secretGate } from "@/lib/role.server";

export const runtime = "nodejs";

// One-off util: re-run categorize() on all existing ingredients_parsed rows
// and update their category. Used after improving the category dictionary
// without needing a full Notion re-sync.
export async function POST(req: NextRequest) {
  const denied = secretGate(req);
  if (denied) return denied;
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("ingredients_parsed")
    .select("id, name, category");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  for (const row of data ?? []) {
    const fresh = categorize(row.name);
    if (fresh !== row.category) {
      const { error: upErr } = await supa
        .from("ingredients_parsed")
        .update({ category: fresh })
        .eq("id", row.id);
      if (!upErr) updated++;
    }
  }

  // Also update grocery_list rows (their category is a denormalized copy)
  const { data: groceries } = await supa
    .from("grocery_list")
    .select("id, name, category");
  let groUpdated = 0;
  for (const row of groceries ?? []) {
    const fresh = categorize(row.name);
    if (fresh !== row.category) {
      const { error: upErr } = await supa
        .from("grocery_list")
        .update({ category: fresh })
        .eq("id", row.id);
      if (!upErr) groUpdated++;
    }
  }

  return NextResponse.json({
    ok: true,
    ingredients_total: data?.length ?? 0,
    ingredients_updated: updated,
    grocery_updated: groUpdated,
  });
}

export async function GET(req: NextRequest) {
  const denied = secretGate(req);
  if (denied) return denied;
  return POST(req);
}
