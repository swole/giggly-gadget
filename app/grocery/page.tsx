import { GroceryList, type GroceryRow } from "@/components/GroceryList";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentWeekMonday, isValidYmd, weekMondayOf } from "@/lib/week";

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

  // keyed by week so navigating weeks remounts with fresh initial rows
  return <GroceryList key={week} initial={(data ?? []) as GroceryRow[]} week={week} />;
}
