"use client";

// The week grid. Mobile: days stacked, each with its slot rows. Desktop (sm+): the
// same thing reads fine stacked, so no separate column layout — the planner is
// used from a phone. Sunday is collapsed as the helper's rest day; snack rows are
// collapsed unless they have meals or the planner toggles them on.
//
// Drag and drop (@dnd-kit/core): every meal chip is draggable, every mealtime row is a
// drop target. A mouse drags after 6 px; a finger presses and holds for 250 ms first, so
// a swipe across the week still scrolls it. lib/plan/move.ts decides whether a drop is
// allowed; the lifted chip says where it would land before you let go.

import { thumb } from "@/lib/images";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { LunchLocation, LunchLocationRow, LunchPerson, NewPlannedMeal, PlannedMeal, PlannerRecipe, Slot, TripInput, TripRow } from "@/lib/plan/types";
import { LUNCH_PEOPLE, mealTitle, SLOT_LABEL } from "@/lib/plan/types";
import { LUNCH_PERSON_LABEL, LUNCH_PERSON_SHORT, lunchLocationOf, toggleLunchLocation } from "@/lib/plan/lunch";
import {
  dayChipText,
  eatersChip,
  eatersSentence,
  leftoverSources,
  mealLabel,
  mealTravel,
  travelOnDay,
  travellersAt,
  tripSummary,
  type DayTravel,
  type MealTravel,
} from "@/lib/plan/travel";
import { usePlannedMeals } from "@/lib/plan/usePlannedMeals";
import { EATERS_SHORT, nextEaters } from "@/lib/portions";
import { addDays, formatDayLabel, formatWeekRange, isoDow, weekDates } from "@/lib/week";
import { isPlanner, type Role } from "@/lib/role";
import { useRole } from "@/components/role/RoleProvider";
import { SuitcaseIcon } from "@/components/icons";
import { RecipePickerSheet } from "./RecipePickerSheet";
import { WeekActionsMenu } from "./WeekActionsMenu";
import { RandomizeSheet, loadSavedTheme, type RollScope } from "./RandomizeSheet";
import { ShareWeekButton } from "./ShareWeekButton";
import { TripSheet } from "./TripSheet";
import { Die } from "./Die";
import type { RollFilters } from "@/lib/plan/randomize";
import { weekConstraintStatus, type ProteinClass } from "@/lib/plan/constraints";
import { checkMove, nextPosition, type MoveCheck, type MoveTarget } from "@/lib/plan/move";

const VISIBLE_SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

const mealDragId = (id: number) => `meal:${id}`;
const slotDropId = (day: string, slot: Slot) => `slot:${day}:${slot}`;

// A drag that ends where it started must not also count as a tap on the recipe link.
// dnd-kit stops the click's propagation but not its default, and a Next <Link> whose
// onClick never runs falls back to a full page load.
let lastDropAt = 0;
function swallowClickAfterDrop(e: ReactMouseEvent) {
  if (Date.now() - lastDropAt < 400) {
    e.preventDefault();
    e.stopPropagation();
  }
}

