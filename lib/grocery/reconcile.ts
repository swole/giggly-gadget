// Reconcile the grocery list a plan *wants* with the rows that *exist* for the week.
//
// Rules (see the plan doc): never wipe-and-reinsert. Match by (lower(name), unit).
//   - desired + existing → UPDATE quantities/recipes/category/shop/staple; keep id and
//     checked state. A manual row that the plan now also needs is absorbed into the
//     plan row (source flips to 'plan'); its checked state survives.
//   - desired only       → INSERT with source 'plan'.
//   - existing only      → DELETE if source 'plan' (the plan no longer needs it);
//                          manual rows are left alone.
// Stable ids mean other phones see UPDATE events, not delete/insert churn.

export type DesiredRow = {
  name: string;
  qty_min: number | null;
  qty_max: number | null;
  unit: string | null;
  category: string | null;
  recipe_ids: string[];
  shop: string;
  staple: boolean;
};

export type ExistingRow = {
  id: number;
  name: string;
  qty_min: number | null;
  qty_max: number | null;
  unit: string | null;
  category: string | null;
  recipe_ids: string[];
  checked: boolean;
  source: "plan" | "manual";
  shop: string | null;
  staple: boolean;
};

export type RowPatch = Partial<
  Pick<ExistingRow, "qty_min" | "qty_max" | "category" | "recipe_ids" | "shop" | "staple" | "source" | "checked">
>;

export type ReconcileResult = {
  inserts: (DesiredRow & { source: "plan" })[];
  updates: { id: number; patch: RowPatch }[];
  deletes: number[];
  keptManual: number;
  unchanged: number;
};

export function rowKey(name: string, unit: string | null | undefined): string {
  return `${name.trim().toLowerCase()}|${unit ?? ""}`;
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

function num(n: number | null): number | null {
  return n === null ? null : Number(n);
}

export function reconcileGrocery(desired: DesiredRow[], existing: ExistingRow[]): ReconcileResult {
  const res: ReconcileResult = { inserts: [], updates: [], deletes: [], keptManual: 0, unchanged: 0 };

  const existingByKey = new Map<string, ExistingRow>();
  for (const e of existing) existingByKey.set(rowKey(e.name, e.unit), e);

  const desiredKeys = new Set<string>();
  for (const d of desired) {
    const key = rowKey(d.name, d.unit);
    desiredKeys.add(key);
    const e = existingByKey.get(key);
    if (!e) {
      res.inserts.push({ ...d, source: "plan" });
      continue;
    }
    const patch: RowPatch = {};
    if (num(e.qty_min) !== d.qty_min) patch.qty_min = d.qty_min;
    if (num(e.qty_max) !== d.qty_max) patch.qty_max = d.qty_max;
    if ((e.category ?? null) !== (d.category ?? null)) patch.category = d.category;
    if (!sameIds(e.recipe_ids ?? [], d.recipe_ids)) patch.recipe_ids = d.recipe_ids;
    if ((e.shop ?? null) !== d.shop) patch.shop = d.shop;
    if (e.staple !== d.staple) patch.staple = d.staple;
    if (e.source !== "plan") patch.source = "plan"; // absorb the manual row
    // Quantity went UP (someone added a meal after shopping started) → un-check so it gets re-bought.
    if (e.checked && num(e.qty_min) !== null && d.qty_min !== null && d.qty_min > (num(e.qty_min) as number) + 1e-9) {
      patch.checked = false;
    }
    if (Object.keys(patch).length === 0) res.unchanged++;
    else res.updates.push({ id: e.id, patch });
  }

  for (const e of existing) {
    const key = rowKey(e.name, e.unit);
    if (desiredKeys.has(key)) continue;
    if (e.source === "plan") res.deletes.push(e.id);
    else res.keptManual++;
  }

  return res;
}
