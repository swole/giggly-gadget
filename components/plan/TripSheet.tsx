"use client";

// "Who's out of town?" The sheet behind the planner's Travelling button and the trip
// banner. A trip is the first and the last meal someone misses. The week takes them out
// at read time (lib/plan/travel.ts), so saving or removing a trip never edits a planned meal.
// Portals to <body>: <main> is its own stacking context and a fixed sheet inside it
// renders under the tab bar.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LUNCH_PEOPLE, SLOT_LABEL, type LunchPerson, type Slot, type TripInput, type TripRow } from "@/lib/plan/types";
import { TRIP_EDGE_SLOTS, mealsMissed, parseTripInput, personName, tripRange } from "@/lib/plan/travel";
import { SuitcaseIcon } from "@/components/icons";

const FIELD =
  "min-h-11 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)]/40 px-3 text-sm text-[var(--color-ink)] focus:border-[var(--color-terra)] focus:outline-none";

export function TripSheet({
  trip,
  defaults,
  onSave,
  onDelete,
  onClose,
}: {
  /** The trip being edited, or null for a new one. */
  trip: TripRow | null;
  defaults: TripInput;
  /** Resolves to an error message, or null once saved. */
  onSave: (input: TripInput) => Promise<string | null>;
  onDelete?: () => Promise<boolean>;
  onClose: () => void;
}) {
  const start = trip ?? defaults;
  const [person, setPerson] = useState<LunchPerson>(start.person);
  const [fromDate, setFromDate] = useState(start.from_date);
  const [fromSlot, setFromSlot] = useState<Slot>(start.from_slot);
  const [toDate, setToDate] = useState(start.to_date);
  const [toSlot, setToSlot] = useState<Slot>(start.to_slot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parsed = parseTripInput({ person, from_date: fromDate, from_slot: fromSlot, to_date: toDate, to_slot: toSlot });
  const other = LUNCH_PEOPLE.find((p) => p !== person)!;
  const missed = parsed.ok ? mealsMissed(parsed.trip) : 0;

  async function save() {
    if (!parsed.ok) return setError(parsed.error);
    setBusy(true);
    setError(null);
    const err = await onSave(parsed.trip);
    if (err) {
      setError(err);
      setBusy(false);
    } else onClose();
  }

  async function remove() {
    if (!onDelete) return;
    setBusy(true);
    setError(null);
    if (await onDelete()) onClose();
    else {
      setError("Could not remove the trip. Try again.");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trip-title"
    >
      <div
        className="animate-slide-up max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--color-card)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-3xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
          <SuitcaseIcon size={14} /> Travelling
        </div>
        <h2 id="trip-title" className="font-display mt-1 text-xl text-[var(--color-ink)]">
          {trip ? "Edit the trip" : "Who's out of town?"}
        </h2>

        <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Who is travelling">
          {LUNCH_PEOPLE.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={person === p}
              onClick={() => setPerson(p)}
              className={`min-h-11 flex-1 rounded-full border px-4 text-sm font-medium transition-colors ${
                person === p
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-cream)]"
                  : "border-[var(--color-line)] bg-[var(--color-paper)]/40 text-[var(--color-body)] hover:border-[var(--color-terra)]"
              }`}
            >
              {personName(p)}
            </button>
          ))}
        </div>

        <MealField label="First meal away" date={fromDate} slot={fromSlot} onDate={setFromDate} onSlot={setFromSlot} />
        <MealField label="Last meal away" date={toDate} slot={toSlot} onDate={setToDate} onSlot={setToSlot} />

        <p className="mt-4 rounded-xl bg-[var(--color-mustard)]/12 px-3 py-2.5 text-xs leading-relaxed text-[var(--color-ink)]" aria-live="polite">
          {parsed.ok
            ? `${personName(person)} misses ${missed} meal${missed === 1 ? "" : "s"}: ${tripRange(parsed.trip)}. Those meals cook for ${personName(other)} only, and the shopping list shrinks to match. Leftovers planned from one of them still get the usual amount.`
            : parsed.error}
        </p>
        {error && <p className="mt-3 text-sm text-[var(--color-terra-dark)]">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          {trip && onDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="mr-auto inline-flex min-h-11 items-center text-[11px] uppercase tracking-[0.18em] text-[var(--color-terra-dark)] disabled:opacity-50"
            >
              Remove trip
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-line)] px-4 text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !parsed.ok}
            onClick={() => void save()}
            className="inline-flex min-h-11 items-center rounded-full bg-[var(--color-ink)] px-5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-cream)] hover:bg-[var(--color-terra)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save trip"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MealField({
  label,
  date,
  slot,
  onDate,
  onSlot,
}: {
  label: string;
  date: string;
  slot: Slot;
  onDate: (d: string) => void;
  onSlot: (s: Slot) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="mt-4">
      <label htmlFor={`${id}-date`} className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">
        {label}
      </label>
      <div className="mt-1.5 flex gap-2">
        <input id={`${id}-date`} type="date" value={date} onChange={(e) => onDate(e.target.value)} className={`${FIELD} min-w-0 flex-1`} />
        <select value={slot} onChange={(e) => onSlot(e.target.value as Slot)} className={`${FIELD} w-32`} aria-label={`${label}: which meal`}>
          {TRIP_EDGE_SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
