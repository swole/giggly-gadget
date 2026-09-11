import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";
import { currentWeekMonday, isValidYmd, weekMondayOf } from "@/lib/week";
import { amount2dp, MAX_CENTS } from "@/lib/money";
import { getExpense, getSpendWeek, isMissingTable } from "@/lib/spend/queries";
import { parseItemKind, parsePaidWith, parseSpendShop, type NewExpense } from "@/lib/spend/types";

export const runtime = "nodejs";

const notReady = () => NextResponse.json({ error: "Spend tracking is not switched on yet." }, { status: 503 });
const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
};

/** GET /api/spend?week=YYYY-MM-DD -> { week_of, expenses (with items), owed } */
export async function GET(req: NextRequest) {
  if (!roleFromRequest(req)) return NextResponse.json({ error: "Pick who you are first." }, { status: 403 });
  const w = req.nextUrl.searchParams.get("week");
  const week = isValidYmd(w) ? weekMondayOf(w) : currentWeekMonday();
  try {
    return NextResponse.json(await getSpendWeek(week));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/**
 * POST /api/spend NewExpense -> { expense }
 * Any role. Cash the helper fronts is reimbursable; anyone else's cash or a card is not.
 * Items are written after the expense, then updated_at is bumped so the Realtime UPDATE that
 * other phones react to arrives after the items exist.
 */
export async function POST(req: NextRequest) {
  const role = roleFromRequest(req);
  if (!role) return NextResponse.json({ error: "Pick who you are first." }, { status: 403 });
  let body: NewExpense;
  try {
    body = (await req.json()) as NewExpense;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const shop = parseSpendShop(body.shop);
  const paidWith = parsePaidWith(body.paid_with);
  const total = body.total_cents;
  if (!isValidYmd(body.week_of) || !shop || !paidWith || !isValidYmd(body.spent_on)) {
    return NextResponse.json({ error: "week_of, shop, paid_with and spent_on are required" }, { status: 400 });
  }
  if (!Number.isInteger(total) || total <= 0 || total > MAX_CENTS) {
    return NextResponse.json({ error: "That amount does not look right." }, { status: 400 });
  }
  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 80) : [];
  const items = [];
  for (const [i, it] of rawItems.entries()) {
    const name = cleanText(it?.name, 80);
    const cents = it?.amount_cents;
    if (!name || !Number.isInteger(cents) || Math.abs(cents) > MAX_CENTS) {
      return NextResponse.json({ error: `Receipt line ${i + 1} is not readable.` }, { status: 400 });
    }
    items.push({
      position: i,
      name,
      raw: cleanText(it.raw, 120),
      qty: cleanText(it.qty, 40),
      amount_sgd: amount2dp(cents),
      grocery_list_id: Number.isInteger(it.grocery_list_id) ? Number(it.grocery_list_id) : null,
      kind: parseItemKind(it.kind),
    });
  }

  const supa = supabaseAdmin();
  // A grocery row can vanish between the read and the save (the list rebuilds itself): drop dead links.
  const linkIds = [...new Set(items.map((i) => i.grocery_list_id).filter((id): id is number => id !== null))];
  if (linkIds.length) {
    const { data: alive } = await supa.from("grocery_list").select("id").in("id", linkIds);
    const ok = new Set((alive ?? []).map((r: { id: number }) => r.id));
    for (const it of items) if (it.grocery_list_id !== null && !ok.has(it.grocery_list_id)) it.grocery_list_id = null;
  }

  const now = new Date().toISOString();
  const { data: created, error } = await supa
    .from("expenses")
    .insert({
      week_of: weekMondayOf(body.week_of),
      shop,
      merchant: cleanText(body.merchant, 80),
      total_sgd: amount2dp(total),
      paid_with: paidWith,
      reimbursable: paidWith === "cash" && role === "helper",
      spent_on: body.spent_on,
      added_by: labelFor(role),
      note: cleanText(body.note, 240),
      receipt_read: body.receipt_read === true,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingTable(error)) return notReady();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const id = (created as { id: number }).id;

  if (items.length) {
    const { error: iErr } = await supa.from("expense_items").insert(items.map((it) => ({ ...it, expense_id: id })));
    if (iErr) {
      await supa.from("expenses").delete().eq("id", id);
      return NextResponse.json({ error: `Could not save the receipt lines: ${iErr.message}` }, { status: 500 });
    }
  }
  await supa.from("expenses").update({ updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ expense: await getExpense(id) });
}
