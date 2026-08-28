"use client";

// "Plan this" from a recipe page: pick a day (this week / next week), a slot and who eats,
// and it lands on the plan. Two taps for the common case (today's meal type is preselected).

import Link from "next/link";
import { useEffect, useState } from "react";
import { SLOTS, SLOT_LABEL, type Slot } from "@/lib/plan/types";
import { EATERS, EATERS_SHORT, type Eaters } from "@/lib/portions";
import { addDays, currentWeekMonday, formatDayLabel, formatWeekRange, todayInTz } from "@/lib/week";

const primary =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-ink)] px-5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-cream)] shadow-sm transition-all hover:bg-[var(--color-terra)] active:scale-[0.98] disabled:opacity-50";
const chip = (on: boolean, extra = "") =>
  `inline-flex min-h-10 items-center justify-center rounded-full border px-3 text-[11px] uppercase tracking-[0.14em] transition-colors ${
    on ? "border-[var(--color-terra)] bg-[var(--color-terra)] text-[var(--color-cream)]" : "border-[var(--color-line)] text-[var(--color-muted)]"
  } ${extra}`;

function defaultSlot(mealType: string | null | undefined): Slot {
  const t = (mealType ?? "").toLowerCase();
  if (t === "breakfast") return "breakfast";
  if (t === "lunch") return "lunch";
  if (t === "snack" || t === "dessert") return "snack";
  return "dinner";
}

export function PlanThisButton({ recipeId, mealType, title, nudge = false }: { recipeId: string; mealType: string | null | undefined; title: string; nudge?: boolean }) {
  const [open, setOpen] = useState(nudge);
  const [done, setDone] = useState<{ day: string; slot: Slot } | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-line)] px-4 text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
      >
        <span aria-hidden>▦</span> Plan this
      </button>
      {done && (
        <span className="text-xs text-[var(--color-sage)]">
          ✓ {formatDayLabel(done.day)} {SLOT_LABEL[done.slot].toLowerCase()} ·{" "}
          <Link href={`/plan?week=${currentWeekMonday() <= done.day && done.day <= addDays(currentWeekMonday(), 6) ? currentWeekMonday() : addDays(currentWeekMonday(), 7)}`} className="underline">
            view plan
          </Link>
        </span>
      )}
      {open && (
        <PlanThisSheet
          recipeId={recipeId}
          title={title}
          initialSlot={defaultSlot(mealType)}
          nudge={nudge}
          onClose={() => setOpen(false)}
          onPlanned={(day, slot) => {
            setDone({ day, slot });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

export function PlanThisSheet({
  recipeId,
  title,
  initialSlot,
  nudge,
  onClose,
  onPlanned,
}: {
  recipeId: string;
  title: string;
  initialSlot: Slot;
  nudge?: boolean;
  onClose: () => void;
  onPlanned: (day: string, slot: Slot) => void;
}) {
  const today = todayInTz();
  const thisMonday = currentWeekMonday();
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);
  const monday = addDays(thisMonday, weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [day, setDay] = useState<string>(today >= thisMonday && today <= addDays(thisMonday, 6) ? today : thisMonday);
  const [slot, setSlot] = useState<Slot>(initialSlot);
  const [eaters, setEaters] = useState<Eaters>("both");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planned_for: day, slot, recipe_id: recipeId, eaters }),
      });
      if (res.status === 409) {
        setError("Already on the plan for that day and slot.");
        setBusy(false);
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Could not add (${res.status})`);
        setBusy(false);
        return;
      }
      try { navigator.vibrate?.(10); } catch {}
      onPlanned(day, slot);
    } catch {
      setError("No connection — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--color-ink)]/40 sm:items-center" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-this-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-slide-up w-full max-w-lg rounded-t-3xl bg-[var(--color-card)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-line-soft)] sm:hidden" />
        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-muted)]">{nudge ? "Added to your recipes" : "Plan this"}</div>
        <h2 id="plan-this-title" className="font-display mt-1 text-2xl leading-tight text-[var(--color-ink)]">
          {nudge ? `Put “${title}” on the plan?` : title}
        </h2>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Week</div>
          <div className="flex gap-1">
            {([0, 1] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  const dow = Math.max(0, Math.min(6, daysBetween(monday, day)));
                  setWeekOffset(w);
                  setDay(addDays(thisMonday, w * 7 + dow));
                }}
                className={chip(weekOffset === w)}
              >
                {w === 0 ? "This week" : "Next week"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1 text-xs text-[var(--color-faint)]">{formatWeekRange(monday)}</div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const past = d < today;
            const on = d === day;
            return (
              <button
                key={d}
                type="button"
                disabled={past}
                onClick={() => setDay(d)}
                className={`flex min-h-12 flex-col items-center justify-center rounded-xl border text-[11px] uppercase tracking-[0.1em] transition-colors ${
                  on ? "border-[var(--color-terra)] bg-[var(--color-terra)] text-[var(--color-cream)]" : past ? "border-transparent text-[var(--color-faint)]/50" : "border-[var(--color-line)] text-[var(--color-muted)]"
                }`}
              >
                <span>{formatDayLabel(d).slice(0, 3)}</span>
                <span className="font-display text-base leading-none">{formatDayLabel(d).replace(/^\D+/, "")}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Meal</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SLOTS.map((s) => (
            <button key={s} type="button" onClick={() => setSlot(s)} className={chip(slot === s)}>
              {SLOT_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Who eats</div>
        <div className="mt-2 flex gap-1.5">
          {EATERS.map((e) => (
            <button key={e} type="button" onClick={() => setEaters(e)} className={chip(eaters === e)}>
              {EATERS_SHORT[e]}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-xs text-[var(--color-terra-dark)]">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-line)] px-4 text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            {nudge ? "Not now" : "Cancel"}
          </button>
          <button type="button" onClick={save} disabled={busy} className={primary}>
            {busy ? "Adding…" : `Add to ${formatDayLabel(day)} ${SLOT_LABEL[slot].toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86_400_000);
}
