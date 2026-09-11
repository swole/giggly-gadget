import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { roleFromRequest } from "@/lib/role.server";
import { isPlanner, labelFor, ROLE_LABEL } from "@/lib/role";
import { isValidYmd } from "@/lib/week";
import { amount2dp, MAX_CENTS } from "@/lib/money";
import { getExpense } from "@/lib/spend/queries";
import { parsePaidWith, type Expense, type ExpensePatch } from "@/lib/spend/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Whoever logged it can fix or remove it; Johnny and Lydia can touch anything. */
async function loadForChange(req: NextRequest, ctx: Ctx): Promise<{ expense: Expense; planner: boolean } | NextResponse> {
  const role = roleFromRequest(req);
  if (!role) return NextResponse.json({ error: "Pick who you are first." }, { status: 403 });
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const expense = await getExpense(id);
  if (!expense) return NextResponse.json({ error: "That entry is gone." }, { status: 404 });
  const planner = isPlanner(role);
  if (!planner && expense.added_by !== labelFor(role)) {
    return NextResponse.json({ error: "Only the person who added it, Johnny or Lydia can change this." }, { status: 403 });
  }
  return { expense, planner };
}

/** PATCH /api/spend/:id { total_cents?, paid_with?, spent_on?, merchant?, note? } -> { expense } */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const loaded = await loadForChange(req, ctx);
  if (loaded instanceof NextResponse) return loaded;
  const { expense } = loaded;
  let body: ExpensePatch;
  try {
    body = (await req.json()) as ExpensePatch;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (body.total_cents !== undefined) {
    if (!Number.isInteger(body.total_cents) || body.total_cents <= 0 || body.total_cents > MAX_CENTS) {
      return NextResponse.json({ error: "That amount does not look right." }, { status: 400 });
    }
    patch.total_sgd = amount2dp(body.total_cents);
  }
  if (body.paid_with !== undefined) {
    const p = parsePaidWith(body.paid_with);
    if (!p) return NextResponse.json({ error: "paid_with is cash or card" }, { status: 400 });
    patch.paid_with = p;
    // Only the helper's own cash is owed back to her, whoever edits the entry.
    patch.reimbursable = p === "cash" && expense.added_by === ROLE_LABEL.helper;
  }
  if (body.spent_on !== undefined) {
    if (!isValidYmd(body.spent_on)) return NextResponse.json({ error: "bad date" }, { status: 400 });
    patch.spent_on = body.spent_on;
  }
  if (body.merchant !== undefined) patch.merchant = typeof body.merchant === "string" && body.merchant.trim() ? body.merchant.trim().slice(0, 80) : null;
  if (body.note !== undefined) patch.note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 240) : null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  if (expense.reimbursed_at && ("total_sgd" in patch || "paid_with" in patch)) {
    return NextResponse.json({ error: "Already paid back. Undo the payback on the Spend page first." }, { status: 409 });
  }
  patch.updated_at = new Date().toISOString();
  const { error } = await supabaseAdmin().from("expenses").update(patch).eq("id", expense.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: await getExpense(expense.id) });
}

/** DELETE /api/spend/:id -> { ok }. Items go with it (on delete cascade). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const loaded = await loadForChange(req, ctx);
  if (loaded instanceof NextResponse) return loaded;
  const { expense, planner } = loaded;
  if (expense.reimbursed_at && !planner) {
    return NextResponse.json({ error: "Already paid back. Ask Johnny or Lydia to remove it." }, { status: 409 });
  }
  const { error } = await supabaseAdmin().from("expenses").delete().eq("id", expense.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
