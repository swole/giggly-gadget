// Weekly dietitian floors/caps, computed from what is actually in the recipes.
// Classification uses ingredient names first (title keywording misfires on
// "fish-fragrant eggplant" and misses "yong tau foo", which is fish paste).

export type ProteinClass = "oily_fish" | "white_fish" | "prawn" | "seafood" | "chicken" | "pork" | "beef" | "tofu" | "egg";

const OILY = /\b(salmon|saba|mackerel|kembung|sardines?|tuna|trout|herring|anchovy|anchovies|eel|unagi|black cod|ikan bilis)\b/i;
const WHITE = /\b(seabass|sea bass|cod|tilapia|snapper|grouper|barramundi|pomfret|threadfin|batang|stingray|halibut|haddock|white fish|fish (?:fillet|slices?|paste|balls?|cake)|fish)\b/i;
const PRAWN = /\b(prawns?|shrimps?)\b/i;
const SEAFOOD = /\b(squid|calamari|clams?|vongole|scallops?|mussels?|crab|cockles?|octopus|oysters?)\b/i;
const CHICKEN = /\b(chicken|poultry)\b/i;
const PORK = /\b(pork|bacon|ham|char siu|sausage)\b/i;
const BEEF = /\b(beef|steak|brisket|mince(?:d)? beef|lamb|mutton)\b/i;
const TOFU = /\b(tofu|tau kwa|tau pok|tempeh|beancurd|edamame|chickpeas?|lentils?|dhal|dahl|kidney beans|black beans|cannellini)\b/i;
const EGG = /\b(eggs?|egg whites?)\b/i;

// Things that contain a protein word but are not the protein of the dish.
const EXCLUDE =
  /\b(fish[- ]fragrant|fish sauce|oyster sauce|oyster mushrooms?|king oyster|chicken (?:stock|broth|powder|bouillon)|beef (?:stock|broth)|anchovy paste|shrimp paste|belacan|dashi|bonito|crab ?sticks?|fish ?balls?|egg ?plants?)\b/i;

export function classifyProtein(title: string, ingredientNames: string[]): Set<ProteinClass> {
  const out = new Set<ProteinClass>();
  const check = (s: string) => {
    if (!s || EXCLUDE.test(s)) return;
    if (OILY.test(s)) out.add("oily_fish");
    else if (WHITE.test(s)) out.add("white_fish");
    if (PRAWN.test(s)) out.add("prawn");
    if (SEAFOOD.test(s)) out.add("seafood");
    if (CHICKEN.test(s)) out.add("chicken");
    if (PORK.test(s)) out.add("pork");
    if (BEEF.test(s)) out.add("beef");
    if (TOFU.test(s)) out.add("tofu");
    if (EGG.test(s)) out.add("egg");
  };
  for (const n of ingredientNames) check(n);
  if (out.size === 0) check(title); // fall back to the title only when nothing parsed
  // "white fish" in a title should not double count when the ingredient list said oily
  return out;
}

export type ConstraintStatus = { key: string; label: string; count: number; target: string; ok: boolean };

/**
 * The week's floors and caps from the dietitian plan.
 * oily fish ≥ 3 · chicken ≤ 1 · prawn/seafood ≤ 2 (plant-first is the default; these are the guard rails)
 */
export function weekConstraintStatus(
  meals: { recipe_id: string; slot: string; leftover_of: number | null }[],
  classByRecipe: Record<string, ProteinClass[]>,
): ConstraintStatus[] {
  let oily = 0, chicken = 0, shellfish = 0;
  for (const m of meals) {
    if (m.leftover_of !== null) continue; // leftovers do not count twice
    const c = new Set(classByRecipe[m.recipe_id] ?? []);
    if (c.has("oily_fish")) oily++;
    if (c.has("chicken")) chicken++;
    if (c.has("prawn") || c.has("seafood")) shellfish++;
  }
  return [
    { key: "oily_fish", label: "Oily fish", count: oily, target: "≥ 3", ok: oily >= 3 },
    { key: "chicken", label: "Chicken", count: chicken, target: "≤ 1", ok: chicken <= 1 },
    { key: "shellfish", label: "Prawn / seafood", count: shellfish, target: "≤ 2", ok: shellfish <= 2 },
  ];
}
