"use client";

// Live view of planned_meals for a week (planner) or a rolling window (kitchen).
// Reads arrive via Supabase Realtime; writes go through /api/plan/* so the server
// stamps added_by. Optimistic on add/remove/patch, reverts on failure, re-fetches
// after a reconnect so a phone that slept through edits heals itself.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { LunchLocation, LunchLocationRow, LunchPerson, NewPlannedMeal, PlannedMeal, PlannedMealPatch } from "./types";
import { addDays, weekMondayOf } from "@/lib/week";

type Status = "idle" | "live" | "reconnecting";

export function usePlannedMeals(
  weekOf: string | null,
  initial: PlannedMeal[],
  /** For the kitchen: only keep rows inside [from, to] (inclusive). Planner leaves it undefined. */
  window?: { from: string; to: string },
  /** lunch_locations rows for the same week / window (home vs office per day + person). */
  initialLunch: LunchLocationRow[] = [],
) {
  const [meals, setMeals] = useState<PlannedMeal[]>(() => sortMeals(initial));
  const [lunch, setLunchRows] = useState<LunchLocationRow[]>(initialLunch);
  const [status, setStatus] = useState<Status>("idle");
  const subscribedOnce = useRef(false);
  const patchSeq = useRef<Record<number, number>>({});

  const inWindow = useCallback(
    (m: PlannedMeal) => {
      if (weekOf && m.week_of !== weekOf) return false;
      if (window && (m.planned_for < window.from || m.planned_for > window.to)) return false;
      return true;
    },
    [weekOf, window],
  );

  const upsertLocal = useCallback((m: PlannedMeal) => {
    setMeals((prev) => {
      const i = prev.findIndex((x) => x.id === m.id);
      if (i === -1) return sortMeals([...prev, m]);
      const next = prev.slice();
      next[i] = m;
      return sortMeals(next);
    });
  }, []);

  const removeLocal = useCallback((id: number) => {
    setMeals((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // ---- lunch locations: the same live-state shape, keyed by day + person ----
  const lunchInWindow = useCallback(
    (r: LunchLocationRow) => {
      if (weekOf) return r.planned_for >= weekOf && r.planned_for <= addDays(weekOf, 6);
      if (window) return r.planned_for >= window.from && r.planned_for <= window.to;
      return true;
    },
    [weekOf, window],
  );
  const upsertLunchLocal = useCallback((r: LunchLocationRow) => {
    setLunchRows((prev) => [...prev.filter((x) => !(x.planned_for === r.planned_for && x.person === r.person)), r]);
  }, []);
  const removeLunchLocal = useCallback((planned_for: string, person: LunchPerson) => {
    setLunchRows((prev) => prev.filter((x) => !(x.planned_for === planned_for && x.person === person)));
  }, []);

  const refetch = useCallback(async () => {
    if (weekOf) {
      const res = await fetch(`/api/plan/meals?week=${weekOf}`, { cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as { meals: PlannedMeal[]; lunch?: LunchLocationRow[] };
        setMeals(sortMeals(j.meals));
        setLunchRows(j.lunch ?? []);
      }
    } else if (window) {
      // kitchen window may straddle two weeks — fetch both and filter
      const weeks = new Set([weekMondayOf(window.from), weekMondayOf(window.to)]);
      const all: PlannedMeal[] = [];
      const allLunch: LunchLocationRow[] = [];
      for (const w of weeks) {
        const res = await fetch(`/api/plan/meals?week=${w}`, { cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as { meals: PlannedMeal[]; lunch?: LunchLocationRow[] };
          all.push(...j.meals);
          allLunch.push(...(j.lunch ?? []));
        }
      }
      setMeals(sortMeals(all.filter((m) => m.planned_for >= window.from && m.planned_for <= window.to)));
      setLunchRows(allLunch.filter((r) => r.planned_for >= window.from && r.planned_for <= window.to));
    }
  }, [weekOf, window]);

  useEffect(() => {
    const supa = supabaseBrowser();
    const channelName = weekOf ? `plan:${weekOf}` : `plan:window`;
    const filter = weekOf ? { filter: `week_of=eq.${weekOf}` } : {};
    const ch = supa
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planned_meals", ...filter },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const m = payload.new as PlannedMeal;
            if (inWindow(m)) upsertLocal(m);
            else removeLocal(m.id); // moved out of view
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<PlannedMeal>;
            if (old.id) removeLocal(old.id);
          }
        },
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus("live");
          if (subscribedOnce.current) void refetch(); // heal after reconnect
          subscribedOnce.current = true;
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("reconnecting");
        }
      });
    return () => {
      supa.removeChannel(ch);
    };
  }, [weekOf, inWindow, upsertLocal, removeLocal, refetch]);

  // Second channel for lunch_locations (tiny table, no server-side filter: the window check runs here).
  // Its status is not surfaced on purpose: until migration 0007 runs the table may not exist.
  useEffect(() => {
    const supa = supabaseBrowser();
    const ch = supa
      .channel(weekOf ? `lunch:${weekOf}` : "lunch:window")
      .on("postgres_changes", { event: "*", schema: "public", table: "lunch_locations" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as Partial<LunchLocationRow>;
          if (old.planned_for && old.person) removeLunchLocal(old.planned_for, old.person);
          return;
        }
        const r = payload.new as LunchLocationRow;
        if (lunchInWindow(r)) upsertLunchLocal(r);
      })
      .subscribe();
    return () => {
      supa.removeChannel(ch);
    };
  }, [weekOf, lunchInWindow, upsertLunchLocal, removeLunchLocal]);

  // ---- mutations (optimistic) ----

  const add = useCallback(
    async (input: NewPlannedMeal): Promise<PlannedMeal | null> => {
      const tempId = -Date.now();
      const optimistic: PlannedMeal = {
        id: tempId,
        recipe_id: input.recipe_id ?? null,
        custom_text: input.custom_text ?? null,
        planned_for: input.planned_for,
        week_of: weekMondayOf(input.planned_for),
        slot: input.slot,
        eaters: input.eaters ?? "both",
        position: 9999,
        note: input.note ?? null,
        planned_servings: null,
        added_by: null,
        added_at: new Date().toISOString(),
        cooked_at: null,
        cooked_by: null,
        leftover_of: input.leftover_of ?? null,
      };
      if (inWindow(optimistic)) upsertLocal(optimistic);
      try {
        const res = await fetch("/api/plan/meals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (res.status === 409) {
          const j = (await res.json()) as { meal?: PlannedMeal };
          if (j.meal) upsertLocal(j.meal);
          return j.meal ?? null;
        }
        if (!res.ok) return null;
        const j = (await res.json()) as { meal: PlannedMeal };
        upsertLocal(j.meal);
        return j.meal;
      } catch {
        return null; // offline: the optimistic row is removed in finally
      } finally {
        removeLocal(tempId);
      }
    },
    [inWindow, upsertLocal, removeLocal],
  );

  const remove = useCallback(
    async (id: number) => {
      const before = meals.find((m) => m.id === id);
      removeLocal(id);
      try {
        const res = await fetch(`/api/plan/meals/${id}`, { method: "DELETE" });
        if (!res.ok && before) upsertLocal(before);
        return res.ok;
      } catch {
        if (before) upsertLocal(before);
        return false;
      }
    },
    [meals, removeLocal, upsertLocal],
  );

  const patch = useCallback(
    async (id: number, p: PlannedMealPatch) => {
      const before = meals.find((m) => m.id === id);
      if (before) upsertLocal({ ...before, ...p } as PlannedMeal);
      const seq = (patchSeq.current[id] = (patchSeq.current[id] ?? 0) + 1);
      try {
        const res = await fetch(`/api/plan/meals/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(p),
        });
        if (!res.ok) {
          if (before) upsertLocal(before);
          return;
        }
        const j = (await res.json()) as { meal: PlannedMeal };
        // Rapid taps: only the latest response for this row may land (an older one would flicker the eaters back).
        if (patchSeq.current[id] === seq) upsertLocal(j.meal);
      } catch {
        if (before) upsertLocal(before);
      }
    },
    [meals, upsertLocal],
  );

  /** Home or office for one person on one day. Optimistic; reverts on failure. */
  const setLunch = useCallback(
    async (planned_for: string, person: LunchPerson, location: LunchLocation): Promise<boolean> => {
      const before = lunch.find((x) => x.planned_for === planned_for && x.person === person);
      const revert = () => (before ? upsertLunchLocal(before) : removeLunchLocal(planned_for, person));
      upsertLunchLocal({ planned_for, person, location, updated_by: null, updated_at: new Date().toISOString() });
      try {
        const res = await fetch("/api/plan/lunch", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ planned_for, person, location }),
        });
        if (!res.ok) {
          revert();
          return false;
        }
        const j = (await res.json()) as { row: LunchLocationRow };
        upsertLunchLocal(j.row);
        return true;
      } catch {
        revert();
        return false;
      }
    },
    [lunch, upsertLunchLocal, removeLunchLocal],
  );

  return { meals, lunch, status, add, remove, patch, setLunch, refetch };
}

function sortMeals(ms: PlannedMeal[]): PlannedMeal[] {
  const slotOrder: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
  return ms.slice().sort(
    (a, b) =>
      a.planned_for.localeCompare(b.planned_for) ||
      (slotOrder[a.slot] ?? 9) - (slotOrder[b.slot] ?? 9) ||
      a.position - b.position ||
      a.id - b.id,
  );
}
