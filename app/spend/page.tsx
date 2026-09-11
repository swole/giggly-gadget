import type { Metadata } from "next";
import { SpendPage } from "@/components/spend/SpendPage";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getRole } from "@/lib/role.server";
import { isPlanner } from "@/lib/role";
import { currentWeekMonday, isValidYmd, weekMondayOf } from "@/lib/week";
import { expensesReady, getSpendTrendRows, getSpendWeek } from "@/lib/spend/queries";
import { trendWeeks } from "@/lib/spend/summary";
import { EMPTY_OWED } from "@/lib/spend/types";
import type { GroceryRow } from "@/components/GroceryList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spend · Giggly Gadget",
  description: "What the week's shop cost.",
};

export default async function SpendRoute({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week: w } = await searchParams;
  const week = isValidYmd(w) ? weekMondayOf(w) : currentWeekMonday();
  const role = await getRole();

  // Same shape as /add for a non-planner: the page exists, it is simply not theirs.
  if (!isPlanner(role)) {
    return (
      <main className="relative z-10 mx-auto max-w-2xl px-4 pt-10 sm:px-6">
        <span className="text-[11px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Spend</span>
        <p className="font-display-italic mt-3 text-2xl text-[var(--color-body)]">Johnny and Lydia keep the accounts.</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">Your shop totals go in from the money chips on the shopping list.</p>
      </main>
    );
  }

  const ready = await expensesReady();
  const [spend, trendRows, grocery] = await Promise.all([
    ready ? getSpendWeek(week) : Promise.resolve({ week_of: week, expenses: [], owed: EMPTY_OWED }),
    ready ? getSpendTrendRows(week, 6) : Promise.resolve([]),
    supabaseAdmin().from("grocery_list").select("*").eq("week_of", week).order("name"),
  ]);

  return (
    <SpendPage
      key={week}
      initial={{ ...spend, ready }}
      rows={(grocery.data ?? []) as GroceryRow[]}
      trend={trendWeeks(trendRows, week, 6)}
    />
  );
}
