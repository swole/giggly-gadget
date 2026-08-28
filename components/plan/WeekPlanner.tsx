"use client";

// The week grid. Mobile: days stacked, each with its slot rows. Desktop (sm+): the
// same thing reads fine stacked, so no separate column layout — the planner is
// used from a phone. Sunday is collapsed as the helper's rest day; snack rows are
// collapsed unless they have meals or the planner toggles them on.

import { thumb } from "@/lib/images";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { PlannedMeal, PlannerRecipe, Slot } from "@/lib/plan/types";
import { SLOT_LABEL } from "@/lib/plan/types";
import { usePlannedMeals } from "@/lib/plan/usePlannedMeals";
import { EATERS_SHORT, nextEaters } from "@/lib/portions";
import { addDays, formatDayLabel, formatWeekRange, isoDow, weekDates } from "@/lib/week";
import { isPlanner } from "@/lib/role";
import { useRole } from "@/components/role/RoleProvider";
import { RecipePickerSheet } from "./RecipePickerSheet";
import { WeekActionsMenu } from "./WeekActionsMenu";
import { weekConstraintStatus, type ProteinClass } from "@/lib/plan/constraints";

const VISIBLE_SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

export function WeekPlanner({
  weekOf,
  today,
  initialMeals,
  recipes,
  classByRecipe,
  proteinByRecipe,
}: {
  weekOf: string;
  today: string;
  initialMeals: PlannedMeal[];
  recipes: PlannerRecipe[];
  classByRecipe: Record<string, ProteinClass[]>;
  proteinByRecipe: Record<string, { j: number; l: number }>;
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

  const byId = useMemo(() => {
    const m: Record<string, PlannerRecipe> = {};
    for (const r of recipes) m[r.id] = r;
    return m;
  }, [recipes]);

  async function removeWithUndo(m: PlannedMeal) {
    const title = byId[m.recipe_id]?.title ?? "Recipe";
    const ok = await remove(m.id);
    if (ok) {
      setUndo({ meal: m, title });
      setTimeout(() => setUndo((u) => (u && u.meal.id === m.id ? null : u)), 7000);
    }
  }
  async function undoRemove() {
    if (!undo) return;
    const m = undo.meal;
    setUndo(null);
    await add({ planned_for: m.planned_for, slot: m.slot, recipe_id: m.recipe_id, eaters: m.eaters, note: m.note, leftover_of: m.leftover_of });
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
              {isCurrent ? "This week" : "Week of"}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{formatWeekRange(weekOf)}</p>
          </div>
          <nav className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em]">
            <Link
              href={`/plan?week=${prev}`}
              className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[var(--color-muted)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
            >
              ← Prev
            </Link>
            <Link
              href={`/plan?week=${next}`}
              className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[var(--color-muted)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
            >
              Next →
            </Link>
          </nav>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {constraints.map((c) => (
            <span
              key={c.key}
              title={`${c.label}: ${c.count} this week, target ${c.target}`}
              className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${
                c.ok
                  ? "border-[var(--color-sage)]/50 bg-[var(--color-sage)]/10 text-[var(--color-sage)]"
                  : "border-[var(--color-terra)]/50 bg-[var(--color-terra)]/10 text-[var(--color-terra-dark)]"
              }`}
            >
              {c.label} {c.count} <span className="opacity-70">{c.target}</span>
            </span>
          ))}
          {canEdit && (
            <div className="ml-auto flex items-center gap-2">
              <Link
                href={`/plan/print?week=${weekOf}`}
                className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
              >
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
            onAdd={(slot) => setPicker({ day: d, slot })}
            onRemove={removeWithUndo}
            onNote={setNoteFor}
            onCycleEaters={(m) => patch(m.id, { eaters: nextEaters(m.eaters) })}
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
                onAdd={(slot) => setPicker({ day: days[6], slot })}
                onRemove={removeWithUndo}
                onNote={setNoteFor}
                onCycleEaters={(m) => patch(m.id, { eaters: nextEaters(m.eaters) })}
                bare
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {canEdit && !hasSnacks && (
          <button onClick={() => setShowSnacks((v) => !v)} className="hover:text-[var(--color-terra)]">
            {showSnacks ? "Hide snack row" : "+ Snack row"}
          </button>
        )}
        <span className="ml-auto text-[var(--color-faint)]">
          Tap J+L to cycle who&rsquo;s eating · ⋯ for a note or to remove
        </span>
      </div>

      {undo && (
        <div className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-[var(--color-ink)] px-4 py-3 text-sm text-[var(--color-cream)] shadow-xl" role="status">
          <span className="truncate">Removed {undo.title}</span>
          <button onClick={undoRemove} className="shrink-0 rounded-full border border-[var(--color-cream)]/40 px-3 py-1 text-[10px] uppercase tracking-[0.18em] hover:bg-[var(--color-cream)]/10">
            Undo
          </button>
        </div>
      )}

      {noteFor && (
        <NoteSheet
          meal={noteFor}
          title={byId[noteFor.recipe_id]?.title ?? "Recipe"}
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
          leftoverCandidates={meals
            .filter((m) => m.leftover_of === null && m.planned_for <= picker.day && !(m.planned_for === picker.day && m.slot === picker.slot))
            .map((m) => ({ id: m.id, recipe_id: m.recipe_id, planned_for: m.planned_for, slot: m.slot, title: byId[m.recipe_id]?.title ?? "Recipe" }))}
          onPick={async (recipeId) => {
            await add({ planned_for: picker.day, slot: picker.slot, recipe_id: recipeId });
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
  onAdd,
  onRemove,
  onNote,
  onCycleEaters,
  bare = false,
}: {
  day: string;
  isToday: boolean;
  slots: Slot[];
  meals: PlannedMeal[];
  byId: Record<string, PlannerRecipe>;
  proteinByRecipe: Record<string, { j: number; l: number }>;
  canEdit: boolean;
  onAdd: (slot: Slot) => void;
  onRemove: (m: PlannedMeal) => void;
  onNote: (m: PlannedMeal) => void;
  onCycleEaters: (m: PlannedMeal) => void;
  bare?: boolean;
}) {
  // Protein for the day from the heart-healthy recipes' notes (J / L grams). Partial when a recipe has none.
  const protein = meals.reduce(
    (acc, m) => {
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
          : `rounded-2xl border bg-[var(--color-card)] shadow-sm ${
              isToday ? "border-[var(--color-terra)]/60" : "border-[var(--color-line)]/70"
            }`
      }
    >
      {!bare && (
        <div className="flex items-baseline justify-between border-b border-[var(--color-line)]/50 px-4 py-2.5">
          <h2 className="font-display text-xl text-[var(--color-ink)]">{formatDayLabel(day)}</h2>
          {showProtein && (
            <span
              className="ml-3 text-[10px] uppercase tracking-[0.14em] text-[var(--color-faint)]"
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
        </div>
      )}
      <div className={bare ? "" : "px-2 py-1"}>
        {slots.map((slot) => {
          const ms = meals.filter((m) => m.slot === slot);
          return (
            <div key={slot} className="flex gap-3 border-b border-[var(--color-line)]/30 px-2 py-2 last:border-b-0">
              <div className="w-16 shrink-0 pt-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
                {SLOT_LABEL[slot]}
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {ms.map((m) => (
                  <MealChip
                    key={m.id}
                    meal={m}
                    recipe={byId[m.recipe_id]}
                    canEdit={canEdit}
                    onRemove={() => onRemove(m)}
                    onNote={() => onNote(m)}
                    onCycleEaters={() => onCycleEaters(m)}
                  />
                ))}
                {canEdit && (
                  <button
                    onClick={() => onAdd(slot)}
                    className="inline-flex min-h-9 items-center rounded-full border border-dashed border-[var(--color-line)] px-3 text-[11px] text-[var(--color-muted)] transition-colors hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
                    aria-label={`Add to ${SLOT_LABEL[slot]}`}
                  >
                    + Add
                  </button>
                )}
                {!canEdit && ms.length === 0 && <span className="text-xs text-[var(--color-faint)]">—</span>}
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
  onRemove,
  onNote,
  onCycleEaters,
}: {
  meal: PlannedMeal;
  recipe: PlannerRecipe | undefined;
  canEdit: boolean;
  onRemove: () => void;
  onNote: () => void;
  onCycleEaters: () => void;
}) {
  const cooked = !!meal.cooked_at;
  const pending = meal.id < 0;
  const [menu, setMenu] = useState(false);
  return (
    <span className="relative inline-flex max-w-full">
      <span
        className={`inline-flex max-w-full items-center gap-1.5 rounded-full border py-1 pl-1 pr-1 text-xs ${
          cooked
            ? "border-[var(--color-sage)]/50 bg-[var(--color-sage)]/10"
            : "border-[var(--color-line)] bg-[var(--color-paper)]/60"
        } ${pending ? "opacity-60" : ""}`}
      >
        <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[var(--color-paper-2)]">
          {recipe?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb(recipe.image_url, 64)!} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : null}
        </span>
        <Link
          href={`/recipes/${meal.recipe_id}?eaters=${meal.eaters}&pm=${meal.id}`}
          className={`line-clamp-2 max-w-[13rem] leading-tight text-[var(--color-ink)] hover:text-[var(--color-terra)] ${cooked ? "line-through" : ""}`}
          title={recipe?.title}
        >
          {meal.leftover_of !== null && <span className="text-[var(--color-muted)]">Leftovers · </span>}
          {recipe?.title ?? "Recipe"}
          {meal.note && <span className="ml-1 text-[var(--color-terra-dark)]" title={meal.note} aria-label="has a note">✎</span>}
        </Link>
        <button
          onClick={canEdit ? onCycleEaters : undefined}
          disabled={!canEdit}
          className={`inline-flex min-h-7 items-center rounded-full px-2 text-[9px] font-semibold uppercase tracking-[0.12em] ${
            meal.eaters === "both"
              ? "bg-[var(--color-ink)] text-[var(--color-cream)]"
              : "bg-[var(--color-mustard)] text-[var(--color-ink)]"
          } ${canEdit ? "hover:bg-[var(--color-terra)] hover:text-[var(--color-cream)]" : ""}`}
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
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-faint)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
            aria-label={`Options for ${recipe?.title ?? "meal"}`}
            aria-expanded={menu}
          >
            ⋯
          </button>
        )}
      </span>
      {menu && (
        <>
          <span className="fixed inset-0 z-20" onClick={() => setMenu(false)} aria-hidden />
          <span className="absolute left-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] text-sm shadow-lg" role="menu">
            <button role="menuitem" onClick={() => { setMenu(false); onNote(); }} className="block min-h-11 w-full px-4 text-left hover:bg-[var(--color-paper)]/60">
              {meal.note ? "Edit note" : "Add a note for the cook"}
            </button>
            <Link role="menuitem" href={`/recipes/${meal.recipe_id}?eaters=${meal.eaters}&pm=${meal.id}`} className="flex min-h-11 w-full items-center px-4 text-left hover:bg-[var(--color-paper)]/60">
              Open recipe
            </Link>
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
