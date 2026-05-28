import { notFound } from "next/navigation";
import { getRecipe, getRecipeIngredients } from "@/lib/recipes";
import { RecipeDetail } from "@/components/RecipeDetail";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, ingredients] = await Promise.all([
    getRecipe(id),
    getRecipeIngredients(id),
  ]);
  if (!recipe) notFound();
  return <RecipeDetail recipe={recipe} ingredients={ingredients} />;
}
