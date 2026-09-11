// "Export for the ledger": one CSV row per expense, shaped for the Household Ledger's Python
// ingest (apps/household-spend-dashboard/ingest/build_ledger.py keys card lines on
// `YYYY-MM-DD|person|amount` with the TRANSACTION date).
//   card rows  -> charge_key = spent_on|johnny|total   (joins the UOB statement line exactly)
//   cash rows  -> charge_key blank until paid back, then reimbursed_on|johnny|<everything paid
//                 back that day>, because one PayNow covers them all and the bank shows one line
// RFC 4180: comma separated, CRLF line ends, fields quoted when they hold a comma, a quote or
// a line break; no BOM (a BOM breaks the first header name in Python's csv module).

import { amount2dp, sumCents } from "@/lib/money";
import { APP_TZ, todayInTz } from "@/lib/week";
import { expenseCents, itemCents } from "./summary";
import type { Expense } from "./types";

export const CSV_COLUMNS = ["date", "person", "shop", "merchant", "paid_with", "amount_sgd", "reimbursed_on", "charge_key", "items"] as const;

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** The SG calendar day a reimbursement happened (reimbursed_at is a UTC timestamp). */
export function reimbursedOn(e: Pick<Expense, "reimbursed_at">): string | null {
  return e.reimbursed_at ? todayInTz(APP_TZ, new Date(e.reimbursed_at)) : null;
}

/**
 * Header + one row per expense, oldest first. groceryNames maps grocery_list ids to the list
 * name, so a matched line exports as what was on the list ("broccoli") rather than the till
 * text ("CS FRESH BROCCOLI 300G").
 */
export function spendCsvRows(expenses: Expense[], groceryNames: Map<number, string> = new Map()): string[][] {
  // One PayNow per day: sum every cash expense paid back on the same SG date.
  const paidPerDay = new Map<string, number[]>();
  for (const e of expenses) {
    const day = e.paid_with === "cash" ? reimbursedOn(e) : null;
    if (day) paidPerDay.set(day, [...(paidPerDay.get(day) ?? []), expenseCents(e)]);
  }
  const sorted = [...expenses].sort((a, b) => a.spent_on.localeCompare(b.spent_on) || a.id - b.id);
  const rows = sorted.map((e) => {
    const cents = expenseCents(e);
    const paidOn = reimbursedOn(e);
    let key = "";
    if (e.paid_with === "card") key = `${e.spent_on}|johnny|${amount2dp(cents)}`;
    else if (paidOn) key = `${paidOn}|johnny|${amount2dp(sumCents(paidPerDay.get(paidOn) ?? []))}`;
    const items = e.items
      .filter((i) => i.kind === "item" && itemCents(i) !== 0)
      .sort((a, b) => a.position - b.position)
      .map((i) => (i.grocery_list_id !== null ? groceryNames.get(i.grocery_list_id) : null) ?? i.name)
      .join("; ");
    return [e.spent_on, "johnny", e.shop, e.merchant ?? "", e.paid_with, amount2dp(cents), paidOn ?? "", key, items];
  });
  return [[...CSV_COLUMNS], ...rows];
}
