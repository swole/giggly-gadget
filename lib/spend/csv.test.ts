import { csvCell, reimbursedOn, spendCsvRows, toCsv } from "./csv";
import type { Expense } from "./types";

const base: Expense = {
  id: 1, week_of: "2026-09-21", shop: "supermarket", merchant: "Cold Storage", total_sgd: "62.40", paid_with: "card",
  reimbursable: false, reimbursed_at: null, reimbursed_by: null, spent_on: "2026-09-19", added_by: "Shallaine",
  note: null, receipt_read: true, created_at: "", updated_at: "", items: [],
};
const e = (over: Partial<Expense>): Expense => ({ ...base, ...over });

describe("csvCell / toCsv", () => {
  it("quotes commas, quotes and line breaks, and ends every line with CRLF", () => {
    expect(csvCell('Kit Kat, "4 fingers"')).toBe('"Kit Kat, ""4 fingers"""');
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a", "b"], ["1", "x\ny"]])).toBe('a,b\r\n1,"x\ny"\r\n');
  });
});

describe("reimbursedOn", () => {
  it("dates a reimbursement on the Singapore calendar", () => {
    // 20 Sep 17:30 UTC is 21 Sep 01:30 in Singapore.
    expect(reimbursedOn({ reimbursed_at: "2026-09-20T17:30:00Z" })).toBe("2026-09-21");
    expect(reimbursedOn({ reimbursed_at: null })).toBeNull();
  });
});

describe("spendCsvRows", () => {
  const card = e({
    items: [
      { id: 1, expense_id: 1, position: 1, name: "kit kat", raw: "KIT KAT", qty: null, amount_sgd: "2.80", grocery_list_id: null, kind: "item" },
      { id: 2, expense_id: 1, position: 0, name: "broccoli", raw: "CS FRESH BROCCOLI 300G", qty: "300g", amount_sgd: "3.45", grocery_list_id: 77, kind: "item" },
      { id: 3, expense_id: 1, position: 2, name: "discount", raw: "MEMBER DISCOUNT", qty: null, amount_sgd: "-2.00", grocery_list_id: null, kind: "discount" },
    ],
  });
  const cashA = e({ id: 2, shop: "wet_market", merchant: null, total_sgd: "34.20", paid_with: "cash", reimbursable: true, reimbursed_at: "2026-09-21T02:00:00Z", reimbursed_by: "Johnny", receipt_read: false, spent_on: "2026-09-19" });
  const cashB = e({ id: 3, shop: "wet_market", merchant: null, total_sgd: "10.00", paid_with: "cash", reimbursable: true, reimbursed_at: "2026-09-21T09:00:00Z", reimbursed_by: "Johnny", receipt_read: false, spent_on: "2026-09-12" });
  const cashOpen = e({ id: 4, shop: "wet_market", merchant: null, total_sgd: "8.00", paid_with: "cash", reimbursable: true, receipt_read: false, spent_on: "2026-09-26" });

  const rows = spendCsvRows([card, cashA, cashB, cashOpen], new Map([[77, "broccoli"]]));

  it("writes the header the ledger ingest expects", () => {
    expect(rows[0]).toEqual(["date", "person", "shop", "merchant", "paid_with", "amount_sgd", "reimbursed_on", "charge_key", "items"]);
  });
  it("keys a card receipt on its own date and total, items in till order with the list's names", () => {
    const r = rows.find((x) => x[4] === "card")!;
    expect(r).toEqual(["2026-09-19", "johnny", "supermarket", "Cold Storage", "card", "62.40", "", "2026-09-19|johnny|62.40", "broccoli; kit kat"]);
  });
  it("keys paid-back cash on the PayNow day and the whole day's sum", () => {
    const paid = rows.filter((x) => x[4] === "cash" && x[6] !== "");
    expect(paid.map((x) => x[7])).toEqual(["2026-09-21|johnny|44.20", "2026-09-21|johnny|44.20"]);
  });
  it("leaves unpaid cash without a key, and sorts oldest first", () => {
    expect(rows.slice(1).map((x) => x[0])).toEqual(["2026-09-12", "2026-09-19", "2026-09-19", "2026-09-26"]);
    expect(rows[rows.length - 1][7]).toBe("");
  });
});
