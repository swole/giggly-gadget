"use client";

// /spend: what the week's shop cost, who is owed, and the line items behind each receipt.
// Planners only (the route guards it). Realtime, so a total Shallaine saves at the till shows
// here without a refresh.

import { useState } from "react";
import Link from "next/link";
import { formatDollars, formatSgd } from "@/lib/money";
import { addDays, formatDayLong, formatWeekLabel, formatWeekRange } from "@/lib/week";
import { useRole } from "@/components/role/RoleProvider";
import { expenseCents, itemCents, paidWithLabel, tickedWithoutReceipt, totalsByShop, weekTotal } from "@/lib/spend/summary";
import { useExpenses } from "@/lib/spend/useExpenses";
import { SPEND_SHOPS, SPEND_SHOP_LABEL, type Expense, type SpendShop, type SpendState } from "@/lib/spend/types";
import { CoinsIcon, ReceiptIcon, ShopIcon } from "@/components/icons";
import { SpendSheet } from "./SpendSheet";
import type { GroceryRow } from "@/components/GroceryList";

export function SpendPage({
  initial,
  rows,
  trend,
}: {
  initial: SpendState;
  rows: GroceryRow[];
  trend: { week_of: string; cents: number }[];
}) {
  const role = useRole();
  const spend = useExpenses(initial);
  const week = initial.week_of;
  const [open, setOpen] = useState<number | null>(null);
  const [sheetShop, setSheetShop] = useState<SpendShop | null>(null);
  const [paidBack, setPaidBack] = useState<{ ids: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = totalsByShop(spend.expenses);
  const total = weekTotal(spend.expenses);
  const maxBar = Math.max(1, ...trend.map((t) => t.cents));

  async function reimburse(ids: number[], undo = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spend/reimburse", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, undo }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Could not save (${res.status})`);
        return;
      }
      setPaidBack(undo ? null : { ids });
      if (!undo) setTimeout(() => setPaidBack(null), 8000);
      await spend.refresh();
    } catch {
      setError("No connection. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: Expense) {
    if (!confirm(`Remove ${formatSgd(expenseCents(e))} from ${formatDayLong(e.spent_on)}?`)) return;
    try {
      const res = await fetch(`/api/spend/${e.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Could not remove it (${res.status})`);
        return;
      }
      await spend.refresh();
    } catch {
      setError("No connection. Try again.");
    }
  }

  const navBtn =
    "inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-muted)] shadow-[0_1px_3px_-1px_rgba(85,55,25,0.25)] transition-colors hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]";

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <header className="border-b border-[var(--color-line)] pb-5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Spend</span>
          <nav className="flex items-center gap-1 text-[12px] uppercase tracking-[0.06em]" aria-label="Week">
            <Link href={`/spend?week=${addDays(week, -7)}`} className={navBtn} aria-label="Previous week">
              ←
            </Link>
            <span className="px-1 text-[var(--color-muted)]">{formatWeekRange(week)}</span>
            <Link href={`/spend?week=${addDays(week, 7)}`} className={navBtn} aria-label="Next week">
              →
            </Link>
          </nav>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <h1 className="font-display-italic text-4xl leading-none text-[var(--color-ink)]">The week&rsquo;s shop</h1>
          <div className="font-display text-3xl tabular-nums text-[var(--color-terra)]">{formatSgd(total)}</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={`/grocery?week=${week}`} className="btn-quiet min-h-9 px-3 text-[11px] uppercase tracking-[0.08em]">
            Shopping list →
          </Link>
          {/* A real anchor: this is a file download from a route handler, so client navigation
              would fetch the CSV and render nothing. */}
          <a
            href="/api/spend/export"
            download
            className="btn-quiet min-h-9 px-3 text-[11px] uppercase tracking-[0.08em]"
            title="CSV for the household ledger. Card rows carry the key that matches the UOB statement line."
          >
            Export for the ledger
          </a>
        </div>
      </header>

      {!initial.ready && (
        <p className="mt-6 rounded-2xl bg-[var(--color-mustard)]/12 px-4 py-3 text-sm text-[var(--color-ink)]">
          Spend tracking switches on once migration 0008 has run on the database.
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">By shop</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SPEND_SHOPS.map((s) => (
            <div key={s} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">
                <ShopIcon shop={s === "other" ? "either" : s} size={13} />
                {SPEND_SHOP_LABEL[s]}
              </div>
              <div className="font-display mt-1 text-2xl tabular-nums text-[var(--color-ink)]">
                {totals[s].count > 0 ? formatSgd(totals[s].cents) : "—"}
              </div>
              <div className="text-[11px] text-[var(--color-faint)]">{paidWithLabel(totals[s])}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-3.5">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Owed to Shallaine</h2>
        {spend.owed.cents > 0 ? (
          <>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="font-display text-3xl tabular-nums text-[var(--color-terra)]">{formatSgd(spend.owed.cents)}</span>
              {paidBack ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-sage)]">Paid back ✓</span>
                  <button onClick={() => void reimburse(paidBack.ids, true)} disabled={busy} className="btn-quiet px-3 py-1 text-[11px] uppercase tracking-[0.08em]">
                    Undo
                  </button>
                </span>
              ) : (
                <button onClick={() => void reimburse(spend.owed.ids)} disabled={busy} className="btn-ink px-4 py-2 text-[11px] uppercase tracking-[0.08em]">
                  <CoinsIcon size={14} /> Mark paid back
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Her cash since {formatDayLong(spend.owed.since ?? week)}. Pay it as one PayNow of this amount.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {paidBack ? (
              <span className="inline-flex items-center gap-2">
                Paid back ✓
                <button onClick={() => void reimburse(paidBack.ids, true)} disabled={busy} className="btn-quiet px-3 py-1 text-[11px] uppercase tracking-[0.08em]">
                  Undo
                </button>
              </span>
            ) : (
              "Nothing owed."
            )}
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 border-b border-[var(--color-line)] pb-2 font-display text-2xl text-[var(--color-ink)]">
          <span className="text-[var(--color-muted)]" aria-hidden>
            <ReceiptIcon size={19} />
          </span>
          Receipts
          <span className="ml-auto text-[12px] uppercase tracking-[0.06em] text-[var(--color-faint)]">{spend.expenses.length}</span>
        </h2>
        {spend.expenses.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted)]">
            Nothing logged for this week. The money chips on the{" "}
            <Link href={`/grocery?week=${week}`} className="underline">
              shopping list
            </Link>{" "}
            are where it goes in.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {spend.expenses.map((e) => {
              const cents = expenseCents(e);
              const isOpen = open === e.id;
              return (
                <li key={e.id} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
                  <button
                    onClick={() => setOpen(isOpen ? null : e.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg text-[var(--color-ink)]">
                        {e.merchant ?? SPEND_SHOP_LABEL[e.shop]}
                      </span>
                      <span className="block text-xs text-[var(--color-muted)]">
                        {[formatDayLong(e.spent_on), e.paid_with, e.added_by].filter(Boolean).join(", ")}
                        {e.reimbursable && (e.reimbursed_at ? ", paid back ✓" : ", owed")}
                      </span>
                    </span>
                    <span className="font-display shrink-0 text-xl tabular-nums text-[var(--color-ink)]">{formatSgd(cents)}</span>
                    <span className="shrink-0 text-[var(--color-faint)]" aria-hidden>
                      {isOpen ? "▴" : "▾"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[var(--color-line)]/60 px-4 py-3">
                      {e.items.length > 0 ? (
                        <ul className="divide-y divide-[var(--color-line)]/40">
                          {e.items.map((it) => {
                            const listed = it.grocery_list_id !== null ? rows.find((r) => r.id === it.grocery_list_id)?.name : null;
                            return (
                              <li key={it.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                                <span className="min-w-0">
                                  <span className="text-[var(--color-ink)]">
                                    {it.kind === "discount" ? "Discount" : listed ? `✓ ${listed}` : it.name}
                                  </span>
                                  {it.kind === "item" && !listed && (
                                    <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-[var(--color-faint)]">not on the list</span>
                                  )}
                                  {it.raw && <span className="block text-[11px] text-[var(--color-faint)]">{it.raw}</span>}
                                </span>
                                <span className={`shrink-0 tabular-nums ${itemCents(it) < 0 ? "text-[var(--color-sage)]" : "text-[var(--color-body)]"}`}>
                                  {formatSgd(itemCents(it))}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-sm text-[var(--color-muted)]">A total with no lines. {e.paid_with === "cash" ? "Her ticked rows are the list." : "Snap the receipt next time to see the lines."}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => setSheetShop(e.shop)} className="btn-quiet px-3 py-1.5 text-[11px] uppercase tracking-[0.08em]">
                          Fix
                        </button>
                        <button onClick={() => void remove(e)} className="btn-quiet px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-terra-dark)]">
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {(() => {
          const missing = tickedWithoutReceipt(rows, spend.expenses, "supermarket");
          return missing.length > 0 ? (
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Missing from the supermarket receipts: {missing.join(", ")}.
            </p>
          ) : null;
        })()}
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Last {trend.length} weeks</h2>
        <div className="mt-3 flex items-end gap-2">
          {trend.map((t) => (
            <div key={t.week_of} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[11px] tabular-nums text-[var(--color-muted)]">{t.cents > 0 ? formatDollars(t.cents) : ""}</span>
              <div
                className={`w-full rounded-t ${t.week_of === week ? "bg-[var(--color-terra)]" : "bg-[var(--color-sand)]"}`}
                style={{ height: `${Math.max(3, Math.round((t.cents / maxBar) * 96))}px` }}
                aria-hidden
              />
              <span className="truncate text-[10px] uppercase tracking-[0.06em] text-[var(--color-faint)]">{formatWeekLabel(t.week_of)}</span>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-[var(--color-terra-dark)]">{error}</p>}

      {sheetShop && (
        <SpendSheet
          shop={sheetShop}
          week={week}
          expenses={spend.expenses.filter((e) => e.shop === sheetShop)}
          rows={rows}
          role={role}
          onClose={() => setSheetShop(null)}
          onSaved={() => void spend.refresh()}
        />
      )}
    </main>
  );
}
