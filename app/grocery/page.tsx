import { GroceryList, type GroceryRow, type NextShop } from "@/components/GroceryList";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addDays, currentWeekMonday, isoDow, isValidYmd, todayInTz, weekMondayOf } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function GroceryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: w } = await searchParams;
  const week = isValidYmd(w) ? weekMondayOf(w) : currentWeekMonday();
  const supa = supabaseAdmin();
  const { data } = await supa
    .from("grocery_list")
    .select("*")
    .eq("week_of", week)
    .order("checked")
    .order("category")
    .order("name");

  // Shallaine shops on Saturday FOR the coming week: from Friday on, the current
  // week's list points at next week's, with honest counts (or "not planned yet").
  const today = todayInTz();
  const current = currentWeekMonday();
  let nextShop: NextShop = null;
  if (week === current && isoDow(today) >= 4) {
    const next = addDays(current, 7);
    const [{ count: meals }, { count: items }] = await Promise.all([
      supa.from("planned_meals").select("id", { count: "exact", head: true }).eq("week_of", next),
      supa.from("grocery_list").select("id", { count: "exact", head: true }).eq("week_of", next).eq("staple", false),
    ]);
    nextShop = { week: next, meals: meals ?? 0, items: items ?? 0 };
  }

  // keyed by week so navigating weeks remounts with fresh initial rows
  return <GroceryList key={week} initial={(data ?? []) as GroceryRow[]} week={week} nextShop={nextShop} />;
}
