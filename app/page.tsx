import { KitchenView, type ShopAhead } from "@/components/kitchen/KitchenView";
import { getLunchLocationsBetween, getPlannedMealsBetween, listPlannerRecipes } from "@/lib/plan/queries";
import { analyseRecipes } from "@/lib/plan/analysis";
import type { PlannerRecipe } from "@/lib/plan/types";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addDays, currentWeekMonday, isoDow, todayInTz } from "@/lib/week";

export const dynamic = "force-dynamic";

// Home = Kitchen for everyone. Today first is what every role checks most; the
// planner is one tab away for Johnny and Lydia.
export default async function Home() {
  const today = todayInTz();
  const [meals, recipes, lunch] = await Promise.all([
    getPlannedMealsBetween(today, addDays(today, 6)),
    listPlannerRecipes(),
    getLunchLocationsBetween(today, addDays(today, 6)),
  ]);
  const byId: Record<string, PlannerRecipe> = {};
  for (const r of recipes) byId[r.id] = r;
  const { hintsByRecipe } = await analyseRecipes(Array.from(new Set(meals.map((m) => m.recipe_id).filter((id): id is string => id !== null))));

  // The Kitchen knows it's shop day: from Friday, an empty today points at next
  // week's shopping list with honest counts (Shallaine shops Saturday).
  let shopAhead: ShopAhead = null;
  if (isoDow(today) >= 4) {
    const next = addDays(currentWeekMonday(), 7);
    const supa = supabaseAdmin();
    const [{ count: nextMeals }, { count: items }] = await Promise.all([
      supa.from("planned_meals").select("id", { count: "exact", head: true }).eq("week_of", next),
      supa.from("grocery_list").select("id", { count: "exact", head: true }).eq("week_of", next).eq("staple", false),
    ]);
    shopAhead = { week: next, meals: nextMeals ?? 0, items: items ?? 0 };
  }

  return <KitchenView today={today} initialMeals={meals} initialLunch={lunch} recipes={byId} hintsByRecipe={hintsByRecipe} shopAhead={shopAhead} />;
}
