"use client";

// The week's spend on a phone: starts from the server's snapshot, refetches the week (items
// included) whenever any expense changes (Realtime publishes `expenses` only), and when the
// phone wakes. Unfiltered on purpose: "owed" spans weeks, so a payback marked on /spend must
// reach the helper's /grocery banner too. The table is a few rows a week.

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SpendState, SpendWeek } from "./types";

export function useExpenses(initial: SpendState) {
  const [state, setState] = useState<SpendWeek>({ week_of: initial.week_of, expenses: initial.expenses, owed: initial.owed });
  const { ready, week_of: week } = initial;

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      const res = await fetch(`/api/spend?week=${week}`, { cache: "no-store" });
      if (res.ok) setState((await res.json()) as SpendWeek);
    } catch {
      /* offline in the shop: keep what we have */
    }
  }, [ready, week]);

  useEffect(() => {
    if (!ready) return;
    const supa = supabaseBrowser();
    const ch = supa
      .channel(`expenses:${week}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => void refresh())
      .subscribe();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      supa.removeChannel(ch);
    };
  }, [ready, week, refresh]);

  return { ...state, ready, refresh, replace: setState };
}
