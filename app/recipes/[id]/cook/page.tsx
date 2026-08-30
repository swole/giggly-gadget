import { notFound } from "next/navigation";
import { getRecipe, getRecipeIngredients, extractMethodSteps } from "@/lib/recipes";
import { CookMode } from "@/components/CookMode";

export const dynamic = "force-dynamic";

export default async function CookModePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, ingredients] = await Promise.all([getRecipe(id), getRecipeIngredients(id)]);
  if (!recipe) notFound();
  const steps = extractMethodSteps(recipe.instructions_md);
  return <CookMode recipe={recipe} steps={steps} ingredients={ingredients} />;
}
