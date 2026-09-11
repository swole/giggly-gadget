"use client";

// After Claude reads the receipt: the total large and editable, then the lines with what each
// one is on the shopping list. Nothing here has to be touched before saving; the point is that
// a wrong number is visible and fixable in one tap.

import { useMemo, useState } from "react";
import { formatAmount, formatSgd, parseSgd } from "@/lib/money";
import { formatDayLong, isValidYmd, todayInTz } from "@/lib/week";
import { matchReceiptLines } from "@/lib/spend/match";
import { linesDisagree } from "@/lib/spend/summary";
import { sumCents } from "@/lib/money";
import type { NewExpense, ReceiptRead, SpendShop } from "@/lib/spend/types";
import type { GroceryRow } from "@/components/GroceryList";

export function ReceiptReview({
  receipt,
  rows,
  week,
  shop,
  busy,
  onBack,
  onSave,
}: {
  receipt: ReceiptRead;
  rows: GroceryRow[];
  week: string;
  shop: SpendShop;
  busy: boolean;
  onBack: () => void;
  onSave: (payload: NewExpense) => void | Promise<void>;
}) {
  const [merchant, setMerchant] = useState(receipt.merchant ?? "");
  const [spentOn, setSpentOn] = useState(isValidYmd(receipt.spent_on) ? receipt.spent_on : todayInTz());
  const [amount, setAmount] = useState(receipt.total_cents !== null ? String(receipt.total_cents / 100) : "");
  const candidates = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name)), [rows]);
  const [links, setLinks] = useState<(number | null)[]>(() => matchReceiptLines(receipt.lines, candidates));

  const total = parseSgd(amount);
  const sum = sumCents(receipt.lines.map((l) => l.amount_cents));
  const nameOf = (id: number | null) => (id === null ? null : candidates.find((r) => r.id === id)?.name ?? null);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-muted)]">{formatDayLong(spentOn)}</div>
          <h2 id="spend-title" className="font-display-italic mt-1 text-2xl text-[var(--color-ink)]">
            Check the receipt
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() =>
              total &&
              onSave({
                week_of: week,
                shop,
                merchant: merchant.trim() || null,
                total_cents: total,
                paid_with: "card",
                spent_on: spentOn,
                receipt_read: true,
                items: receipt.lines.map((l, i) => ({
                  name: nameOf(links[i]) ?? l.name,
                  raw: l.raw,
                  qty: l.qty,
                  amount_cents: l.amount_cents,
                  grocery_list_id: links[i],
                  kind: l.kind,
                })),
              })
            }
            disabled={busy || !total}
            className="btn-primary px-4 text-[12px] uppercase tracking-[0.06em]"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={onBack} className="btn-quiet px-3 py-1 text-[12px] uppercase tracking-[0.06em]">
            Back
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          aria-label="Shop name"
          placeholder="Shop name"
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-1.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:border-[var(--color-terra)] focus:outline-none"
        />
        <input
          type="date"
          value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)}
          aria-label="Date on the receipt"
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-2 py-1.5 text-[12px] text-[var(--color-ink)]"
        />
      </div>

      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Total paid</div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl text-[var(--color-faint)]">S$</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="decimal"
            aria-label="Total paid"
            placeholder="0.00"
            className="font-display w-full min-w-0 border-b border-[var(--color-line)] bg-transparent pb-1 text-4xl tabular-nums text-[var(--color-ink)] focus:border-[var(--color-terra)] focus:outline-none"
          />
        </div>
      </div>

      {receipt.warnings.map((w) => (
        <p key={w} className="mt-3 rounded-xl bg-[var(--color-mustard)]/15 px-3 py-2 text-xs text-[var(--color-ink)]">
          {w}
        </p>
      ))}

      <ul className="mt-4 divide-y divide-[var(--color-line)]/60">
        {receipt.lines.map((l, i) => {
          const linked = nameOf(links[i]);
          return (
            <li key={`${l.raw}-${i}`} className="flex items-start gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-[var(--color-ink)]">
                  {l.kind === "discount" ? "Discount" : l.kind === "fee" ? l.name : linked ? `✓ ${linked}` : l.name}
                  {l.kind === "item" && !linked && (
                    <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-[var(--color-faint)]">not on the list</span>
                  )}
                </span>
                <span className="block text-[11px] text-[var(--color-faint)]">{l.raw}</span>
                {l.kind === "item" && (
                  <select
                    value={links[i] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      setLinks((prev) => prev.map((x, j) => (j === i ? v : x)));
                    }}
                    aria-label={`What ${l.raw} is on the list`}
                    className="mt-1 max-w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-2 py-1 text-[11px] text-[var(--color-muted)]"
                  >
                    <option value="">not on the list</option>
                    {candidates.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </span>
              <span className={`shrink-0 pt-0.5 text-sm tabular-nums ${l.amount_cents < 0 ? "text-[var(--color-sage)]" : "text-[var(--color-ink)]"}`}>
                {formatAmount(l.amount_cents)}
              </span>
            </li>
          );
        })}
      </ul>

      {receipt.lines.length > 0 && (
        <p className={`mt-3 text-xs ${total !== null && linesDisagree(sum, total) ? "text-[var(--color-mustard)]" : "text-[var(--color-faint)]"}`}>
          Lines add up to {formatSgd(sum)}
          {total !== null && (linesDisagree(sum, total) ? `. The total says ${formatSgd(total)}.` : " ✓")}
        </p>
      )}
    </>
  );
}
