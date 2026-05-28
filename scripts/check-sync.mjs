import { createClient } from "@supabase/supabase-js";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { count: recipeCount } = await supa
  .from("recipes")
  .select("*", { count: "exact", head: true });

const { count: ingCount } = await supa
  .from("ingredients_parsed")
  .select("*", { count: "exact", head: true });

const { count: scalableCount } = await supa
  .from("ingredients_parsed")
  .select("*", { count: "exact", head: true })
  .eq("scalable", true);

const { count: toTasteCount } = await supa
  .from("ingredients_parsed")
  .select("*", { count: "exact", head: true })
  .eq("to_taste", true);

const { count: parseIssuesCount } = await supa
  .from("parse_issues")
  .select("*", { count: "exact", head: true });

// Recipes with no parsed ingredients at all (likely placeholder pages)
const { data: emptyRecipes } = await supa
  .rpc("noop_check", {}, { count: "exact" }) // ignore
  .select() // dummy to avoid type errors
  .then(() => ({ data: null }), () => ({ data: null }));

// Manual approach since rpc above won't work without function
const { data: recipesWithIngs } = await supa
  .from("ingredients_parsed")
  .select("recipe_id")
  .limit(10000);
const recipesWithIngSet = new Set((recipesWithIngs ?? []).map((r) => r.recipe_id));
const { data: allRecipes } = await supa
  .from("recipes")
  .select("id, title")
  .limit(100);
const emptyTitles = (allRecipes ?? [])
  .filter((r) => !recipesWithIngSet.has(r.id))
  .map((r) => r.title);

// Sample parse issues
const { data: issues } = await supa
  .from("parse_issues")
  .select("raw, reason")
  .limit(15);

// Top categories
const { data: cats } = await supa
  .from("ingredients_parsed")
  .select("category");
const catCounts = {};
for (const r of cats ?? []) catCounts[r.category ?? "null"] = (catCounts[r.category ?? "null"] ?? 0) + 1;

console.log("=== SYNC HEALTH ===");
console.log(`Recipes:                ${recipeCount}`);
console.log(`Ingredient lines:       ${ingCount}`);
console.log(`  scalable (qty parsed):${scalableCount}  (${pct(scalableCount, ingCount)})`);
console.log(`  to-taste:             ${toTasteCount}  (${pct(toTasteCount, ingCount)})`);
console.log(`  parse issues:         ${parseIssuesCount}  (${pct(parseIssuesCount, ingCount)})`);
console.log();
console.log(`Recipes with 0 parsed ingredients (likely placeholder pages):`);
for (const t of emptyTitles) console.log(`  - ${t}`);
console.log();
console.log(`Category distribution:`);
for (const [k, v] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${v}`);
}
console.log();
console.log(`Sample of parse issues (first 15):`);
for (const i of issues ?? []) {
  console.log(`  [${i.reason}] ${i.raw}`);
}

function pct(n, total) {
  if (!total) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}