const subscribeNothing = () => () => {};
/** False during server render, true in the browser: the drag overlay portals to <body>. */
function useIsClient() {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

function themeSummary(f: RollFilters): string | null {
  const parts = [
    f.source ? (f.source === "Lydia" ? "Lydia’s picks" : `by ${f.source}`) : null,
    f.healthy ? "healthy" : null,
    f.cuisines?.length ? f.cuisines.join("/") : null,
    f.quick ? "≤30 min" : null,
    f.wantToTry ? "want-to-try" : null,
    f.favourites ? "★4+" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type RollToast = {
  text: string;
  theme: string | null;
  /** The die marks a roll; a move or a refused drop speaks in words alone. */
  die?: boolean;
  again?: () => void;
  undo?: () => void;
  undoLabel?: string;
};

/** A new trip starts on the first day of the viewed week that has not passed, for the person holding the phone. */
function newTripDefaults(role: Role | null, weekOf: string, today: string): TripInput {
  const start = today > weekOf && today <= addDays(weekOf, 6) ? today : weekOf;
  return { person: role === "lydia" ? "lydia" : "johnny", from_date: start, from_slot: "breakfast", to_date: addDays(start, 3), to_slot: "dinner" };
}

export function WeekPlanner({
  weekOf,
  today,
  initialMeals,
  initialLunch = [],
  lunchReady = true,
  initialTrips = [],
  tripsReady = false,
  recipes,
  classByRecipe,
  proteinByRecipe,
  autoForward = false,
}: {
  weekOf: string;
  today: string;
  initialMeals: PlannedMeal[];
  initialLunch?: LunchLocationRow[];
  /** False until migration 0007 exists in this database: the lunch pills stay hidden rather than failing on tap. */
  lunchReady?: boolean;
  initialTrips?: TripRow[];
  /** False until migration 0009 exists: the Travelling button stays hidden. */
  tripsReady?: boolean;
  recipes: PlannerRecipe[];
  classByRecipe: Record<string, ProteinClass[]>;
  proteinByRecipe: Record<string, { j: number; l: number }>;
  autoForward?: boolean;
}) {
  const role = useRole();
  const canEdit = isPlanner(role);
  const { meals, lunch, trips, status, add, remove, patch, move, setLunch, saveTrip, deleteTrip, refetch } = usePlannedMeals(
    weekOf,
    initialMeals,
    undefined,
    initialLunch,
    initialTrips,
  );
  const constraints = useMemo(() => weekConstraintStatus(meals, classByRecipe), [meals, classByRecipe]);
  const withLeftovers = useMemo(() => leftoverSources(meals), [meals]);
  const [tripSheet, setTripSheet] = useState<{ trip: TripRow | null } | null>(null);
  const [picker, setPicker] = useState<{ day: string; slot: Slot } | null>(null);
  const [showSnacks, setShowSnacks] = useState(false);
  const [showSunday, setShowSunday] = useState(false);
  const [noteFor, setNoteFor] = useState<PlannedMeal | null>(null);
  const [undo, setUndo] = useState<{ meal: PlannedMeal; title: string } | null>(null);
  const [rollSheet, setRollSheet] = useState<RollScope | null>(null);
  const [rollToast, setRollToast] = useState<RollToast | null>(null);
  const [rollBusy, setRollBusy] = useState(false);
  const [justRolled, setJustRolled] = useState<Set<number>>(new Set());
  // First-run teach-in-place for the two invisible gestures (replaces the old
  // footer caption nobody scrolled to). Gone forever after "Got it" or a first use.
  // v2 (2026-09-27) added drag and drop, so the tip comes back once for everyone.
  const [showGestureTip, setShowGestureTip] = useState(false);
  useEffect(() => {
    // One-shot read of a persisted dismissal flag — external-system sync on mount.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem("gg-gesture-tip-v2")) setShowGestureTip(true);
    } catch {}
  }, []);
  function dismissGestureTip() {
    setShowGestureTip(false);
    try { localStorage.setItem("gg-gesture-tip-v2", "1"); } catch {}
  }

  const byId = useMemo(() => {
    const m: Record<string, PlannerRecipe> = {};
    for (const r of recipes) m[r.id] = r;
    return m;
  }, [recipes]);

  function showRollToast(t: RollToast | null) {
    setUndo(null);
    setRollToast(t);
    if (t) setTimeout(() => setRollToast((cur) => (cur === t ? null : cur)), 9000);
  }

  /** One POST to the randomizer; used by the slot dice and "pick another". */
  async function rollRequest(body: Record<string, unknown>): Promise<{ added: PlannedMeal[]; added_ids: number[]; error?: string } | null> {
    setRollBusy(true);
    try {
      const res = await fetch("/api/plan/randomize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ week_of: weekOf, filters: loadSavedTheme(), ...body }),
      });
      const j = (await res.json().catch(() => ({}))) as { added?: PlannedMeal[]; added_ids?: number[]; error?: string };
      if (!res.ok) return { added: [], added_ids: [], error: j.error ?? `Failed (${res.status})` };
      return { added: j.added ?? [], added_ids: j.added_ids ?? [] };
    } catch {
      return null;
    } finally {
      setRollBusy(false);
    }
  }

  function flash(ids: number[]) {
    setJustRolled(new Set(ids));
    setTimeout(() => setJustRolled(new Set()), 1200);
  }

  /** Re-roll exactly the given rows (used by toast "Again"). */
  async function rerollIds(ids: number[], theme: string | null) {
    const j = await rollRequest({ replace_ids: ids });
    if (!j || j.error || j.added.length === 0) {
      return showRollToast({ text: j?.error ?? "Nothing else matches — change the theme?", theme });
    }
    void refetch();
    flash(j.added_ids);
    const added = j.added[0];
    showRollToast({
      text: `Rolled ${mealTitle(added, byId)}`,
      theme,
      again: () => void rerollIds(j.added_ids, theme),
      undo: () => void remove(added.id),
      undoLabel: "Undo",
    });
  }

  /** ⋯ menu on a meal: swap it for another idea in the same slot. */
  async function pickAnother(m: PlannedMeal) {
    if (m.recipe_id === null) return; // one-off items have no themed pool to swap from
    const original: NewPlannedMeal = {
      planned_for: m.planned_for,
      slot: m.slot,
      recipe_id: m.recipe_id,
      eaters: m.eaters,
      note: m.note,
      leftover_of: m.leftover_of,
    };
    const theme = themeSummary(loadSavedTheme());
    const j = await rollRequest({ replace_ids: [m.id] });
    if (!j) return showRollToast({ text: "No connection — try again.", theme: null });
    if (j.error) return showRollToast({ text: j.error, theme: null });
    if (j.added.length === 0) {
      await add(original); // the roll deleted it but found nothing: put it straight back
      return showRollToast({ text: "Nothing else matches the theme — kept it", theme });
    }
    void refetch();
    flash(j.added_ids);
    const added = j.added[0];
    showRollToast({
      text: `Swapped for ${mealTitle(added, byId)}`,
      theme,
      again: () => void rerollIds(j.added_ids, theme),
      undo: () => {
        void (async () => {
          await remove(added.id);
          await add(original);
        })();
      },
      undoLabel: "Put back",
    });
  }

  async function removeWithUndo(m: PlannedMeal) {
    const title = mealTitle(m, byId);
    const ok = await remove(m.id);
    if (ok) {
      setRollToast(null);
      setUndo({ meal: m, title });
      setTimeout(() => setUndo((u) => (u && u.meal.id === m.id ? null : u)), 7000);
    }
  }
  async function undoRemove() {
    if (!undo) return;
    const m = undo.meal;
    setUndo(null);
    await add({ planned_for: m.planned_for, slot: m.slot, recipe_id: m.recipe_id, custom_text: m.custom_text, eaters: m.eaters, note: m.note, leftover_of: m.leftover_of });
  }

  // ---- drag and drop ----
  const isClient = useIsClient();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Phones: press and hold first, so a swipe that starts on a meal still scrolls the week.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<MoveTarget | null>(null);
  const dragMeal = dragId === null ? null : (meals.find((m) => m.id === dragId) ?? null);
  const dropCheck = (to: MoveTarget): MoveCheck | null => (dragMeal ? checkMove(dragMeal, to, meals) : null);
  const overCheck = dragOver ? dropCheck(dragOver) : null;
  const dragCaption =
    dragOver && overCheck && !(overCheck.ok && overCheck.same)
      ? overCheck.ok
        ? { ok: true, text: `Move to ${mealLabel(dragOver.planned_for, dragOver.slot)}` }
        : { ok: false, text: overCheck.message }
      : null;

  const mealOf = (dragData: unknown) => {
    const id = (dragData as { mealId?: number } | undefined)?.mealId;
    return id === undefined ? undefined : meals.find((m) => m.id === id);
  };
  const targetOf = (dropData: unknown) => (dropData as MoveTarget | undefined) ?? null;

  function onDragStart(e: DragStartEvent) {
    const m = mealOf(e.active.data.current);
    if (!m) return;
    setDragId(m.id);
    setDragOver(null);
    try { navigator.vibrate?.(10); } catch {}
  }
  function onDragOver(e: DragOverEvent) {
    setDragOver(targetOf(e.over?.data.current));
  }
  function endDrag() {
    lastDropAt = Date.now();
    setDragId(null);
    setDragOver(null);
  }
  async function onDragEnd(e: DragEndEvent) {
    endDrag();
    const m = mealOf(e.active.data.current);
    const to = targetOf(e.over?.data.current);
    if (!m || !to) return;
    const check = checkMove(m, to, meals);
    if (check.ok && check.same) return;
    if (!check.ok) return showRollToast({ text: check.message, theme: null, die: false });
    const from = { planned_for: m.planned_for, slot: m.slot, position: m.position };
    flash([m.id]);
    const res = await move(m.id, { ...to, position: nextPosition(meals, m.id, to) });
    if (!res.ok) return showRollToast({ text: res.error, theme: null, die: false });
    showRollToast({
      text: `Moved to ${mealLabel(to.planned_for, to.slot)}`,
      theme: null,
      die: false,
      undo: () => {
        void (async () => {
          flash([m.id]);
          const back = await move(m.id, from);
          if (!back.ok) showRollToast({ text: back.error, theme: null, die: false });
        })();
      },
      undoLabel: "Undo",
    });
  }

  // Screen-reader lines in words (dnd-kit's defaults read "draggable item meal:12").
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const m = mealOf(active.data.current);
      return m ? `Picked up ${mealTitle(m, byId)}.` : undefined;
    },
    onDragOver: ({ over }) => {
      const to = targetOf(over?.data.current);
      return to ? `Over ${mealLabel(to.planned_for, to.slot)}.` : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const m = mealOf(active.data.current);
      const to = targetOf(over?.data.current);
      if (!m) return undefined;
      if (!to) return `${mealTitle(m, byId)} stays on ${mealLabel(m.planned_for, m.slot)}.`;
      const check = checkMove(m, to, meals);
      if (!check.ok) return check.message;
      return check.same ? `${mealTitle(m, byId)} stays on ${mealLabel(m.planned_for, m.slot)}.` : `Moved ${mealTitle(m, byId)} to ${mealLabel(to.planned_for, to.slot)}.`;
    },
    onDragCancel: ({ active }) => {
      const m = mealOf(active.data.current);
      return m ? `Cancelled. ${mealTitle(m, byId)} stays on ${mealLabel(m.planned_for, m.slot)}.` : undefined;
    },
  };


  const days = weekDates(weekOf);
  const hasSnacks = meals.some((m) => m.slot === "snack");
  const slots: Slot[] = showSnacks || hasSnacks ? [...VISIBLE_SLOTS, "snack"] : VISIBLE_SLOTS;
  const sundayMeals = meals.filter((m) => isoDow(m.planned_for) === 6);
  const prev = addDays(weekOf, -7);
  const next = addDays(weekOf, 7);
  const isCurrent = today >= weekOf && today <= addDays(weekOf, 6);

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-6">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Plan</span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-faint)]">
            {status === "live" ? "● live" : status === "reconnecting" ? "○ reconnecting" : ""}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display-italic text-4xl leading-none text-[var(--color-ink)] sm:text-5xl">
              {isCurrent ? "This week" : autoForward ? "Next week" : "Week of"}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              {formatWeekRange(weekOf)}
              {autoForward && (
                <>
                  {" · "}
                  <Link href={`/plan?week=${prev}`} className="text-[var(--color-terra-dark)] underline-offset-2 hover:underline">
                    still in {formatWeekRange(prev)} ←
                  </Link>
                </>
              )}
            </p>
          </div>
          <nav className="flex shrink-0 items-center gap-1.5 text-[12px] uppercase tracking-[0.06em]">
            <Link href={`/plan?week=${prev}`} className="btn-quiet whitespace-nowrap px-3 py-1.5">
              ← Prev
            </Link>
            <Link href={`/plan?week=${next}`} className="btn-quiet whitespace-nowrap px-3 py-1.5">
              Next →
            </Link>
          </nav>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {constraints.map((c) => (
            <span
              key={c.key}
              title={`${c.label}: ${c.count} this week, target ${c.target}`}
              className={
                c.state === "violated"
                  ? "rounded-full bg-[var(--color-terra)] px-3 py-1 text-[11px] font-semibold text-[var(--color-cream)] shadow-[0_1px_4px_-1px_rgba(92,31,18,0.5)]"
                  : c.state === "met"
                    ? "py-1 text-[11px] font-medium text-[var(--color-sage)]"
                    : "py-1 text-[11px] text-[var(--color-muted)]"
              }
            >
              {c.text}
            </span>
          ))}
          {canEdit && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {meals.length > 0 && (
                <button
                  onClick={() => setRollSheet({ kind: "week" })}
                  className="btn-primary whitespace-nowrap px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                >
                  <Die size={13} /> Randomize
                </button>
              )}
              <ShareWeekButton weekOf={weekOf} meals={meals} byId={byId} lunch={lunch} trips={trips} />
              <Link href={`/plan/print?week=${weekOf}`} className="btn-quiet px-3 py-1.5 text-[11px] uppercase tracking-[0.08em]">
                Print
              </Link>
              {tripsReady && (
                <button
                  onClick={() => setTripSheet({ trip: null })}
                  className="btn-quiet whitespace-nowrap px-3 py-1.5 text-[11px] uppercase tracking-[0.08em]"
                  title="Mark someone as out of town"
                >
                  <SuitcaseIcon size={13} /> Travelling
                </button>
              )}
              <WeekActionsMenu weekOf={weekOf} onDone={() => void refetch()} />
            </div>
          )}
        </div>
        {!canEdit && (
          <p className="mt-3 rounded-xl bg-[var(--color-paper-2)]/50 px-3 py-2 text-xs text-[var(--color-muted)]">
            Read-only view. Johnny and Lydia plan the week; switch person from the bar below to edit.
          </p>
        )}
        {trips.length > 0 && (
          <ul className="mt-4 space-y-2" aria-label="Travelling this week">
            {trips.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-mustard)]/50 bg-[var(--color-mustard)]/12 px-4 py-2.5 text-sm text-[var(--color-ink)]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SuitcaseIcon size={16} className="shrink-0 text-[var(--color-terra-dark)]" />
                  <span className="min-w-0">{tripSummary(t)}</span>
                </span>
                {canEdit && (
                  <button
                    onClick={() => setTripSheet({ trip: t })}
                    className="btn-quiet shrink-0 px-3 py-1 text-[11px] uppercase tracking-[0.08em]"
                    aria-label={`Edit trip: ${tripSummary(t)}`}
                  >
                    Edit
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </header>

      {canEdit && meals.length > 0 && showGestureTip && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl bg-[var(--color-paper-2)]/50 px-4 py-3 text-xs leading-relaxed text-[var(--color-body)]">
          <span>
            Press and hold a meal, then drag it to another day or mealtime. Tap the{" "}
            <span className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-1.5 py-0.5 text-[10px] font-semibold">J+L</span> badge
            to change who&rsquo;s eating. The ⋯ holds notes, a themed swap, and remove.
          </span>
          <button onClick={dismissGestureTip} className="btn-quiet shrink-0 px-3 py-1 text-[11px] uppercase tracking-[0.08em]">
            Got it
          </button>
        </div>
      )}

      {canEdit && meals.length === 0 && (
        <div className="card-lift mb-5 rounded-2xl border border-dashed border-[var(--color-terra)]/50 bg-[var(--color-card)] px-4 py-4 sm:px-5">
          <p className="font-display text-lg text-[var(--color-ink)]">A blank week, all yours.</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Roll it from a theme — Lydia&rsquo;s picks, heart healthy, Chinese, quick — or add dish by dish below.
          </p>
          <button
            onClick={() => setRollSheet({ kind: "week" })}
            className="btn-primary mt-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
          >
            <Die size={13} /> Randomize the week
          </button>
        </div>
      )}

      <DndContext
        id="plan-dnd"
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={(e) => void onDragEnd(e)}
        onDragCancel={endDrag}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: "Press and hold a meal, then drag it to another day or mealtime." },
        }}
      >
        <div className="space-y-5">
          {days.slice(0, 6).map((d) => (
            <DayCard
              key={d}
              day={d}
              isToday={d === today}
              slots={slots}
              meals={meals.filter((m) => m.planned_for === d)}
              byId={byId}
              proteinByRecipe={proteinByRecipe}
              canEdit={canEdit}
              rollBusy={rollBusy}
              justRolled={justRolled}
              onAdd={(slot) => setPicker({ day: d, slot })}
              onRemove={removeWithUndo}
              onNote={setNoteFor}
              onCycleEaters={(m) => patch(m.id, { eaters: nextEaters(m.eaters) })}
              onRollDay={() => setRollSheet({ kind: "day", day: d })}
              onRollSlot={(slot) => setRollSheet({ kind: "slot", day: d, slot })}
              onPickAnother={(m) => void pickAnother(m)}
              lunch={lunch}
              lunchReady={lunchReady}
              onSetLunch={(p, l) => void setLunch(d, p, l)}
              trips={trips}
              withLeftovers={withLeftovers}
              onEditTrip={(t) => setTripSheet({ trip: t })}
              dropCheck={(slot) => dropCheck({ planned_for: d, slot })}
            />
          ))}

          {/* Sunday: rest day, collapsed */}
          <div className="rounded-2xl border border-dashed border-[var(--color-line)]/80 px-4 py-3">
            <button
              onClick={() => setShowSunday((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="font-display text-lg text-[var(--color-muted)]">
                {formatDayLabel(days[6])} <span className="text-sm italic">· rest day</span>
              </span>
              <span className="text-[12px] uppercase tracking-[0.06em] text-[var(--color-faint)]">
                {sundayMeals.length > 0 ? `${sundayMeals.length} planned` : showSunday ? "Hide" : "Plan anyway"}
              </span>
            </button>
            {(showSunday || sundayMeals.length > 0) && (
              <div className="mt-3">
                <DayCard
                  day={days[6]}
                  isToday={days[6] === today}
                  slots={slots}
                  meals={sundayMeals}
                  byId={byId}
                  proteinByRecipe={proteinByRecipe}
                  canEdit={canEdit}
                  rollBusy={rollBusy}
                  justRolled={justRolled}
                  onAdd={(slot) => setPicker({ day: days[6], slot })}
                  onRemove={removeWithUndo}
                  onNote={setNoteFor}
                  onCycleEaters={(m) => patch(m.id, { eaters: nextEaters(m.eaters) })}
                  onRollDay={() => setRollSheet({ kind: "day", day: days[6] })}
                  onRollSlot={(slot) => setRollSheet({ kind: "slot", day: days[6], slot })}
                  onPickAnother={(m) => void pickAnother(m)}
                  lunch={lunch}
                  lunchReady={lunchReady}
                  onSetLunch={(p, l) => void setLunch(days[6], p, l)}
                  trips={trips}
                  withLeftovers={withLeftovers}
                  onEditTrip={(t) => setTripSheet({ trip: t })}
                  dropCheck={(slot) => dropCheck({ planned_for: days[6], slot })}
                  bare
                />
              </div>
            )}
          </div>
        </div>

        {/* The lifted chip. Portalled: <main> is its own stacking context, so a fixed layer
            inside it renders under the tab bar. No drop animation: the chip is already in
            its new row (with the rolled-in flash) by the time the finger lifts. */}
        {isClient &&
          createPortal(
            <DragOverlay dropAnimation={null} zIndex={70}>
              {dragMeal ? (
                <DragFace
                  meal={dragMeal}
                  recipe={dragMeal.recipe_id ? byId[dragMeal.recipe_id] : undefined}
                  eaters={eatersChip(mealTravel(dragMeal, trips, withLeftovers.has(dragMeal.id)).eaters)}
                  caption={dragCaption}
                />
              ) : null}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>

      {canEdit && !hasSnacks && (
        <div className="mt-6">
          <button onClick={() => setShowSnacks((v) => !v)} className="btn-quiet px-3 py-1.5 text-[11px] uppercase tracking-[0.08em]">
            {showSnacks ? "Hide snack row" : "+ Snack row"}
          </button>
        </div>
      )}

      {rollToast && !undo && (
        <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-2xl bg-[var(--color-ink)] px-4 py-3 text-sm text-[var(--color-cream)] shadow-xl" role="status">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className={rollToast.die === false ? "line-clamp-2 block" : "block truncate"}>
                {rollToast.die !== false && <Die size={12} className="mr-1.5 inline-block align-[-1px] text-[var(--color-mustard)]" />}
                {rollToast.text}
              </span>
              {rollToast.theme && <span className="block truncate text-[11px] uppercase tracking-[0.08em] text-[var(--color-cream)]/60">theme: {rollToast.theme}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {rollToast.again && (
                <button
                  onClick={rollToast.again}
                  disabled={rollBusy}
                  className="rounded-full border border-[var(--color-cream)]/40 px-3 py-1 text-[12px] uppercase tracking-[0.06em] hover:bg-[var(--color-cream)]/10 disabled:opacity-50"
                >
                  {rollBusy ? "…" : "Again"}
                </button>
              )}
              {rollToast.undo && (
                <button
                  onClick={() => {
                    rollToast.undo?.();
                    setRollToast(null);
                  }}
                  className="rounded-full border border-[var(--color-cream)]/40 px-3 py-1 text-[12px] uppercase tracking-[0.06em] hover:bg-[var(--color-cream)]/10"
                >
                  {rollToast.undoLabel ?? "Undo"}
                </button>
              )}
            </span>
          </div>
        </div>
      )}

      {undo && (
        <div className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-[var(--color-ink)] px-4 py-3 text-sm text-[var(--color-cream)] shadow-xl" role="status">
          <span className="truncate">Removed {undo.title}</span>
          <button onClick={undoRemove} className="shrink-0 rounded-full border border-[var(--color-cream)]/40 px-3 py-1 text-[12px] uppercase tracking-[0.06em] hover:bg-[var(--color-cream)]/10">
            Undo
          </button>
        </div>
      )}

      {rollSheet && canEdit && (
        <RandomizeSheet
          scope={rollSheet}
          weekOf={weekOf}
          meals={meals}
          recipes={recipes}
          onDone={() => void refetch()}
          onClose={() => setRollSheet(null)}
        />
      )}

      {tripSheet && canEdit && (
        <TripSheet
          trip={tripSheet.trip}
          defaults={newTripDefaults(role, weekOf, today)}
          onSave={(input) => saveTrip(input, tripSheet.trip?.id)}
          onDelete={tripSheet.trip ? () => deleteTrip(tripSheet.trip!.id) : undefined}
          onClose={() => setTripSheet(null)}
        />
      )}

      {noteFor && (
        <NoteSheet
          meal={noteFor}
          title={mealTitle(noteFor, byId)}
          onClose={() => setNoteFor(null)}
          onSave={async (note) => {
            await patch(noteFor.id, { note });
            setNoteFor(null);
          }}
        />
      )}

      {picker && canEdit && (
        <RecipePickerSheet
          day={picker.day}
          slot={picker.slot}
          recipes={recipes}
          pairWith={meals
            .filter((m) => m.planned_for === picker.day && m.slot === picker.slot && m.recipe_id !== null && m.leftover_of === null)
            .map((m) => byId[m.recipe_id!])
            .filter((r): r is PlannerRecipe => !!r)}
          leftoverCandidates={meals
            .filter((m): m is PlannedMeal & { recipe_id: string } => m.recipe_id !== null && m.leftover_of === null && m.planned_for <= picker.day && !(m.planned_for === picker.day && m.slot === picker.slot))
            .map((m) => ({ id: m.id, recipe_id: m.recipe_id, planned_for: m.planned_for, slot: m.slot, title: byId[m.recipe_id]?.title ?? "Recipe" }))}
          onPick={async (recipeId) => {
            await add({ planned_for: picker.day, slot: picker.slot, recipe_id: recipeId });
          }}
          onPickCustom={async (text) => {
            await add({ planned_for: picker.day, slot: picker.slot, custom_text: text });
          }}
          onPickLeftover={async (plannedMealId, recipeId) => {
            await add({ planned_for: picker.day, slot: picker.slot, recipe_id: recipeId, leftover_of: plannedMealId });
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </main>
  );
}

function DayCard({
  day,
  isToday,
  slots,
  meals,
  byId,
  proteinByRecipe,
  canEdit,
  rollBusy,
  justRolled,
  onAdd,
  onRemove,
  onNote,
  onCycleEaters,
  onRollDay,
  onRollSlot,
  onPickAnother,
  lunch,
  lunchReady,
  onSetLunch,
  trips,
  withLeftovers,
  onEditTrip,
  dropCheck,
  bare = false,
}: {
  day: string;
  isToday: boolean;
  slots: Slot[];
  meals: PlannedMeal[];
  byId: Record<string, PlannerRecipe>;
  proteinByRecipe: Record<string, { j: number; l: number }>;
  canEdit: boolean;
  rollBusy: boolean;
  justRolled: Set<number>;
  onAdd: (slot: Slot) => void;
  onRemove: (m: PlannedMeal) => void;
  onNote: (m: PlannedMeal) => void;
  onCycleEaters: (m: PlannedMeal) => void;
  onRollDay: () => void;
  onRollSlot: (slot: Slot) => void;
  onPickAnother: (m: PlannedMeal) => void;
  lunch: LunchLocationRow[];
  lunchReady: boolean;
  onSetLunch: (person: LunchPerson, location: LunchLocation) => void;
  trips: TripRow[];
  withLeftovers: Set<number>;
  onEditTrip: (t: TripRow) => void;
  /** While a meal is being dragged: may it land on this day's mealtime? null when nothing is held. */
  dropCheck: (slot: Slot) => MoveCheck | null;
  bare?: boolean;
}) {
  const travelOf = (m: PlannedMeal) => mealTravel(m, trips, withLeftovers.has(m.id));
  const away: DayTravel[] = travelOnDay(trips, day);
  // Protein for the day from the heart-healthy recipes' notes (J / L grams). Partial when a recipe has none.
  // One-off items (no recipe) don't count as missing — they're extras, not mains. A traveller eats none of it.
  const protein = meals.reduce(
    (acc, m) => {
      if (m.recipe_id === null) return acc;
      const p = proteinByRecipe[m.recipe_id];
      if (!p) return { ...acc, missing: acc.missing + 1 };
      const eaters = travelOf(m).eaters;
      if (eaters === null) return acc;
      if (eaters === "johnny") return { ...acc, j: acc.j + p.j };
      if (eaters === "lydia") return { ...acc, l: acc.l + p.l };
      return { ...acc, j: acc.j + p.j, l: acc.l + p.l };
    },
    { j: 0, l: 0, missing: 0 },
  );
  const showProtein = meals.length > 0 && protein.j + protein.l > 0;
  return (
    <section
      className={
        bare
          ? ""
          : `card-lift rounded-2xl border bg-[var(--color-card)] ${
              isToday ? "border-[var(--color-terra)]/70" : "border-[var(--color-line)]"
            }`
      }
    >
      {!bare && (
        <div className="flex items-center justify-between border-b border-[var(--color-line)]/60 px-4 py-2.5">
          <h2 className="font-display text-xl text-[var(--color-ink)]">{formatDayLabel(day)}</h2>
          <span className="ml-3 flex items-center gap-2">
            {showProtein && (
              <span
                className="text-[11px] uppercase tracking-[0.08em] tabular-nums text-[var(--color-muted)]"
                title={`Protein from the recipes' notes${protein.missing ? ` (${protein.missing} meal${protein.missing > 1 ? "s" : ""} without a figure)` : ""}. Targets J 110-150 g, L 70-80 g.`}
              >
                protein J {protein.j} · L {protein.l}{protein.missing ? " +" : ""}
              </span>
            )}
            {isToday && (
              <span className="rounded-full bg-[var(--color-terra)] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-cream)]">
                Today
              </span>
            )}
            {canEdit && (
              <button
                onClick={onRollDay}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)]/70 bg-[var(--color-card)] text-base leading-none text-[var(--color-muted)] transition-colors hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
                title={`Randomize ${formatDayLabel(day)}`}
                aria-label={`Randomize ${formatDayLabel(day)}`}
              >
                <Die size={14} />
              </button>
            )}
          </span>
        </div>
      )}
      {away.map((dt) => (
        <button
          key={dt.person}
          type="button"
          onClick={canEdit ? () => onEditTrip(dt.trip) : undefined}
          disabled={!canEdit}
          className={`flex w-full items-center gap-2 border-b border-[var(--color-mustard)]/40 bg-[var(--color-mustard)]/10 px-4 py-1.5 text-left text-xs text-[var(--color-ink)] ${canEdit ? "hover:bg-[var(--color-mustard)]/20" : ""}`}
          aria-label={`${dayChipText(dt)}.${canEdit ? " Tap to edit the trip." : ""}`}
        >
          <SuitcaseIcon size={13} className="shrink-0 text-[var(--color-terra-dark)]" />
          {dayChipText(dt)}
        </button>
      ))}
      <div className={bare ? "" : "px-2 py-1"}>
        {slots.map((slot) => {
          const ms = meals.filter((m) => m.slot === slot);
          return (
            <SlotRow key={slot} day={day} slot={slot} canEdit={canEdit} check={dropCheck(slot)}>
              <div className="w-16 shrink-0 pt-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-muted)]">
                {SLOT_LABEL[slot]}
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1.5">
                {ms.map((m) => (
                  <MealChip
                    key={m.id}
                    meal={m}
                    travel={travelOf(m)}
                    recipe={m.recipe_id ? byId[m.recipe_id] : undefined}
                    canEdit={canEdit}
                    flash={justRolled.has(m.id)}
                    onRemove={() => onRemove(m)}
                    onNote={() => onNote(m)}
                    onCycleEaters={() => onCycleEaters(m)}
                    onPickAnother={() => onPickAnother(m)}
                  />
                ))}
                <div className="flex flex-wrap items-center gap-1.5">
                  {canEdit && (
                    <button
                      onClick={() => onAdd(slot)}
                      className="inline-flex min-h-9 items-center rounded-full border border-dashed border-[var(--color-line)] bg-[var(--color-paper)]/25 px-3 text-[12px] font-medium text-[var(--color-muted)] transition-colors hover:border-[var(--color-terra)] hover:bg-[var(--color-terra)]/5 hover:text-[var(--color-terra)]"
                      aria-label={`Add to ${SLOT_LABEL[slot]}`}
                    >
                      + Add
                    </button>
                  )}
                  {canEdit && ms.length === 0 && (
                    <button
                      onClick={() => onRollSlot(slot)}
                      disabled={rollBusy}
                      className="inline-flex min-h-9 items-center rounded-full border border-dashed border-[var(--color-line)] bg-[var(--color-paper)]/25 px-2.5 text-sm leading-none text-[var(--color-muted)] transition-colors hover:border-[var(--color-terra)] hover:bg-[var(--color-terra)]/5 hover:text-[var(--color-terra)] disabled:opacity-50"
                      title={`Surprise ${SLOT_LABEL[slot].toLowerCase()} — pick a theme and roll`}
                      aria-label={`Surprise ${SLOT_LABEL[slot].toLowerCase()} — pick a theme and roll`}
                    >
                      <Die size={14} className={rollBusy ? "animate-dice" : ""} />
                    </button>
                  )}
                  {!canEdit && ms.length === 0 && <span className="text-xs text-[var(--color-faint)]">—</span>}
                  {slot === "lunch" && lunchReady && (canEdit || ms.length > 0) && (
                    <LunchPills day={day} rows={lunch} canEdit={canEdit} onSet={onSetLunch} travelling={travellersAt(trips, day, "lunch")} />
                  )}
                </div>
              </div>
            </SlotRow>
          );
        })}
      </div>
    </section>
  );
}

/** One mealtime row of a day, and a drop target while a meal is held over it. The highlight
 *  is paint only (tint + inset ring, no size change), so the rects dnd-kit measured when the
 *  drag began stay true. A row that refuses the meal only dims: the caption on the held
 *  chip says why, and a ring there would read as "yes". */
function SlotRow({ day, slot, canEdit, check, children }: { day: string; slot: Slot; canEdit: boolean; check: MoveCheck | null; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: slotDropId(day, slot), data: { planned_for: day, slot } satisfies MoveTarget, disabled: !canEdit });
  const lit = isOver && check !== null && !(check.ok && check.same);
  return (
    <div
      ref={setNodeRef}
      data-slot={`${day}:${slot}`}
      data-drop={lit ? (check.ok ? "ok" : "refused") : undefined}
      className={`flex gap-3 border-b px-2 py-2 transition-[background-color,box-shadow] duration-150 last:border-b-0 ${
        !lit
          ? "border-[var(--color-line)]/40"
          : check.ok
            ? "rounded-xl border-transparent bg-[var(--color-terra)]/10 ring-2 ring-inset ring-[var(--color-terra)]/60"
            : "rounded-xl border-transparent bg-[var(--color-ink)]/5"
      }`}
    >
      {children}
    </div>
  );
}

/** A meal's picture: the recipe photo, its initial, or the pencil of a one-off. */
function MealThumb({ meal, recipe }: { meal: PlannedMeal; recipe: PlannerRecipe | undefined }) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ${meal.recipe_id === null ? "border border-[var(--color-line)] bg-[var(--color-paper)]/40 text-[13px] text-[var(--color-muted)]" : "bg-[var(--color-paper-2)]"}`}>
      {meal.recipe_id === null ? (
        <span aria-hidden>✎</span>
      ) : recipe?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb(recipe.image_url, 96)!} alt="" draggable={false} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden className="font-display text-sm text-[var(--color-faint)]">{(recipe?.title ?? "?").slice(0, 1)}</span>
      )}
    </span>
  );
}

/** The meal as it looks in the hand: lifted off the page, tilted a touch, with a line
 *  above it saying where it would land (or why it can't). */
function DragFace({
  meal,
  recipe,
  eaters,
  caption,
}: {
  meal: PlannedMeal;
  recipe: PlannerRecipe | undefined;
  eaters: string;
  caption: { ok: boolean; text: string } | null;
}) {
  return (
    <div className="relative h-full w-full cursor-grabbing">
      {caption && (
        <span
          aria-hidden
          // no wider than the held chip, which is already on screen: a long reason wraps
          className={`absolute bottom-full left-1 mb-2 w-max max-w-full text-balance rounded-2xl px-3 py-1 text-[12px] font-medium leading-snug shadow-md ${
            caption.ok
              ? "bg-[var(--color-ink)] text-[var(--color-cream)]"
              : "border border-[var(--color-terra)]/50 bg-[var(--color-cream)] text-[var(--color-terra-dark)]"
          }`}
        >
          {caption.text}
        </span>
      )}
      <div className="animate-lift flex h-full w-full -rotate-1 scale-[1.02] items-center gap-2.5 rounded-xl border border-[var(--color-terra)]/70 bg-[var(--color-card)] py-1.5 pl-1.5 pr-2 text-[13px] shadow-[0_18px_34px_-14px_rgba(85,55,25,0.6)]">
        <MealThumb meal={meal} recipe={recipe} />
        <span className="line-clamp-2 min-w-0 flex-1 leading-tight text-[var(--color-ink)]">
          {meal.leftover_of !== null && <span className="text-[var(--color-muted)]">Leftovers · </span>}
          {meal.recipe_id === null ? meal.custom_text : (recipe?.title ?? "Recipe")}
        </span>
        <span className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-paper)]/50 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-body)]">
          {eaters}
        </span>
      </div>
    </div>
  );
}

/** Lunch row only: one pill per planner, "J · home" or "J · office". Tap flips it; Shallaine sees it read-only.
 *  Someone travelling at lunch gets a fixed "J away" pill: there is no lunch to pack. */
function LunchPills({
  day,
  rows,
  canEdit,
  onSet,
  travelling = [],
}: {
  day: string;
  rows: LunchLocationRow[];
  canEdit: boolean;
  onSet: (person: LunchPerson, location: LunchLocation) => void;
  travelling?: LunchPerson[];
}) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      {LUNCH_PEOPLE.map((p) => {
        if (travelling.includes(p)) {
          return (
            <span
              key={p}
              className="inline-flex min-h-7 items-center rounded-full border border-dashed border-[var(--color-line)] px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-faint)]"
              title={`${LUNCH_PERSON_LABEL[p]} is travelling`}
              aria-label={`${LUNCH_PERSON_LABEL[p]} is travelling at lunch.`}
            >
              {LUNCH_PERSON_SHORT[p]} away
            </span>
          );
        }
        const loc = lunchLocationOf(rows, day, p);
        const office = loc === "office";
        const where = office ? "packed for the office" : "at home";
        return (
          <button
            key={p}
            onClick={canEdit ? () => onSet(p, toggleLunchLocation(loc)) : undefined}
            disabled={!canEdit}
            className={`inline-flex min-h-7 items-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              office
                ? "border-[var(--color-terra)]/70 bg-[var(--color-terra)]/10 text-[var(--color-terra-dark)]"
                : "border-[var(--color-line)] bg-[var(--color-paper)]/50 text-[var(--color-muted)]"
            } ${canEdit ? "hover:border-[var(--color-terra)]" : ""}`}
            title={`${LUNCH_PERSON_LABEL[p]}'s lunch: ${where}${canEdit ? " (tap to change)" : ""}`}
            aria-label={`${LUNCH_PERSON_LABEL[p]}'s lunch: ${where}.${canEdit ? " Tap to change." : ""}`}
          >
            {LUNCH_PERSON_SHORT[p]} · {office ? "office" : "home"}
          </button>
        );
      })}
    </span>
  );
}

