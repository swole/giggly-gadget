import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { plannerGate, roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";

export const runtime = "nodejs";

/**
 * PUT /api/spend/reimburse { ids, undo? } -> { updated, reimbursed_at }
 * "Mark paid back": one tap covers everything owed, because it is one PayNow. Every id gets
 * the same timestamp so the ledger export can key that PayNow by its day. undo clears them.
 * Planners only.
 */
export async function PUT(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  let body: { ids?: unknown; undo?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is number => Number.isInteger(x) && (x as number) > 0) : [];
  if (ids.length === 0 || ids.length > 200) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const supa = supabaseAdmin();
  const now = new Date().toISOString();
  const q = body.undo === true
    ? supa.from("expenses").update({ reimbursed_at: null, reimbursed_by: null, updated_at: now }).in("id", ids).not("reimbursed_at", "is", null)
    : supa
        .from("expenses")
        .update({ reimbursed_at: now, reimbursed_by: labelFor(roleFromRequest(req)), updated_at: now })
        .in("id", ids)
        .eq("reimbursable", true)
        .is("reimbursed_at", null);
  const { data, error } = await q.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: (data ?? []).length, reimbursed_at: body.undo === true ? null : now });
}
