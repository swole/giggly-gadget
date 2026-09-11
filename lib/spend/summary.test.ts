import { linesDisagree, linesSum, owedOf, paidWithLabel, tickedWithoutReceipt, totalsByShop, trendWeeks, weekTotal } from "./summary";
import type { Expense } from "./types";

const base: Expense = {
  id: 1, week_of: "2026-09-21", shop: "wet_market", merchant: null, total_sgd: "34.20", paid_with: "cash",
  reimbursable: true, reimbursed_at: null, reimbursed_by: null, spent_on: "2026-09-19", added_by: "Shallaine",
  note: null, receipt_read: false, created_at: "", updated_at: "", items: [],
};
const e = (over: Partial<Expense>): Expense => ({ ...base, ...over });

describe("totals", () => {
  const list = [
    e({ id: 1 }),
    e({ id: 2, shop: "supermarket", total_sgd: 62.4, paid_with: "card", reimbursable: false }),
    e({ id: 3, shop: "supermarket", total_sgd: "28.10", paid_with: "card", reimbursable: false }),
  ];
  it("adds by shop in cents and counts cash vs card", () => {
    const t = totalsByShop(list);
    expect(t.wet_market).toMatchObject({ cents: 3420, count: 1, cash: 1, card: 0 });
    expect(t.supermarket).toMatchObject({ cents: 9050, count: 2, cash: 0, card: 2 });
    expect(t.other.cents).toBe(0);
    expect(weekTotal(list)).toBe(12470);
  });
  it("labels how each shop was paid", () => {
    const t = totalsByShop(list);
    expect(paidWithLabel(t.wet_market)).toBe("cash, 1 trip");
    expect(paidWithLabel(t.supermarket)).toBe("card, 2 receipts");
    expect(paidWithLabel(t.other)).toBe("nothing yet");
    expect(paidWithLabel({ count: 3, cash: 1, card: 2 })).toBe("cash and card, 3");
  });
});

describe("owedOf", () => {
  it("sums unpaid reimbursable cash, oldest first", () => {
    const owed = owedOf([
      e({ id: 5, spent_on: "2026-09-26", total_sgd: "10.00" }),
      e({ id: 4, spent_on: "2026-09-19", total_sgd: "34.20" }),
      e({ id: 6, reimbursed_at: "2026-09-20T02:00:00Z", reimbursed_by: "Johnny" }),
      e({ id: 7, reimbursable: false }),
    ]);
    expect(owed).toEqual({ cents: 4420, since: "2026-09-19", ids: [4, 5] });
  });
  it("is empty when nothing is owed", () => {
    expect(owedOf([])).toEqual({ cents: 0, since: null, ids: [] });
  });
});

describe("receipt lines", () => {
  it("sums lines with discounts and flags a gap over 5 cents", () => {
    const sum = linesSum([{ amount_sgd: "18.90" }, { amount_sgd: 3.45 }, { amount_sgd: "-2.00" }]);
    expect(sum).toBe(2035);
    expect(linesDisagree(8875, 8890)).toBe(true);
    expect(linesDisagree(8888, 8890)).toBe(false);
  });
});

describe("trendWeeks", () => {
  it("returns n weeks ending at endWeek with zeros for empty weeks", () => {
    const t = trendWeeks([e({ week_of: "2026-09-21", total_sgd: "10" }), e({ week_of: "2026-09-07", total_sgd: "5.50" }), e({ week_of: "2026-01-05" })], "2026-09-21", 3);
    expect(t).toEqual([
      { week_of: "2026-09-07", cents: 550 },
      { week_of: "2026-09-14", cents: 0 },
      { week_of: "2026-09-21", cents: 1000 },
    ]);
  });
});

describe("tickedWithoutReceipt", () => {
  const rows = [
    { id: 1, name: "milk", shop: "supermarket", checked: true },
    { id: 2, name: "broccoli", shop: "supermarket", checked: true },
    { id: 3, name: "sesame oil", shop: "supermarket", checked: true, staple: true },
    { id: 4, name: "kai lan", shop: "wet_market", checked: true },
    { id: 5, name: "oats", shop: "supermarket", checked: false },
  ];
  it("lists ticked, non-staple rows no receipt line points at", () => {
    const receipt = e({ shop: "supermarket", receipt_read: true, paid_with: "card", reimbursable: false, items: [
      { id: 9, expense_id: 1, position: 0, name: "broccoli", raw: null, qty: null, amount_sgd: "3.45", grocery_list_id: 2, kind: "item" },
    ] });
    expect(tickedWithoutReceipt(rows, [receipt], "supermarket")).toEqual(["milk"]);
  });
  it("says nothing until a receipt was read for that shop", () => {
    expect(tickedWithoutReceipt(rows, [e({ shop: "supermarket", receipt_read: false })], "supermarket")).toEqual([]);
  });
});
