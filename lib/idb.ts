// Tiny IndexedDB wrapper for offline recipe cache.
// Cooking-counter use case: recipes load from network on warm path, fall through
// to IDB when airplane-mode or weak signal.

import { get, set, del, keys } from "idb-keyval";

const RECIPE_PREFIX = "recipe:";
const INDEX_KEY = "recipe-index";

type RecipeRow = { id: string; title: string; cuisine: string | null; meal_type: string | null };

export async function cacheRecipe<T extends { id: string }>(recipe: T): Promise<void> {
  await set(`${RECIPE_PREFIX}${recipe.id}`, recipe);
}

export async function cacheRecipeIndex(rows: RecipeRow[]): Promise<void> {
  await set(INDEX_KEY, { updatedAt: Date.now(), rows });
}

export async function loadCachedRecipe<T>(id: string): Promise<T | undefined> {
  return (await get(`${RECIPE_PREFIX}${id}`)) as T | undefined;
}

export async function loadCachedIndex(): Promise<{ updatedAt: number; rows: RecipeRow[] } | undefined> {
  return (await get(INDEX_KEY)) as { updatedAt: number; rows: RecipeRow[] } | undefined;
}

export async function clearCache(): Promise<void> {
  const ks = await keys();
  await Promise.all(
    ks
      .filter((k) => typeof k === "string" && (k.startsWith(RECIPE_PREFIX) || k === INDEX_KEY))
      .map((k) => del(k))
  );
}
