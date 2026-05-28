import { GroceryList, type GroceryRow } from "@/components/GroceryList";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentWeekMonday } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function GroceryPage() {
  const week = currentWeekMonday();
  const supa = supabaseAdmin();
  const { data } = await supa
    .from("grocery_list")
    .select("*")
    .eq("week_of", week)
    .order("checked")
    .order("category")
    .order("name");

  return <GroceryList initial={(data ?? []) as GroceryRow[]} week={week} />;
}
