"use client";

// The week grid. Mobile: days stacked, each with its slot rows. Desktop (sm+): the
// same thing reads fine stacked, so no separate column layout — the planner is
// used from a phone. Sunday is collapsed as the helper's rest day; snack rows are
// collapsed unless they have meals or the planner toggles them on.

import { thumb } from "@/lib/images";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { NewPlannedMeal, PlannedMeal, PlannerRecipe, Slot } from "@/lib/plan/types";
import { mealTitle, SLOT_LABEL } from "@/lib/plan/types";
import { usePlannedMeals } from "@/lib/plan/usePlannedMeals";
import { EATERS_SHORT, nextEaters } from "@/lib/portions";
import { addDays, formatDayLabel, formatWeekRange, isoDow, weekDates } from "@/lib/week";
import { isPlanner } from "@/lib/role";
import { useRole } from "@/components/role/RoleProvider";
import { RecipePickerSheet } from "./RecipePickerSheet";
import { WeekActionsMenu } from "./WeekActionsMenu";
import { RandomizeSheet, loadSavedTheme, type RollScope } from "./RandomizeSheet";
import { ShareWeekButton } from "./ShareWeekButton";
import { Die } from "./Die";
import type { RollFilters } from "@/lib/plan/randomize";
import { weekConstraintStatus, type ProteinClass } from "@/lib/plan/constraints";

const VISIBLE_SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