function MealChip({
  meal,
  travel,
  recipe,
  canEdit,
  flash = false,
  onRemove,
  onNote,
  onCycleEaters,
  onPickAnother,
}: {
  meal: PlannedMeal;
  /** Who eats once travellers are out, and how much to cook (travel.ts). */
  travel: MealTravel;
  recipe: PlannerRecipe | undefined;
  canEdit: boolean;
  flash?: boolean;
  onRemove: () => void;
  onNote: () => void;
  onCycleEaters: () => void;
  onPickAnother: () => void;
}) {
  const cooked = !!meal.cooked_at;
  const pending = meal.id < 0;
  const travelling = travel.away.length > 0;
  // The recipe page scales to how much gets cooked (a leftover source keeps its usual amount).
  const recipeHref = `/recipes/${meal.recipe_id}?eaters=${travel.cook ?? meal.eaters}&pm=${meal.id}`;
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  // The whole chip is the handle. A saved meal only: a pending one has no row to move yet.
  const draggable = canEdit && !pending;
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: mealDragId(meal.id), data: { mealId: meal.id }, disabled: !draggable });
  return (
    <span className="relative block w-full">
      <span
        ref={setNodeRef}
        {...listeners}
        data-meal={meal.id}
        onClickCapture={swallowClickAfterDrop}
        className={`flex w-full items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] py-1.5 pl-1.5 pr-1 text-[13px] shadow-[0_1px_3px_-1px_rgba(85,55,25,0.3)] ${
          // no text selection or iOS link callout on the press-and-hold that picks it up
          draggable ? "cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]" : ""
        } ${isDragging ? "border-dashed opacity-40 shadow-none" : ""} ${pending ? "opacity-60" : ""} ${flash ? "animate-rolled-in" : ""}`}
      >
        <MealThumb meal={meal} recipe={recipe} />
        {meal.recipe_id === null ? (
          <span
            className="line-clamp-2 min-w-0 flex-1 leading-tight text-[var(--color-ink)]"
            title={meal.custom_text ?? undefined}
          >
            {meal.custom_text}
            {meal.note && <span className="ml-1 text-[var(--color-terra-dark)]" title={meal.note} aria-label="has a note">✎</span>}
          </span>
        ) : (
        <Link
          href={recipeHref}
          draggable={false}
          className="line-clamp-2 min-w-0 flex-1 leading-tight text-[var(--color-ink)] hover:text-[var(--color-terra)]"
          title={recipe?.title}
        >
          {meal.leftover_of !== null && <span className="text-[var(--color-muted)]">Leftovers · </span>}
          {recipe?.title ?? "Recipe"}
          {meal.note && <span className="ml-1 text-[var(--color-terra-dark)]" title={meal.note} aria-label="has a note">✎</span>}
        </Link>
        )}
        <span className="flex shrink-0 items-center gap-1">
          {travelling ? (
            // Someone planned for this meal is out of town: the trip decides, so the chip is fixed.
            <span
              className="inline-flex min-h-7 items-center gap-1 rounded-full border border-[var(--color-mustard)]/60 bg-[var(--color-mustard)]/15 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink)]"
              title={`${eatersSentence(travel)} Edit the trip to change it.`}
              aria-label={`Who's eating: ${eatersSentence(travel)}`}
            >
              <SuitcaseIcon size={11} />
              {eatersChip(travel.eaters)}
            </span>
          ) : (
            <button
              onClick={canEdit ? onCycleEaters : undefined}
              disabled={!canEdit}
              className={`inline-flex min-h-7 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-paper)]/50 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-body)] ${
                canEdit ? "hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]" : ""
              }`}
              title="Who's eating (tap to change)"
              aria-label={`Who's eating: ${EATERS_SHORT[meal.eaters]}. Tap to change.`}
            >
              {EATERS_SHORT[meal.eaters]}
            </button>
          )}
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenu((v) => !v);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-faint)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
              aria-label={`Options for ${recipe?.title ?? "meal"}`}
              aria-expanded={menu}
            >
              ⋯
            </button>
          )}
        </span>
      </span>
      {menu && (
        <>
          <span className="fixed inset-0 z-20" onClick={() => setMenu(false)} aria-hidden />
          <span className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] text-sm shadow-lg" role="menu">
            <button role="menuitem" onClick={() => { setMenu(false); onNote(); }} className="block min-h-11 w-full px-4 text-left hover:bg-[var(--color-paper)]/60">
              {meal.note ? "Edit note" : "Add a note for the cook"}
            </button>
            {!cooked && meal.leftover_of === null && meal.recipe_id !== null && (
              <button role="menuitem" onClick={() => { setMenu(false); onPickAnother(); }} className="block min-h-11 w-full px-4 text-left hover:bg-[var(--color-paper)]/60">
                <Die size={12} className="mr-1.5 inline-block align-[-1px] text-[var(--color-terra)]" />Pick another
              </button>
            )}
            {meal.recipe_id !== null && (
              <Link role="menuitem" href={recipeHref} className="flex min-h-11 w-full items-center px-4 text-left hover:bg-[var(--color-paper)]/60">
                Open recipe
              </Link>
            )}
            <button role="menuitem" onClick={() => { setMenu(false); onRemove(); }} className="block min-h-11 w-full px-4 text-left text-[var(--color-terra-dark)] hover:bg-[var(--color-paper)]/60">
              Remove from plan
            </button>
          </span>
        </>
      )}
    </span>
  );
}

