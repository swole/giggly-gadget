import { Discover } from "@/components/Discover";
import { listRecipes } from "@/lib/recipes";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await listRecipes();
  return <Discover recipes={recipes} />;
}
