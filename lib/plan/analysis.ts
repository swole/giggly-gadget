// Server-side per-recipe facts the planner and kitchen render: protein class (for the
// weekly floors/caps), the J/L protein grams note, and prep-ahead hints.
import { supabaseAdmin } from "@/lib/supabase/server";
import { classifyProtein, type ProteinClass } from "./constraints";
import { prepHints, proteinSplit } from "./hints";

export type RecipeAnalysis = {
  classByRecipe: Record<string, ProteinClass[]>;
  proteinByRecipe: Record<string, { j: number; l: number }>;
  hintsByRecipe: Record<string, string[]>;
};

type IngLite = { recipe_id: string; name: string | null; raw: string };

// Supabase/PostgREST caps a single select at 1,000 rows; ingredients_parsed has ~2,300.
// Page through it or the later recipes silently lose their ingredients (and classify wrong).
async function allIngredients(supa: ReturnType<typeof supabaseAdmin>, ids: string[] | null): Promise<IngLite[]> {
  const out: IngLite[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = supa.from("ingredients_parsed").select("recipe_id, name, raw").order("id").range(from, from + page - 1);
    if (ids) q = q.in("recipe_id", ids);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as IngLite[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

// The all-recipes analysis (every /plan request) reads ~190 recipe bodies + ~2,300 ingredient rows.
// Recipes only change when the sync runs, so cache per server instance for a few minutes, keyed by
// the newest synced_at + row count (cheap query) so a fresh sync invalidates it immediately.
let allCache: { key: string; at: number; value: RecipeAnalysis } | null = null;
const ALL_TTL_MS = 10 * 60 * 1000;

async function analysisVersion(supa: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const [{ data: newest }, { count }] = await Promise.all([
    supa.from("recipes").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
    supa.from("recipes").select("id", { count: "exact", head: true }),
  ]);
  return `${(newest as { synced_at?: string } | null)?.synced_at ?? ""}|${count ?? 0}`;
}

/** Analyse a set of recipes (or all when ids is null). */
export async function analyseRecipes(ids: string[] | null): Promise<RecipeAnalysis> {
  const supa = supabaseAdmin();
  if (ids && ids.length === 0) return { classByRecipe: {}, proteinByRecipe: {}, hintsByRecipe: {} };
  if (ids === null) {
    const key = await analysisVersion(supa);
    if (allCache && allCache.key === key && Date.now() - allCache.at < ALL_TTL_MS) return allCache.value;
    const value = await analyseUncached(supa, null);
    allCache = { key, at: Date.now(), value };
    return value;
  }
  return analyseUncached(supa, ids);
}

async function analyseUncached(supa: ReturnType<typeof supabaseAdmin>, ids: string[] | null): Promise<RecipeAnalysis> {
  let rq = supa.from("recipes").select("id, title, instructions_md");
  if (ids) rq = rq.in("id", ids);
  const [{ data: recipes }, ings] = await Promise.all([rq, allIngredients(supa, ids)]);

  const namesBy = new Map<string, string[]>();
  const rawsBy = new Map<string, string[]>();
  for (const i of ings) {
    if (i.name) (namesBy.get(i.recipe_id) ?? namesBy.set(i.recipe_id, []).get(i.recipe_id)!).push(i.name);
    (rawsBy.get(i.recipe_id) ?? rawsBy.set(i.recipe_id, []).get(i.recipe_id)!).push(i.raw);
  }

  const classByRecipe: Record<string, ProteinClass[]> = {};
  const proteinByRecipe: Record<string, { j: number; l: number }> = {};
  const hintsByRecipe: Record<string, string[]> = {};
  for (const r of (recipes ?? []) as { id: string; title: string; instructions_md: string | null }[]) {
    classByRecipe[r.id] = Array.from(classifyProtein(r.title, namesBy.get(r.id) ?? []));
    const p = proteinSplit(r.instructions_md);
    if (p) proteinByRecipe[r.id] = p;
    const h = prepHints(r.instructions_md, rawsBy.get(r.id) ?? []);
    if (h.length) hintsByRecipe[r.id] = h;
  }
  return { classByRecipe, proteinByRecipe, hintsByRecipe };
}
