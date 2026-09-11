// Pure arithmetic over expenses: totals by shop, what is owed, the six-week bars, and which
// ticked supermarket rows no receipt accounts for. Shared by /grocery, /spend and the API.

import { sumCents, toCents, type Cents } from "@/lib/money";
import { addDays } from "@/lib/week";
import { SPEND_SHOPS, type Expense, type ExpenseItem, type Owed, type SpendShop } from "./types";

export function expenseCents(e: Pick<Expense, "total_sgd">): Cents {
  return toCents(e.total_sgd) ?? 0;
}

export function itemCents(i: Pick<ExpenseItem, "amount_sgd">): Cents {
  return toCents(i.amount_sgd) ?? 0;
}

export type ShopTotal = { shop: SpendShop; cents: Cents; count: number; cash: number; card: number };

export function totalsByShop(expenses: Expense[]): Record<SpendShop, ShopTotal> {
  const out = Object.fromEntries(
    SPEND_SHOPS.map((s) => [s, { shop: s, cents: 0, count: 0, cash: 0, card: 0 }]),
  ) as Record<SpendShop, ShopTotal>;
  for (const e of expenses) {
    const t = out[e.shop] ?? out.other;
    t.cents += expenseCents(e);
    t.count += 1;
    if (e.paid_with === "cash") t.cash += 1;
    else t.card += 1;
  }
  return out;
}

export function weekTotal(expenses: Pick<Expense, "total_sgd">[]): Cents {
  return sumCents(expenses.map(expenseCents));
}

/** Unpaid reimbursable cash, oldest first. since = the earliest receipt date still owed. */
export function owedOf(expenses: Pick<Expense, "id" | "reimbursable" | "reimbursed_at" | "spent_on" | "total_sgd">[]): Owed {
  const open = expenses
    .filter((e) => e.reimbursable && !e.reimbursed_at)
    .sort((a, b) => a.spent_on.localeCompare(b.spent_on) || a.id - b.id);
  return {
    cents: sumCents(open.map(expenseCents)),
    since: open[0]?.spent_on ?? null,
    ids: open.map((e) => e.id),
  };
}

/** Sum of the receipt lines (discounts negative), to set against the printed total. */
export function linesSum(items: Pick<ExpenseItem, "amount_sgd">[]): Cents {
  return sumCents(items.map(itemCents));
}

/** Lines and total disagree by more than 5 cents (the reader missed or doubled a line). */
export function linesDisagree(linesCents: Cents, totalCents: Cents): boolean {
  return Math.abs(linesCents - totalCents) > 5;
}

/** Week totals for the n weeks ending at endWeek (inclusive), oldest first; empty weeks are 0. */
export function trendWeeks(rows: Pick<Expense, "week_of" | "total_sgd">[], endWeek: string, n = 6): { week_of: string; cents: Cents }[] {
  const weeks = Array.from({ length: n }, (_, i) => addDays(endWeek, -7 * (n - 1 - i)));
  const byWeek = new Map<string, Cents>(weeks.map((w) => [w, 0]));
  for (const r of rows) if (byWeek.has(r.week_of)) byWeek.set(r.week_of, (byWeek.get(r.week_of) ?? 0) + expenseCents(r));
  return weeks.map((w) => ({ week_of: w, cents: byWeek.get(w) ?? 0 }));
}

/** "cash, 1 trip" / "card, 2 receipts" / "cash and card, 3" / "nothing yet". */
export function paidWithLabel(t: Pick<ShopTotal, "count" | "cash" | "card">): string {
  if (t.count === 0) return "nothing yet";
  if (t.card === 0) return `cash, ${t.count} ${t.count === 1 ? "trip" : "trips"}`;
  if (t.cash === 0) return `card, ${t.count} ${t.count === 1 ? "receipt" : "receipts"}`;
  return `cash and card, ${t.count}`;
}

/**
 * Ticked rows in a shop that no saved receipt line points at: bought but unaccounted for
 * (another shop, cash, or a line the reader could not match). Only meaningful once at least
 * one receipt for that shop was read, so it returns [] otherwise.
 */
export function tickedWithoutReceipt(
  rows: { id: number; name: string; shop: string | null; checked: boolean; staple?: boolean }[],
  expenses: Expense[],
  shop: SpendShop,
): string[] {
  const receipts = expenses.filter((e) => e.shop === shop && e.receipt_read);
  if (receipts.length === 0) return [];
  const linked = new Set(receipts.flatMap((e) => e.items.map((i) => i.grocery_list_id).filter((id): id is number => id !== null)));
  return rows
    .filter((r) => (r.shop ?? "supermarket") === shop && r.checked && !r.staple && !linked.has(r.id))
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b));
}
