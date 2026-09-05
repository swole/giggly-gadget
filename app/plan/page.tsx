import { WeekPlanner } from "@/components/plan/WeekPlanner";
import { getLunchLocationsBetween, getPlannedMealsForWeek, listPlannerRecipes } from "@/lib/plan/queries";
import { analyseRecipes } from "@/lib/plan/analysis";
import { addDays, currentWeekMonday, isoDow, isValidYmd, todayInTz, weekMondayOf } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  // Planning happens on weekends for the week ahead: from Friday (isoDow ≥ 4, Mon=0)
  // the default week pivots forward, same rule as the grocery page's shop banner.
  // An explicit ?week always wins; the planner shows a one-line way back.
  const today = todayInTz();
  const autoForward = !isValidYmd(week) && isoDow(today) >= 4;
  const weekOf = isValidYmd(week) ? weekMondayOf(week) : autoForward ? addDays(currentWeekMonday(), 7) : currentWeekMonday();
  const [meals, recipes, analysis, lunch] = await Promise.all([
    getPlannedMealsForWeek(weekOf),
    listPlannerRecipes(),
    analyseRecipes(null), // all recipes: the picker can add any of them, chips must know them all
    getLunchLocationsBetween(weekOf, addDays(weekOf, 6)),
  ]);
  return (
    <WeekPlanner
      key={weekOf}
      weekOf={weekOf}
      today={today}
      initialMeals={meals}
      initialLunch={lunch}
      recipes={recipes}
      classByRecipe={analysis.classByRecipe}
      proteinByRecipe={analysis.proteinByRecipe}
      autoForward={autoForward}
    />
  );
}
