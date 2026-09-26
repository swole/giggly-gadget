"use client";

// The helper's home screen (and everyone's landing page): today first, then tomorrow,
// then the rest of the week. Reads planned_meals live; "Mark cooked" writes back.

import { thumb } from "@/lib/images";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LunchLocationRow, PlannedMeal, PlannerRecipe, Slot, TripRow } from "@/lib/plan/types";
import { mealTitle, SLOTS, SLOT_LABEL } from "@/lib/plan/types";
import { lunchAway, packNote, packShort } from "@/lib/plan/lunch";
import {
  dayChipText,
  eatersChip,
  eatersSentence,
  kitchenTravelLine,
  leftoverSources,
  mealLabel,
  mealTravel,
  travelOnDay,
  travelPortionNote,
  travellersAt,
  type MealTravel,
} from "@/lib/plan/travel";
import { usePlannedMeals } from "@/lib/plan/usePlannedMeals";
import { addDays, formatDayLabel, formatDayLong, isoDow, todayInTz, weekMondayOf } from "@/lib/week";
import { isPlanner, labelFor } from "@/lib/role";
import { useRole } from "@/components/role/RoleProvider";
import { MarkCookedButton } from "./MarkCookedButton";
import { RatingStars } from "@/components/RatingStars";
import { BasketIcon, BowlIcon, PlateIcon, SuitcaseIcon, SunIcon } from "@/components/icons";

/** From Friday: next week's shop, so an empty today can say something useful. */
export type ShopAhead = { week: string; meals: number; items: number } | null;

type Props = {
  today: string; // YYYY-MM-DD in SG
  initialMeals: PlannedMeal[];
  recipes: Record<string, PlannerRecipe>;
  /** Prep-ahead sentences per recipe (marinate, soak, thaw…) shown on tomorrow's cards. */
  hintsByRecipe?: Record<string, string[]>;
  shopAhead?: ShopAhead;
  /** lunch_locations rows for the window: who is packing lunch for the office. */
  initialLunch?: LunchLocationRow[];
  /** trips touching the window: who is out of town (travel.ts). */
  initialTrips?: TripRow[];
};

