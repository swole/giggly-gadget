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

// Three postures, three voices: a met rail nods, an unmet floor says what's left,
// a broken cap says it in words — "Chicken ×3 — cap is 1", not an inequality to
// parse while planning dinner.
export type ConstraintState = "met" | "pending" | "violated";
export type ConstraintStatus = {
  key: string;
  label: string;
  count: number;
  target: string;
  ok: boolean;
  state: ConstraintState;
  /** Ready-to-render sentence for the chip. */
  text: string;
};

const floorStatus = (key: string, label: string, count: number, floor: number, unit: string): ConstraintStatus => {
  const met = count >= floor;
  return {
    key,
    label,
    count,
    target: `≥ ${floor}`,
    ok: met,
    state: met ? "met" : "pending",
    text: met ? `${label} ${count} ✓` : `${floor - count} more ${unit}`,
  };
};

const capStatus = (key: string, label: string, count: number, cap: number): ConstraintStatus => {
  const met = count <= cap;
  return {
    key,
    label,
    count,
    target: `≤ ${cap}`,
    ok: met,
    state: met ? "met" : "violated",
    text: met ? `${label} ${count} of ${cap} ✓` : `${label} ×${count} — cap is ${cap}`,
  };
};

/**
 * The week's floors and caps from the dietitian plan.
 * oily fish ≥ 3 · chicken ≤ 1 · prawn/seafood ≤ 2 (plant-first is the default; these are the guard rails)
 */
export function weekConstraintStatus(
  meals: { recipe_id: string | null; slot: string; leftover_of: number | null }[],
  classByRecipe: Record<string, ProteinClass[]>,
): ConstraintStatus[] {
  let oily = 0, chicken = 0, shellfish = 0;
  for (const m of meals) {
    if (m.leftover_of !== null) continue; // leftovers do not count twice
    if (m.recipe_id === null) continue; // one-off items carry no protein class
    const c = new Set(classByRecipe[m.recipe_id] ?? []);
    if (c.has("oily_fish")) oily++;
    if (c.has("chicken")) chicken++;
    if (c.has("prawn") || c.has("seafood")) shellfish++;
  }
  return [
    floorStatus("oily_fish", "Oily fish", oily, 3, "oily fish"),
    capStatus("chicken", "Chicken", chicken, 1),
    capStatus("shellfish", "Prawn / seafood", shellfish, 2),
  ];
}
