import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { plannerGate } from "@/lib/role.server";
import { isValidYmd, todayInTz } from "@/lib/week";
import { getExpensesBetween } from "@/lib/spend/queries";
import { spendCsvRows, toCsv } from "@/lib/spend/csv";

export const runtime = "nodejs";

/**
 * GET /api/spend/export?from=YYYY-MM-DD&to=YYYY-MM-DD -> text/csv (planners)
 * Both bounds optional and on spent_on; no bounds = everything. Columns and charge_key rules
 * live in lib/spend/csv.ts. Filename: giggly-spend-<from>-to-<to>.csv.
 */
export async function GET(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const from = isValidYmd(sp.get("from")) ? sp.get("from") : null;
  const to = isValidYmd(sp.get("to")) ? sp.get("to") : null;
  try {
    const expenses = await getExpensesBetween(from, to);
    const ids = [...new Set(expenses.flatMap((e) => e.items.map((i) => i.grocery_list_id)).filter((id): id is number => id !== null))];
    const names = new Map<number, string>();
    if (ids.length) {
      const { data } = await supabaseAdmin().from("grocery_list").select("id, name").in("id", ids);
      for (const r of (data ?? []) as { id: number; name: string }[]) names.set(r.id, r.name);
    }
    const start = from ?? expenses[0]?.spent_on ?? todayInTz();
    const end = to ?? todayInTz();
    return new NextResponse(toCsv(spendCsvRows(expenses, names)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="giggly-spend-${start}-to-${end}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
