"use client";

// What the shop cost, entered where the trip ends. Opened by the money chip on a shop's
// section in /grocery.
//   wet market  -> a number and a Save. Cash she fronted, which Johnny pays back.
//   supermarket -> snap the receipt (Claude reads it, the photo is dropped), or type the total.
// Portalled to <body>: a fixed panel inside <main> renders under the tab bar (see ScanPanel).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downscaleImage } from "@/lib/image-downscale";
import { formatSgd, parseSgd, toCents } from "@/lib/money";
import { formatDayLong, formatWeekRange, todayInTz } from "@/lib/week";
import { isPlanner, ROLE_LABEL, type Role } from "@/lib/role";
import { expenseCents } from "@/lib/spend/summary";
import { SPEND_SHOP_LABEL, type Expense, type NewExpense, type PaidWith, type ReceiptRead, type SpendShop } from "@/lib/spend/types";
import { CameraIcon, ReceiptIcon } from "@/components/icons";
import { ReceiptReview } from "./ReceiptReview";
import type { GroceryRow } from "@/components/GroceryList";

type Photo = { media_type: "image/jpeg"; data_base64: string };
type Mode = "list" | "amount" | "capture" | "reading" | "review";

export function SpendSheet({
  shop,
  week,
  expenses,
  rows,
  role,
  onClose,
  onSaved,
}: {
  shop: SpendShop;
  week: string;
  /** This week's expenses for this shop, oldest first. */
  expenses: Expense[];
  rows: GroceryRow[];
  role: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const planner = isPlanner(role);
  const cashFirst = shop === "wet_market";
  const [mode, setMode] = useState<Mode>(expenses.length > 0 ? "list" : cashFirst ? "amount" : "capture");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [amount, setAmount] = useState("");
  const [paidWith, setPaidWith] = useState<PaidWith>(cashFirst ? "cash" : "card");
  const [spentOn, setSpentOn] = useState(todayInTz());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [receipt, setReceipt] = useState<ReceiptRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cents = parseSgd(amount);
  const shopLabel = SPEND_SHOP_LABEL[shop];

  function startAmount(expense: Expense | null, initialPaidWith: PaidWith = cashFirst ? "cash" : "card") {
    setEditing(expense);
    setAmount(expense ? String(expenseCents(expense) / 100) : "");
    setPaidWith(expense ? expense.paid_with : initialPaidWith);
    setSpentOn(expense ? expense.spent_on : todayInTz());
    setError(null);
    setMode("amount");
  }

  async function save(body: NewExpense) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Could not save (${res.status})`);
        return false;
      }
      onSaved();
      return true;
    } catch {
      setError("No connection. Try again when you have signal.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveAmount() {
    if (!cents) {
      setError("Type the amount, for example 34.20");
      return;
    }
    if (editing) {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/spend/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ total_cents: cents, paid_with: paidWith, spent_on: spentOn }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? `Could not save (${res.status})`);
          return;
        }
        onSaved();
        setEditing(null);
        setMode("list");
      } catch {
        setError("No connection. Try again when you have signal.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const ok = await save({ week_of: week, shop, total_cents: cents, paid_with: paidWith, spent_on: spentOn });
    if (ok) {
      setAmount("");
      setMode("list");
    }
  }

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const d = await downscaleImage(file, 2200, 0.8); // till print needs more than the 1600 /add uses
      setPhotos((p) => [...p, { media_type: d.media_type, data_base64: d.data_base64 }].slice(0, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function readReceipt() {
    if (photos.length === 0) return;
    setMode("reading");
    setError(null);
    try {
      const res = await fetch("/api/spend/read-receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photos, week_of: week, shop }),
      });
      const j = (await res.json().catch(() => ({}))) as { receipt?: ReceiptRead; error?: string };
      if (!res.ok || !j.receipt) {
        setError(j.error ?? `Could not read it (${res.status})`);
        setMode("capture");
        return;
      }
      setReceipt(j.receipt);
      setPhotos([]);
      setMode("review");
    } catch {
      setError("No connection. Type the total instead.");
      setMode("capture");
    }
  }

  async function removeExpense(e: Expense) {
    setMenuFor(null);
    if (!confirm(`Remove ${formatSgd(expenseCents(e))} from ${formatDayLong(e.spent_on)}?`)) return;
    try {
      const res = await fetch(`/api/spend/${e.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Could not remove it (${res.status})`);
        return;
      }
      onSaved();
    } catch {
      setError("No connection. Try again when you have signal.");
    }
  }

  const header = (title: string, action?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-muted)]">
          {shopLabel}, {formatWeekRange(week)}
        </div>
        <h2 id="spend-title" className="font-display-italic mt-1 text-2xl text-[var(--color-ink)]">
          {title}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        <button onClick={onClose} className="btn-quiet px-3 py-1 text-[12px] uppercase tracking-[0.06em]">
          Close
        </button>
      </div>
    </div>
  );

  const body = (() => {
    if (mode === "review" && receipt) {
      return (
        <ReceiptReview
          receipt={receipt}
          rows={rows}
          week={week}
          shop={shop}
          busy={busy}
          onBack={() => {
            setReceipt(null);
            setMode("capture");
          }}
          onSave={async (payload) => {
            const ok = await save(payload);
            if (ok) {
              setReceipt(null);
              setMode("list");
            }
          }}
        />
      );
    }
    if (mode === "reading") {
      return (
        <>
          {header("Reading the receipt")}
          <div className="flex items-center gap-3 py-10 text-sm text-[var(--color-muted)]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-terra)]" aria-hidden />
            <span aria-live="polite">Reading the receipt. This takes 10 to 30 seconds.</span>
          </div>
        </>
      );
    }
    if (mode === "amount") {
      const cashMine = paidWith === "cash" && (role === "helper" || (editing?.added_by === ROLE_LABEL.helper));
      return (
        <>
          {header(editing ? "Fix the amount" : "How much did you pay?", (
            <button onClick={saveAmount} disabled={busy || !cents} className="btn-primary px-4 text-[12px] uppercase tracking-[0.06em]">
              {busy ? "Saving…" : "Save"}
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveAmount();
            }}
          >
            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-3xl text-[var(--color-faint)]">S$</span>
              <input
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                aria-label="Amount in Singapore dollars"
                placeholder="0.00"
                className="font-display w-full min-w-0 border-b border-[var(--color-line)] bg-transparent pb-1 text-5xl tabular-nums text-[var(--color-ink)] placeholder:text-[var(--color-sand)] focus:border-[var(--color-terra)] focus:outline-none"
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {(["cash", "card"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPaidWith(p)}
                  aria-pressed={paidWith === p}
                  className={`min-h-9 rounded-full border px-3 text-[11px] uppercase tracking-[0.08em] ${
                    paidWith === p
                      ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-cream)]"
                      : "border-[var(--color-line)] text-[var(--color-muted)]"
                  }`}
                >
                  {p === "cash" ? (role === "helper" ? "My cash" : "Cash") : "Card"}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted)]">
                When
                <input
                  type="date"
                  value={spentOn}
                  onChange={(e) => setSpentOn(e.target.value)}
                  aria-label="Date of the shop"
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-2 py-1 text-[12px] normal-case tracking-normal text-[var(--color-ink)]"
                />
              </label>
            </div>
            {cashMine && <p className="mt-3 text-xs text-[var(--color-muted)]">Johnny pays this back.</p>}
            <button type="submit" className="sr-only">
              Save
            </button>
          </form>
        </>
      );
    }
    if (mode === "capture") {
      return (
        <>
          {header("Add a receipt")}
          <div className="mt-5 space-y-3">
            <button onClick={() => fileRef.current?.click()} className="btn-ink w-full py-3 text-[12px] uppercase tracking-[0.08em]">
              <CameraIcon size={16} /> {photos.length === 0 ? "Take a photo of the receipt" : "Add the bottom half"}
            </button>
            {photos.length > 0 && (
              <button onClick={readReceipt} disabled={busy} className="btn-primary w-full py-3 text-[12px] uppercase tracking-[0.08em]">
                Read {photos.length === 1 ? "the photo" : "both photos"}
              </button>
            )}
            <p className="text-xs text-[var(--color-faint)]">
              {photos.length === 0
                ? "Long receipt? Take two photos: the top, then the bottom."
                : `${photos.length} photo${photos.length === 1 ? "" : "s"} ready. The photo is read and then thrown away.`}
            </p>
            <button onClick={() => startAmount(null, "card")} className="btn-quiet w-full py-2.5 text-[12px] uppercase tracking-[0.06em]">
              Type the total instead
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void addPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </>
      );
    }
    // mode === "list"
    return (
      <>
        {header(expenses.length === 1 ? "This week's shop" : "This week's shops")}
        <ul className="mt-4 space-y-2">
          {expenses.map((e) => (
            <li key={e.id} className="relative flex items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)]/40 px-4 py-3">
              <span className="text-[var(--color-muted)]" aria-hidden>
                <ReceiptIcon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg text-[var(--color-ink)]">{formatSgd(expenseCents(e))}</span>
                <span className="block text-xs text-[var(--color-muted)]">
                  {[e.merchant ?? (e.paid_with === "cash" ? "cash" : "card"), formatDayLong(e.spent_on), e.added_by].filter(Boolean).join(", ")}
                  {e.reimbursable && (e.reimbursed_at ? " · paid back ✓" : " · owed to you")}
                </span>
              </span>
              <button
                onClick={() => setMenuFor(menuFor === e.id ? null : e.id)}
                aria-label={`More options for ${formatSgd(expenseCents(e))}`}
                aria-expanded={menuFor === e.id}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-[var(--color-faint)] hover:text-[var(--color-terra)]"
              >
                ⋯
              </button>
              {menuFor === e.id && (
                <div className="absolute right-2 top-full z-10 mt-1 w-44 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] text-sm shadow-lg" role="menu">
                  <button role="menuitem" onClick={() => { setMenuFor(null); startAmount(e); }} className="block min-h-11 w-full px-4 text-left hover:bg-[var(--color-paper)]/60">
                    Fix the amount
                  </button>
                  <button role="menuitem" onClick={() => void removeExpense(e)} className="block min-h-11 w-full px-4 text-left text-[var(--color-terra-dark)] hover:bg-[var(--color-paper)]/60">
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => (cashFirst ? startAmount(null) : setMode("capture"))} className="btn-ink px-4 py-2 text-[12px] uppercase tracking-[0.06em]">
            + Add another
          </button>
          {!cashFirst && (
            <button onClick={() => startAmount(null, "card")} className="btn-quiet px-4 py-2 text-[12px] uppercase tracking-[0.06em]">
              Type a total
            </button>
          )}
          {planner && (
            <a href={`/spend?week=${week}`} className="btn-quiet ml-auto px-4 py-2 text-[12px] uppercase tracking-[0.06em]">
              Spend page →
            </a>
          )}
        </div>
      </>
    );
  })();

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="spend-title"
    >
      <div
        className="animate-slide-up max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--color-card)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-3xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        {body}
        {error && <p className="mt-4 text-sm text-[var(--color-terra-dark)]">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}

/** Sum of one shop's expenses this week, for the chip. */
export function shopCents(expenses: Expense[]): number {
  return expenses.reduce((n, e) => n + (toCents(e.total_sgd) ?? 0), 0);
}