function NoteSheet({ meal, title, onClose, onSave }: { meal: PlannedMeal; title: string; onClose: () => void; onSave: (note: string | null) => Promise<void> }) {
  const [text, setText] = useState(meal.note ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--color-ink)]/40 sm:items-center" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="note-title" onClick={(e) => e.stopPropagation()} className="animate-slide-up w-full max-w-lg rounded-t-3xl bg-[var(--color-card)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
        <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">Note for the cook</div>
        <h2 id="note-title" className="font-display mt-1 text-xl text-[var(--color-ink)]">{title}</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={240}
          placeholder="e.g. Use the frozen salmon · Less chilli for Lydia · Johnny home late, keep a plate"
          className="mt-3 min-h-[5.5rem] w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)]/40 px-4 py-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:border-[var(--color-terra)] focus:outline-none"
          aria-label="Note"
        />
        <p className="mt-1 text-[10px] text-[var(--color-faint)]">Shows on the Kitchen card for that meal.</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          {meal.note && (
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSave(null); }} className="mr-auto inline-flex min-h-11 items-center text-[11px] uppercase tracking-[0.18em] text-[var(--color-terra-dark)]">
              Clear note
            </button>
          )}
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-line)] px-4 text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); await onSave(text.trim() ? text.trim() : null); }}
            className="inline-flex min-h-11 items-center rounded-full bg-[var(--color-ink)] px-5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-cream)] hover:bg-[var(--color-terra)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
