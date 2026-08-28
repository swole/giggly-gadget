import { KitchenView } from "@/components/kitchen/KitchenView";
import { getPlannedMealsBetween, listPlannerRecipes } from "@/lib/plan/queries";
import { analyseRecipes } from "@/lib/plan/analysis";
import type { PlannerRecipe } from "@/lib/plan/types";
import { addDays, todayInTz } from "@/lib/week";

export const dynamic = "force-dynamic";

// Home = Kitchen for everyone. Today first is what every role checks most; the
// planner is one tab away for Johnny and Lydia.
export default async function Home() {
  const today = todayInTz();
  const [meals, recipes] = await Promise.all([
    getPlannedMealsBetween(today, addDays(today, 6)),
    listPlannerRecipes(),
  ]);
  const byId: Record<string, PlannerRecipe> = {};
  for (const r of recipes) byId[r.id] = r;
  const { hintsByRecipe } = await analyseRecipes(Array.from(new Set(meals.map((m) => m.recipe_id))));
  return <KitchenView today={today} initialMeals={meals} recipes={byId} hintsByRecipe={hintsByRecipe} />;
}
