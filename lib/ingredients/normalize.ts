// Convert between units within the same dimension (mass/volume) so we can
// dedupe ingredients across multiple recipes when generating a grocery list.

const MASS_TO_G: Record<string, number> = {
  g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592,
};
const VOL_TO_ML: Record<string, number> = {
  ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588,
};

export type Dimension = "mass" | "volume" | "count" | "unknown";

export function dimensionOf(unit: string | null | undefined): Dimension {
  if (!unit) return "count";
  if (unit in MASS_TO_G) return "mass";
  if (unit in VOL_TO_ML) return "volume";
  return "unknown";
}

// Convert qty from `fromUnit` to `toUnit`. Returns null if not convertible.
export function convert(qty: number, fromUnit: string, toUnit: string): number | null {
  if (fromUnit === toUnit) return qty;
  if (fromUnit in MASS_TO_G && toUnit in MASS_TO_G) {
    return (qty * MASS_TO_G[fromUnit]) / MASS_TO_G[toUnit];
  }
  if (fromUnit in VOL_TO_ML && toUnit in VOL_TO_ML) {
    return (qty * VOL_TO_ML[fromUnit]) / VOL_TO_ML[toUnit];
  }
  return null;
}

// Pick the "largest" unit in a dimension (the one with the biggest base conversion).
function largestUnit(units: string[], dim: Dimension): string {
  if (dim === "mass") {
    return units.reduce((a, b) => (MASS_TO_G[a] >= MASS_TO_G[b] ? a : b));
  }
  if (dim === "volume") {
    return units.reduce((a, b) => (VOL_TO_ML[a] >= VOL_TO_ML[b] ? a : b));
  }
  return units[0];
}

export type GroceryItemInput = {
  recipe_id: string;
  name: string;
  qty_min: number | null;
  qty_max: number | null;
  unit: string | null;
  category: string | null;
  scalable: boolean;
  to_taste: boolean;
};

export type GroceryItem = {
  name: string;
  qty_min: number | null;
  qty_max: number | null;
  unit: string | null;
  category: string | null;
  recipe_ids: string[];
};

// Dedupe + sum ingredients across recipes. Same-name + same-dimension entries
// get unit-converted into the largest unit and summed. Different-dimension entries
// for the same name stay separate.
export function buildGroceryList(items: GroceryItemInput[]): GroceryItem[] {
  // group by (name, dimension)
  const groups = new Map<string, GroceryItemInput[]>();
  for (const it of items) {
    if (it.to_taste) continue;
    const dim = dimensionOf(it.unit);
    const key = `${it.name.toLowerCase()}|${dim}`;
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }

  const out: GroceryItem[] = [];
  for (const [key, arr] of groups) {
    const [, dim] = key.split("|") as [string, Dimension];
    const allUnits = Array.from(new Set(arr.map((x) => x.unit).filter(Boolean) as string[]));
    let canonicalUnit: string | null = null;
    let totalMin = 0;
    let totalMax = 0;
    let hasMax = false;
    let allScalable = true;

    if (dim === "mass" || dim === "volume") {
      canonicalUnit = largestUnit(allUnits, dim);
      for (const it of arr) {
        if (it.qty_min === null || !it.unit) { allScalable = false; continue; }
        const minIn = convert(it.qty_min, it.unit, canonicalUnit);
        const maxIn = it.qty_max !== null ? convert(it.qty_max, it.unit, canonicalUnit) : null;
        if (minIn === null) { allScalable = false; continue; }
        totalMin += minIn;
        if (maxIn !== null) { totalMax += maxIn; hasMax = true; }
        else totalMax += minIn;
      }
    } else {
      // count or unknown — only sum if all share the same unit
      const unique = allUnits.length;
      if (unique <= 1) {
        canonicalUnit = allUnits[0] ?? null;
        for (const it of arr) {
          if (it.qty_min === null) { allScalable = false; continue; }
          totalMin += it.qty_min;
          if (it.qty_max !== null) { totalMax += it.qty_max; hasMax = true; }
          else totalMax += it.qty_min;
        }
      } else {
        // Mixed units we can't convert — fall back to listing the first entry's unit
        // and summing pieces (caller can pick this up later)
        canonicalUnit = arr[0].unit ?? null;
        for (const it of arr) {
          if (it.qty_min === null) { allScalable = false; continue; }
          totalMin += it.qty_min;
          if (it.qty_max !== null) { totalMax += it.qty_max; hasMax = true; }
          else totalMax += it.qty_min;
        }
      }
    }

    out.push({
      name: arr[0].name,
      qty_min: allScalable && totalMin > 0 ? round1(totalMin) : null,
      qty_max: allScalable && hasMax && totalMax > totalMin ? round1(totalMax) : null,
      unit: canonicalUnit,
      category: arr[0].category,
      recipe_ids: Array.from(new Set(arr.map((x) => x.recipe_id))),
    });
  }

  return out.sort(byCategoryThenName);
}

// Two decimals: keeps quarters (¼ cabbage) renderable as fractions instead of "0.3".
function round1(n: number): number {
  return Math.round(n * 100) / 100;
}

const CAT_ORDER = ["produce", "protein", "dairy", "grain", "pantry", "spice", "other"];
function byCategoryThenName(a: GroceryItem, b: GroceryItem): number {
  const ca = CAT_ORDER.indexOf(a.category ?? "other");
  const cb = CAT_ORDER.indexOf(b.category ?? "other");
  if (ca !== cb) return ca - cb;
  return a.name.localeCompare(b.name);
}
