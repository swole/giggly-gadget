// Shapes for the week's shop spend (migration 0008). Client-safe.
// Amounts cross the API as integer cents; the DB stores numeric(8,2), which PostgREST hands
// back as a number or a string, so row types accept both and callers go through toCents().

import type { Cents } from "@/lib/money";

export const SPEND_SHOPS = ["wet_market", "supermarket", "other"] as const;
export type SpendShop = (typeof SPEND_SHOPS)[number];

export const SPEND_SHOP_LABEL: Record<SpendShop, string> = {
  wet_market: "Wet market",
  supermarket: "Supermarket",
  other: "Other",
};

export type PaidWith = "cash" | "card";
export type ItemKind = "item" | "discount" | "fee";

export type ExpenseItem = {
  id: number;
  expense_id: number;
  position: number;
  name: string;
  raw: string | null;
  qty: string | null;
  amount_sgd: number | string;
  grocery_list_id: number | null;
  kind: ItemKind;
};

export type Expense = {
  id: number;
  week_of: string;
  shop: SpendShop;
  merchant: string | null;
  total_sgd: number | string;
  paid_with: PaidWith;
  reimbursable: boolean;
  reimbursed_at: string | null;
  reimbursed_by: string | null;
  spent_on: string;
  added_by: string | null;
  note: string | null;
  receipt_read: boolean;
  created_at: string;
  updated_at: string;
  items: ExpenseItem[];
};

/** Cash Shallaine fronted that nobody has paid back yet, across every week. */
export type Owed = { cents: Cents; since: string | null; ids: number[] };

export type SpendWeek = { week_of: string; expenses: Expense[]; owed: Owed };

/** What /grocery and /spend hand their client components. ready = migration 0008 has run. */
export type SpendState = SpendWeek & { ready: boolean };

export const EMPTY_OWED: Owed = { cents: 0, since: null, ids: [] };

export function parseSpendShop(v: unknown): SpendShop | null {
  return typeof v === "string" && (SPEND_SHOPS as readonly string[]).includes(v) ? (v as SpendShop) : null;
}

export function parsePaidWith(v: unknown): PaidWith | null {
  return v === "cash" || v === "card" ? v : null;
}

export function parseItemKind(v: unknown): ItemKind {
  return v === "discount" || v === "fee" ? v : "item";
}

/** One line of a receipt as the reader returns it (before saving). */
export type ReceiptLine = {
  raw: string;
  name: string;
  qty: string | null;
  amount_cents: Cents;
  kind: ItemKind;
  /** A shopping-list name the reader thinks this line is, or null. Checked against the list before use. */
  list_match: string | null;
};

export type ReceiptRead = {
  merchant: string | null;
  spent_on: string | null;
  total_cents: Cents | null;
  lines: ReceiptLine[];
  warnings: string[];
};

/** POST /api/spend body. */
export type NewExpenseItem = {
  name: string;
  raw?: string | null;
  qty?: string | null;
  amount_cents: number;
  grocery_list_id?: number | null;
  kind?: ItemKind;
};

export type NewExpense = {
  week_of: string;
  shop: SpendShop;
  merchant?: string | null;
  total_cents: number;
  paid_with: PaidWith;
  spent_on: string;
  note?: string | null;
  receipt_read?: boolean;
  items?: NewExpenseItem[];
};

/** PATCH /api/spend/[id] body: the fields a person can correct after saving. */
export type ExpensePatch = {
  total_cents?: number;
  paid_with?: PaidWith;
  spent_on?: string;
  merchant?: string | null;
  note?: string | null;
};