export function KitchenView({ today, initialMeals, recipes, hintsByRecipe = {}, shopAhead = null, initialLunch = [], initialTrips = [] }: Props) {
  const role = useRole();
  const router = useRouter();
  const planner = isPlanner(role);
  const to = addDays(today, 6);
  const window = useMemo(() => ({ from: today, to }), [today, to]);
  const { meals, lunch, trips, status } = usePlannedMeals(null, initialMeals, window, initialLunch, initialTrips);
  const withLeftovers = useMemo(() => leftoverSources(meals), [meals]);
  const travelOf = (m: PlannedMeal) => mealTravel(m, trips, withLeftovers.has(m.id));
  /** "Fri 2 lunch" for every leftover sitting planned from this meal. */
  const leftoversOf = (m: PlannedMeal) => meals.filter((x) => x.leftover_of === m.id).map((x) => mealLabel(x.planned_for, x.slot));
  const packFor = (day: string) => lunchAway(lunch, day, travellersAt(trips, day, "lunch"));

  // A phone left open overnight must not keep calling yesterday "Today".
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && todayInTz() !== today) router.refresh();
    };
    document.addEventListener("visibilitychange", check);
    globalThis.addEventListener("focus", check);
    const t = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      globalThis.removeEventListener("focus", check);
      clearInterval(t);
    };
  }, [today, router]);

  const byDay = useMemo(() => {
    const m = new Map<string, PlannedMeal[]>();
    for (const pm of meals) {
      if (!m.has(pm.planned_for)) m.set(pm.planned_for, []);
      m.get(pm.planned_for)!.push(pm);
    }
    return m;
  }, [meals]);

  const tomorrow = addDays(today, 1);
  const todayMeals = byDay.get(today) ?? [];
  const tomorrowMeals = byDay.get(tomorrow) ?? [];
  const later = Array.from({ length: 5 }, (_, i) => addDays(today, i + 2));
  const cookedToday = todayMeals.filter((m) => m.cooked_at).length;
  const allDone = todayMeals.length > 0 && cookedToday === todayMeals.length;
  // From Friday on, nudge the planners if next week has nothing yet (the window sees Mon-Thu of it by Friday).
  // isoDow is Mon=0 … Sun=6, so Friday is 4 (was >= 5, which only fired from Saturday).
  const nextMonday = addDays(weekMondayOf(today), 7);
  const nextWeekEmpty = planner && isoDow(today) >= 4 && !meals.some((m) => m.planned_for >= nextMonday);

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-8">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Kitchen</span>
          {/* The live dot is plumbing — planners see it; everyone sees when it's NOT live. */}
          <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-faint)]" aria-live="polite">
            {status === "reconnecting" ? "○ reconnecting" : status === "live" && planner ? "● live" : ""}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display-italic text-5xl leading-[0.95] text-[var(--color-ink)] sm:text-6xl">Today</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{formatDayLong(today)}</p>
          </div>
          {todayMeals.length > 0 && <ProgressRing done={cookedToday} total={todayMeals.length} />}
        </div>
      </header>

      <TravelNotice day={today} trips={trips} />

      {/* TODAY */}
      {todayMeals.length === 0 ? (
        <EmptyDay
          planner={planner}
          sunday={isoDow(today) === 6}
          shopDay={isoDow(today) === 5 ? shopAhead : null}
          nextPlanned={(() => {
            for (let i = 1; i <= 6; i++) {
              const d = addDays(today, i);
              const n = (byDay.get(d) ?? []).length;
              if (n > 0) return { day: d, count: n };
            }
            return null;
          })()}
        />
      ) : (
        <div className="space-y-4">
          {allDone && (
            <div className="rounded-2xl bg-[var(--color-sage)]/12 px-4 py-3 text-sm text-[var(--color-sage)]">
              <span className="font-medium">All of today is cooked.</span> Nice work{role ? `, ${labelFor(role)}` : ""}.
            </div>
          )}
          {SLOTS.map((slot) => {
            const ms = todayMeals.filter((m) => m.slot === slot);
            if (ms.length === 0) return null;
            return (
              <section key={slot}>
                <SlotHeading slot={slot} />
                {slot === "lunch" && packNote(packFor(today)) && (
                  <p className="mt-1 text-xs font-medium text-[var(--color-terra-dark)]">{packNote(packFor(today))}</p>
                )}
                <div className="mt-2 space-y-3">
                  {ms.map((m) => (
                    <MealCard
                      key={m.id}
                      meal={m}
                      travel={travelOf(m)}
                      leftovers={leftoversOf(m)}
                      recipe={m.recipe_id ? recipes[m.recipe_id] : undefined}
                      big
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {nextWeekEmpty && (
        <Link
          href={`/plan?week=${nextMonday}`}
          className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--color-terra)]/50 bg-[var(--color-terra)]/5 px-4 py-3 text-sm text-[var(--color-ink)] hover:bg-[var(--color-terra)]/10"
        >
          <span>
            <span className="font-medium">Next week is empty.</span> Fill it from the rotation or copy this week.
          </span>
          <span className="btn-quiet shrink-0 px-3 py-1.5 text-[12px] uppercase tracking-[0.06em] text-[var(--color-terra-dark)]">Plan it →</span>
        </Link>
      )}

      {/* TOMORROW */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
          <h2 className="font-display text-2xl text-[var(--color-ink)]">Tomorrow</h2>
          <span className="text-[12px] uppercase tracking-[0.06em] text-[var(--color-muted)]">{formatDayLong(tomorrow)}</span>
        </div>
        <TravelNotice day={tomorrow} trips={trips} compact />
        {tomorrowMeals.some((m) => m.slot === "lunch") && packNote(packFor(tomorrow)) && (
          <p className="mt-3 rounded-lg bg-[var(--color-mustard)]/12 px-2.5 py-1.5 text-xs text-[var(--color-ink)]">
            <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-terra-dark)]">Lunch</span>
            {packNote(packFor(tomorrow))}
          </p>
        )}
        {isoDow(tomorrow) === 6 && tomorrowMeals.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-faint)]">Sunday — rest day.</p>
        ) : tomorrowMeals.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-faint)]">Nothing planned yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {tomorrowMeals.map((m) => (
              <MealCard
                key={m.id}
                meal={m}
                travel={travelOf(m)}
                leftovers={leftoversOf(m)}
                recipe={m.recipe_id ? recipes[m.recipe_id] : undefined}
                future
                hint={
                  m.leftover_of === null && m.recipe_id !== null && (hintsByRecipe[m.recipe_id]?.length ?? 0) > 0
                    ? hintsByRecipe[m.recipe_id].join(" · ")
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* REST OF WEEK */}
      <section className="mt-12">
        <h2 className="font-display border-b border-[var(--color-line)] pb-2 text-2xl text-[var(--color-ink)]">
          Coming up
        </h2>
        <div className="mt-3 divide-y divide-[var(--color-line)]/50">
          {later.map((d) => {
            const ms = byDay.get(d) ?? [];
            const sunday = isoDow(d) === 6;
            const away = travelOnDay(trips, d);
            return (
              <div key={d} className="flex gap-4 py-3">
                <div className="w-16 shrink-0 pt-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
                  {formatDayLabel(d)}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  {away.map((dt) => (
                    <p key={dt.person} className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[var(--color-terra-dark)]">
                      <SuitcaseIcon size={12} className="shrink-0" />
                      {dayChipText(dt)}
                    </p>
                  ))}
                  {ms.length === 0 ? (
                    <span className="text-[var(--color-faint)]">{sunday ? "Rest day" : "—"}</span>
                  ) : (
                    <ul className="space-y-1.5">
                      {ms.map((m) => {
                        const t = travelOf(m);
                        return (
                          <li key={m.id} className="flex items-baseline gap-2">
                            <span className="w-14 shrink-0 text-[11px] uppercase tracking-[0.08em] text-[var(--color-faint)]">
                              {SLOT_ABBR[m.slot]}
                            </span>
                            <MaybeLink
                              href={m.recipe_id === null ? null : `/recipes/${m.recipe_id}?eaters=${t.cook ?? m.eaters}&pm=${m.id}`}
                              className={`line-clamp-2 text-[var(--color-ink)] ${m.recipe_id === null ? "" : "hover:text-[var(--color-terra)]"}`}
                            >
                              {m.leftover_of !== null && <span className="text-[var(--color-muted)]">Leftovers · </span>}
                              {mealTitle(m, recipes)}
                            </MaybeLink>
                            <span className="shrink-0 text-[10px] text-[var(--color-faint)]" title={eatersSentence(t)}>
                              {eatersChip(t.eaters)}
                            </span>
                          </li>
                        );
                      })}
                      {ms.some((m) => m.slot === "lunch") && packShort(packFor(d)) && (
                        <li className="text-[11px] text-[var(--color-terra-dark)]">{packShort(packFor(d))}</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {planner && (
          <Link
            href="/plan"
            className="btn-quiet mt-6 px-4 text-[12px] uppercase tracking-[0.06em]"
          >
            Open the week planner →
          </Link>
        )}
      </section>
    </main>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <div className="flex items-center gap-2" aria-label={`${done} of ${total} cooked today`}>
      <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-paper-2)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={pct === 1 ? "var(--color-sage)" : "var(--color-terra)"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="text-right leading-tight">
        <div className="font-display text-xl text-[var(--color-ink)]">
          {done}
          <span className="text-[var(--color-faint)]">/{total}</span>
        </div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-faint)]">cooked</div>
      </div>
    </div>
  );
}

/** Who is out of town on this day, in a sentence for the cook. Nothing when everyone is home. */
function TravelNotice({ day, trips, compact = false }: { day: string; trips: TripRow[]; compact?: boolean }) {
  const away = travelOnDay(trips, day);
  if (away.length === 0) return null;
  return (
    <div
      className={`flex items-start gap-2 rounded-2xl border border-[var(--color-mustard)]/50 bg-[var(--color-mustard)]/12 text-[var(--color-ink)] ${
        compact ? "mt-3 px-3 py-2 text-xs" : "mb-6 px-4 py-3 text-sm"
      }`}
      role="note"
    >
      <SuitcaseIcon size={compact ? 14 : 18} className="mt-px shrink-0 text-[var(--color-terra-dark)]" />
      <span>
        {away.map((dt) => (
          <span key={dt.person} className="block">
            {kitchenTravelLine(dt)}
          </span>
        ))}
      </span>
    </div>
  );
}

function SlotHeading({ slot }: { slot: Slot }) {
  return (
    <h2 className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">{SLOT_LABEL[slot]}</h2>
  );
}

// An empty state that knows the calendar: shop day points at the list, a planned
// week ahead says so, and only a genuinely blank horizon asks anyone to plan.
function EmptyDay({
  planner,
  sunday,
  shopDay,
  nextPlanned,
}: {
  planner: boolean;
  sunday: boolean;
  shopDay: ShopAhead;
  nextPlanned: { day: string; count: number } | null;
}) {
  if (shopDay && shopDay.meals > 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-line)] px-5 py-8 text-center">
        <BasketIcon size={34} className="mx-auto text-[var(--color-clay)]" />
        <p className="font-display-italic mt-2 text-2xl text-[var(--color-body)]">Shop day.</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {shopDay.items > 0
            ? `${shopDay.items} item${shopDay.items === 1 ? "" : "s"} ready for next week's ${shopDay.meals} meal${shopDay.meals === 1 ? "" : "s"}.`
            : `Next week has ${shopDay.meals} meal${shopDay.meals === 1 ? "" : "s"} planned — the list builds on the next plan change.`}
        </p>
        <Link href={`/grocery?week=${shopDay.week}`} className="btn-primary mt-4 px-5 text-[11px] uppercase tracking-[0.08em]">
          Open the shopping list →
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-line)] px-5 py-10 text-center">
      {sunday ? (
        <SunIcon size={34} className="mx-auto text-[var(--color-mustard)]" />
      ) : (
        <PlateIcon size={34} className="mx-auto text-[var(--color-faint)]" />
      )}
      <p className="font-display-italic mt-2 text-2xl text-[var(--color-body)]">
        {sunday ? "Sunday — rest day." : "Nothing planned for today."}
      </p>
      {nextPlanned && (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {formatDayLabel(nextPlanned.day)} is ready — {nextPlanned.count} meal{nextPlanned.count === 1 ? "" : "s"} planned.
        </p>
      )}
      {planner && !nextPlanned ? (
        <Link
          href="/plan"
          className="btn-primary mt-4 px-5 text-[11px] uppercase tracking-[0.08em]"
        >
          Plan the week →
        </Link>
      ) : planner ? (
        <Link href="/plan" className="btn-quiet mt-4 px-4 py-1.5 text-[11px] uppercase tracking-[0.08em]">
          Open the planner →
        </Link>
      ) : (
        !sunday && !nextPlanned && <p className="mt-2 text-xs text-[var(--color-faint)]">Johnny or Lydia will add today&rsquo;s meals.</p>
      )}
    </div>
  );
}

const SLOT_ABBR: Record<Slot, string> = { breakfast: "Bfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

/** A Link when there is somewhere to go, a plain block otherwise (one-off items have no recipe page). */
function MaybeLink({ href, ariaLabel, className, children }: { href: string | null; ariaLabel?: string; className?: string; children: React.ReactNode }) {
  if (href === null) return <span aria-label={ariaLabel} className={className}>{children}</span>;
  return <Link href={href} aria-label={ariaLabel} className={className}>{children}</Link>;
}
const CHEERS = ["Nice one", "Lovely", "That's dinner sorted", "Smells good from here", "Chef's kiss", "Another one down"];

export function MealCard({
  meal,
  travel,
  leftovers = [],
  recipe,
  big = false,
  future = false,
  hint,
}: {
  meal: PlannedMeal;
  /** Who eats once travellers are out, and how much to cook (lib/plan/travel.ts). */
  travel: MealTravel;
  /** "Fri 2 lunch" for each leftover sitting planned from this meal. */
  leftovers?: string[];
  recipe: PlannerRecipe | undefined;
  big?: boolean;
  /** Tomorrow's cards: prep hints and the recipe, but no "Mark cooked" on a meal that hasn't happened. */
  future?: boolean;
  /** Prep-ahead sentence rendered inside the card ("Tonight — soak the shiitake"). */
  hint?: string;
}) {
  const custom = meal.recipe_id === null;
  const title = custom ? (meal.custom_text ?? "One-off") : (recipe?.title ?? "Recipe");
  // Recipe and cook mode scale to how much gets cooked: a leftover source keeps its usual amount.
  const cookEaters = travel.cook ?? meal.eaters;
  const href = `/recipes/${meal.recipe_id}?eaters=${cookEaters}&pm=${meal.id}`;
  const cookHref = `/recipes/${meal.recipe_id}/cook?pm=${meal.id}&eaters=${cookEaters}`;
  const portion = travelPortionNote(travel, leftovers);
  const cooked = !!meal.cooked_at;
  const leftover = meal.leftover_of !== null;
  const [cheer, setCheer] = useState<string | null>(null);

  function celebrate() {
    setCheer(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
    setTimeout(() => setCheer(null), 2200);
  }

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-[var(--color-card)] shadow-sm transition-colors ${
        cooked ? "border-[var(--color-sage)]/40" : "border-[var(--color-line)]/70"
      }`}
    >
      {cheer && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
          <div className="animate-cheer rounded-full bg-[var(--color-sage)] px-4 py-2 font-display text-lg text-[var(--color-cream)] shadow-lg">
            {cheer} ✨
          </div>
          {["🥢", "🔥", "🌿", "✨", "🍋"].map((e, i) => (
            <span
              key={i}
              className="animate-float-up absolute bottom-4 text-xl"
              style={{ left: `${15 + i * 17}%`, animationDelay: `${i * 90}ms` }}
            >
              {e}
            </span>
          ))}
        </div>
      )}
      <div className={`flex ${big ? "flex-col sm:flex-row" : "flex-row"}`}>
        <MaybeLink
          href={custom ? null : href}
          ariaLabel={`Open ${title}`}
          className={`relative block shrink-0 overflow-hidden bg-[var(--color-paper-2)] ${
            big ? "h-44 w-full sm:h-auto sm:w-44" : "h-24 w-24"
          }`}
        >
          {!custom && recipe?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb(recipe.image_url, big ? 800 : 200)!} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--color-faint)]">
              {custom ? <BowlIcon size={big ? 36 : 28} /> : <PlateIcon size={big ? 36 : 28} />}
            </div>
          )}
          {cooked && (
            <span className="absolute left-2 top-2 rounded-full bg-[var(--color-sage)] px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-cream)]">
              Cooked
            </span>
          )}
        </MaybeLink>
        <div className={`flex min-w-0 flex-1 flex-col ${big ? "p-4 sm:p-5" : "p-3"}`}>
          <div className="flex items-start justify-between gap-3">
            <MaybeLink href={custom ? null : href} className="min-w-0">
              <h3
                className={`font-display leading-tight text-[var(--color-ink)] ${custom ? "" : "hover:text-[var(--color-terra)]"} ${
                  big ? "text-2xl" : "text-base"
                }`}
              >
                {leftover && <span className="mr-1 text-[var(--color-muted)]">Leftovers ·</span>}
                {title}
              </h3>
            </MaybeLink>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${
                travel.away.length > 0
                  ? "border-[var(--color-mustard)]/60 bg-[var(--color-mustard)]/15 text-[var(--color-ink)]"
                  : "border-[var(--color-line)] text-[var(--color-muted)]"
              }`}
              title={eatersSentence(travel)}
              aria-label={`Who's eating: ${eatersSentence(travel)}`}
            >
              {travel.away.length > 0 && <SuitcaseIcon size={11} />}
              {eatersChip(travel.eaters)}
            </span>
          </div>
          {big && portion && <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">{portion}</p>}
          {!big && travel.away.length > 0 && portion && (
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-muted)]">{portion}</p>
          )}
          {meal.note && (
            <p className="mt-2 rounded-lg bg-[var(--color-mustard)]/12 px-2.5 py-1.5 text-xs text-[var(--color-ink)]">
              <span className="mr-1 text-[11px] uppercase tracking-[0.08em] text-[var(--color-terra-dark)]">Note</span>
              {meal.note}
            </p>
          )}
          <div className={`mt-auto flex flex-wrap items-center gap-2 ${big ? "pt-4" : "pt-2"}`}>
            {big && !cooked && !leftover && !custom && (
              <Link
                href={cookHref}
                className="inline-flex min-h-11 items-center rounded-full bg-[var(--color-terra)] px-4 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-cream)] shadow-sm transition-all hover:bg-[var(--color-terra-dark)] active:scale-[0.97]"
              >
                Cook ▸
              </Link>
            )}
            {!custom && (
              <Link
                href={href}
                className={`inline-flex items-center rounded-full border border-[var(--color-line)] font-medium uppercase tracking-[0.08em] text-[var(--color-ink)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)] ${
                  big ? "min-h-11 px-4 text-[11px]" : "min-h-9 px-3 text-[11px]"
                }`}
              >
                {big ? "Recipe" : "Open recipe"}
              </Link>
            )}
            {!future && (
              <MarkCookedButton
                recipeId={meal.recipe_id}
                plannedMealId={meal.id}
                cookedAt={meal.cooked_at}
                size={big ? "md" : "sm"}
                onCooked={celebrate}
              />
            )}
          </div>
          {/* The moment to judge a dish is right after eating it. Planners only (RatingStars hides itself). */}
          {cooked && !custom && !leftover && meal.recipe_id && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-faint)]">Rate it</span>
              <RatingStars recipeId={meal.recipe_id} initial={recipe?.rating ?? null} compact />
            </div>
          )}
        </div>
      </div>
      {/* Prep hint lives inside the card it belongs to — no orphan strip between cards. */}
      {hint && (
        <div className="border-t border-[var(--color-mustard)]/40 bg-[var(--color-mustard)]/10 px-4 py-2 text-xs text-[var(--color-ink)]">
          <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-terra-dark)]">Tonight</span>
          {hint}
        </div>
      )}
    </article>
  );
}
