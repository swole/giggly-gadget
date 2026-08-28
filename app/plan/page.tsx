import { WeekPlanner } from "@/components/plan/WeekPlanner";
import { getPlannedMealsForWeek, listPlannerRecipes } from "@/lib/plan/queries";
import { analyseRecipes } from "@/lib/plan/analysis";
import { currentWeekMonday, isValidYmd, todayInTz, weekMondayOf } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const weekOf = isValidYmd(week) ? weekMondayOf(week) : currentWeekMonday();
  const [meals, recipes, analysis] = await Promise.all([
    getPlannedMealsForWeek(weekOf),
    listPlannerRecipes(),
    analyseRecipes(null), // all recipes: the picker can add any of them, chips must know them all
  ]);
  return (
    <WeekPlanner
      key={weekOf}
      weekOf={weekOf}
      today={todayInTz()}
      initialMeals={meals}
      recipes={recipes}
      classByRecipe={analysis.classByRecipe}
      proteinByRecipe={analysis.proteinByRecipe}
    />
  );
}