function themeSummary(f: RollFilters): string | null {
  const parts = [
    f.source ? `by ${f.source}` : null,
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
  again?: () => void;
  undo?: () => void;
  undoLabel?: string;
};

export function WeekPlanner({
  weekOf,
  today,
  initialMeals,
  recipes,
  classByRecipe,
  proteinByRecipe,
  autoForward = false,
}: {
  weekOf: string;
  today: string;
  initialMeals: PlannedMeal[];
  recipes: PlannerRecipe[];
  classByRecipe: Record<string, ProteinClass[]>;
  proteinByRecipe: Record<string, { j: number; l: number }>;
  autoForward?: boolean;
}) {
  const role = useRole();
  const canEdit = isPlanner(role);
  const { meals, status, add, remove, patch, refetch } = usePlannedMeals(weekOf, initialMeals);
  const constraints = useMemo(() => weekConstraintStatus(meals, classByRecipe), [meals, classByRecipe]);
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
  const [showGestureTip, setShowGestureTip] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("gg-gesture-tip-v1")) setShowGestureTip(true);
    } catch {}
  }, []);
  function dismissGestureTip() {
    setShowGestureTip(false);
    try { localStorage.setItem("gg-gesture-tip-v1", "1"); } catch {}
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
          <span className="text-[10px] uppercase tracking-[0.32em] text-[var(--color-muted)]">Plan</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-faint)]">
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
          <nav className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em]">
            <Link href={`/plan?week=${prev}`} className="btn-quiet px-3 py-1.5">
              ← Prev
            </Link>
            <Link href={`/plan?week=${next}`} className="btn-quiet px-3 py-1.5">
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
            <div className="ml-auto flex items-center gap-2">
              {meals.length > 0 && (
                <button
                  onClick={() => setRollSheet({ kind: "week" })}
                  className="btn-primary px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                >
                  <Die size={13} /> Randomize
                </button>
              )}
              <ShareWeekButton weekOf={weekOf} meals={meals} byId={byId} />
              <Link href={`/plan/print?week=${weekOf}`} className="btn-quiet px-3 py-1.5 text-[11px] uppercase tracking-[0.08em]">
                Print
              </Link>
              <WeekActionsMenu weekOf={weekOf} onDone={() => void refetch()} />
            </div>
          )}
        </div>
        {!canEdit && (
          <p className="mt-3 rounded-xl bg-[var(--color-paper-2)]/50 px-3 py-2 text-xs text-[var(--color-muted)]">
            Read-only view. Johnny and Lydia plan the week; switch person from the bar below to edit.
          </p>
        )}
      </header>

      {canEdit && meals.length > 0 && showGestureTip && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl bg-[var(--color-paper-2)]/50 px-4 py-3 text-xs leading-relaxed text-[var(--color-body)]">
          <span>
            Tap the <span className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-1.5 py-0.5 text-[10px] font-semibold">J+L</span> badge
            on any meal to change who&rsquo;s eating. The ⋯ holds notes, a themed swap, and remove.
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
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-faint)]">
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
                bare
              />
            </div>
          )}
        </div>
      </div>

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
              <span className="block truncate">
                <Die size={12} className="mr-1.5 inline-block align-[-1px] text-[var(--color-mustard)]" />
                {rollToast.text}
              </span>
              {rollToast.theme && <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-[var(--color-cream)]/60">theme: {rollToast.theme}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {rollToast.again && (
                <button
                  onClick={rollToast.again}
                  disabled={rollBusy}
                  className="rounded-full border border-[var(--color-cream)]/40 px-3 py-1 text-[10px] uppercase tracking-[0.18em] hover:bg-[var(--color-cream)]/10 disabled:opacity-50"
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
                  className="rounded-full border border-[var(--color-cream)]/40 px-3 py-1 text-[10px] uppercase tracking-[0.18em] hover:bg-[var(--color-cream)]/10"
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
          <button onClick={undoRemove} className="shrink-0 rounded-full border border-[var(--color-cream)]/40 px-3 py-1 text-[10px] uppercase tracking-[0.18em] hover:bg-[var(--color-cream)]/10">
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
  bare?: boolean;
}) {
  // Protein for the day from the heart-healthy recipes' notes (J / L grams). Partial when a recipe has none.
  // One-off items (no recipe) don't count as missing — they're extras, not mains.
  const protein = meals.reduce(
    (acc, m) => {
      if (m.recipe_id === null) return acc;
      const p = proteinByRecipe[m.recipe_id];
      if (!p) return { ...acc, missing: acc.missing + 1 };
      if (m.eaters === "johnny") return { ...acc, j: acc.j + p.j };
      if (m.eaters === "lydia") return { ...acc, l: acc.l + p.l };
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
                className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]"
                title={`Protein from the recipes' notes${protein.missing ? ` (${protein.missing} meal${protein.missing > 1 ? "s" : ""} without a figure)` : ""}. Targets J 110-150 g, L 70-80 g.`}
              >
                J {protein.j} g · L {protein.l} g{protein.missing ? " +" : ""}
              </span>
            )}
            {isToday && (
              <span className="rounded-full bg-[var(--color-terra)] px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--color-cream)]">
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
      <div className={bare ? "" : "px-2 py-1"}>
        {slots.map((slot) => {
          const ms = meals.filter((m) => m.slot === slot);
          return (
            <div key={slot} className="flex gap-3 border-b border-[var(--color-line)]/40 px-2 py-2 last:border-b-0">
              <div className="w-16 shrink-0 pt-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-muted)]">
                {SLOT_LABEL[slot]}
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1.5">
                {ms.map((m) => (
                  <MealChip
                    key={m.id}
                    meal={m}
                    recipe={m.recipe_id ? byId[m.recipe_id] : undefined}
                    canEdit={canEdit}
                    flash={justRolled.has(m.id)}
                    onRemove={() => onRemove(m)}
                    onNote={() => onNote(m)}
                    onCycleEaters={() => onCycleEaters(m)}
                    onPickAnother={() => onPickAnother(m)}
                  />
                ))}
                <div className="flex items-center gap-1.5">
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
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MealChip({
  meal,
  recipe,
  canEdit,
  flash = false,
  onRemove,
  onNote,
  onCycleEaters,
  onPickAnother,
}: {
  meal: PlannedMeal;
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
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  return (
    <span className="relative block w-full">
      <span
        className={`flex w-full items-center gap-2.5 rounded-xl border py-1.5 pl-1.5 pr-1 text-[13px] shadow-[0_1px_3px_-1px_rgba(85,55,25,0.3)] ${
          cooked
            ? "border-[var(--color-sage)]/60 bg-[var(--color-sage)]/10"
            : "border-[var(--color-line)] bg-[var(--color-card)]"
        } ${pending ? "opacity-60" : ""} ${flash ? "animate-rolled-in" : ""}`}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ${meal.recipe_id === null ? "border border-[var(--color-line)] bg-[var(--color-paper)]/40 text-[13px] text-[var(--color-muted)]" : "bg-[var(--color-paper-2)]"}`}>
          {meal.recipe_id === null ? (
            <span aria-hidden>✎</span>
          ) : recipe?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb(recipe.image_url, 96)!} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span aria-hidden className="font-display text-sm text-[var(--color-faint)]">{(recipe?.title ?? "?").slice(0, 1)}</span>
          )}
        </span>
        {meal.recipe_id === null ? (
          <span
            className={`line-clamp-2 min-w-0 flex-1 leading-tight text-[var(--color-ink)] ${cooked ? "line-through" : ""}`}
            title={meal.custom_text ?? undefined}
          >
            {meal.custom_text}
            {meal.note && <span className="ml-1 text-[var(--color-terra-dark)]" title={meal.note} aria-label="has a note">✎</span>}
          </span>
        ) : (
        <Link
          href={`/recipes/${meal.recipe_id}?eaters=${meal.eaters}&pm=${meal.id}`}
          className={`line-clamp-2 min-w-0 flex-1 leading-tight text-[var(--color-ink)] hover:text-[var(--color-terra)] ${cooked ? "line-through" : ""}`}
          title={recipe?.title}
        >
          {meal.leftover_of !== null && <span className="text-[var(--color-muted)]">Leftovers · </span>}
          {recipe?.title ?? "Recipe"}
          {meal.note && <span className="ml-1 text-[var(--color-terra-dark)]" title={meal.note} aria-label="has a note">✎</span>}
        </Link>
        )}
        <span className="flex shrink-0 items-center gap-1">
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
              <Link role="menuitem" href={`/recipes/${meal.recipe_id}?eaters=${meal.eaters}&pm=${meal.id}`} className="flex min-h-11 w-full items-center px-4 text-left hover:bg-[var(--color-paper)]/60">
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
        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-muted)]">Note for the cook</div>
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
