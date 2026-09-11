// Server-side reads for spend. Every read tolerates migration 0008 not having run yet:
// a missing table comes back as empty data, so the code can deploy before the SQL.

import { supabaseAdmin } from "@/lib/supabase/server";
import { addDays } from "@/lib/week";
import { owedOf } from "./summary";
import { EMPTY_OWED, type Expense, type SpendWeek } from "./types";

type PgError = { code?: string; message?: string } | null;

/** "relation does not exist" / "not in the schema cache": 0008 has not been applied. */
export function isMissingTable(error: PgError): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

/** True once migration 0008 has run. A real GET, not HEAD (see lunchLocationsReady, commit 9d816bf). */
export async function expensesReady(): Promise<boolean> {
  const { error } = await supabaseAdmin().from("expenses").select("id").limit(1);
  return !error;
}

const WITH_ITEMS = "*, items:expense_items(*)";

function normalize(rows: unknown[] | null): Expense[] {
  return ((rows ?? []) as Expense[]).map((e) => ({ ...e, items: [...(e.items ?? [])].sort((a, b) => a.position - b.position) }));
}

/** The week's expenses (items included, oldest first) plus everything owed across weeks. */
export async function getSpendWeek(weekOf: string): Promise<SpendWeek> {
  const supa = supabaseAdmin();
  const [week, open] = await Promise.all([
    supa.from("expenses").select(WITH_ITEMS).eq("week_of", weekOf).order("spent_on").order("id"),
    supa.from("expenses").select("id, reimbursable, reimbursed_at, spent_on, total_sgd").eq("reimbursable", true).is("reimbursed_at", null),
  ]);
  if (week.error) {
    if (isMissingTable(week.error)) return { week_of: weekOf, expenses: [], owed: EMPTY_OWED };
    throw week.error;
  }
  if (open.error && !isMissingTable(open.error)) throw open.error;
  return {
    week_of: weekOf,
    expenses: normalize(week.data),
    owed: owedOf((open.data ?? []) as Pick<Expense, "id" | "reimbursable" | "reimbursed_at" | "spent_on" | "total_sgd">[]),
  };
}

/** week_of + total for the n weeks ending at endWeek, for the trend bars. */
export async function getSpendTrendRows(endWeek: string, n = 6): Promise<Pick<Expense, "week_of" | "total_sgd">[]> {
  const { data, error } = await supabaseAdmin()
    .from("expenses")
    .select("week_of, total_sgd")
    .gte("week_of", addDays(endWeek, -7 * (n - 1)))
    .lte("week_of", endWeek);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []) as Pick<Expense, "week_of" | "total_sgd">[];
}

/** Every expense with spent_on in [from, to] (either bound optional), items included. */
export async function getExpensesBetween(from: string | null, to: string | null): Promise<Expense[]> {
  let q = supabaseAdmin().from("expenses").select(WITH_ITEMS).order("spent_on").order("id");
  if (from) q = q.gte("spent_on", from);
  if (to) q = q.lte("spent_on", to);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return normalize(data);
}

export async function getExpense(id: number): Promise<Expense | null> {
  const { data, error } = await supabaseAdmin().from("expenses").select(WITH_ITEMS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalize([data])[0] : null;
}
