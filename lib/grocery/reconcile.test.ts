import { reconcileGrocery, type DesiredRow, type ExistingRow } from "./reconcile";

const d = (o: Partial<DesiredRow> & { name: string }): DesiredRow => ({
  qty_min: 1, qty_max: null, unit: null, category: "produce", recipe_ids: ["r1"], shop: "wet_market", staple: false, ...o,
});
const e = (o: Partial<ExistingRow> & { id: number; name: string }): ExistingRow => ({
  qty_min: 1, qty_max: null, unit: null, category: "produce", recipe_ids: ["r1"], checked: false,
  source: "plan", shop: "wet_market", staple: false, ...o,
});

describe("reconcileGrocery", () => {
  test("empty existing → everything inserted as plan rows", () => {
    const r = reconcileGrocery([d({ name: "soft tofu", qty_min: 415, unit: "g" })], []);
    expect(r.inserts).toHaveLength(1);
    expect(r.inserts[0].source).toBe("plan");
    expect(r.updates).toHaveLength(0);
    expect(r.deletes).toHaveLength(0);
  });

  test("identical rows are untouched (id + checked preserved)", () => {
    const r = reconcileGrocery(
      [d({ name: "soft tofu", qty_min: 415, unit: "g" })],
      [e({ id: 7, name: "soft tofu", qty_min: 415, unit: "g", checked: true })],
    );
    expect(r.unchanged).toBe(1);
    expect(r.updates).toHaveLength(0);
    expect(r.inserts).toHaveLength(0);
    expect(r.deletes).toHaveLength(0);
  });

  test("quantity change updates in place and keeps checked when qty went down", () => {
    const r = reconcileGrocery(
      [d({ name: "soft tofu", qty_min: 250, unit: "g" })],
      [e({ id: 7, name: "soft tofu", qty_min: 415, unit: "g", checked: true })],
    );
    expect(r.updates).toEqual([{ id: 7, patch: { qty_min: 250 } }]);
  });

  test("quantity going UP un-checks the row so it gets re-bought", () => {
    const r = reconcileGrocery(
      [d({ name: "soft tofu", qty_min: 830, unit: "g", recipe_ids: ["r1", "r2"] })],
      [e({ id: 7, name: "soft tofu", qty_min: 415, unit: "g", checked: true })],
    );
    expect(r.updates[0].patch).toMatchObject({ qty_min: 830, recipe_ids: ["r1", "r2"], checked: false });
  });

  test("plan row no longer needed is deleted; manual row survives", () => {
    const r = reconcileGrocery(
      [],
      [e({ id: 1, name: "prawn", source: "plan" }), e({ id: 2, name: "kitchen towel", source: "manual", category: "other" })],
    );
    expect(r.deletes).toEqual([1]);
    expect(r.keptManual).toBe(1);
  });

  test("manual row that the plan now needs is absorbed (source → plan), checked state kept", () => {
    const r = reconcileGrocery(
      [d({ name: "lemon", qty_min: 2 })],
      [e({ id: 3, name: "lemon", qty_min: 1, source: "manual", checked: false })],
    );
    expect(r.updates).toEqual([{ id: 3, patch: { qty_min: 2, source: "plan" } }]);
  });

  test("matching is case-insensitive on name and exact on unit, with null unit distinct from g", () => {
    const r = reconcileGrocery(
      [d({ name: "Garlic", qty_min: 5, unit: "clove" }), d({ name: "garlic", qty_min: 1, unit: null })],
      [e({ id: 9, name: "garlic", qty_min: 4, unit: "clove" })],
    );
    expect(r.updates).toEqual([{ id: 9, patch: { qty_min: 5 } }]);
    expect(r.inserts.map((i) => i.unit)).toEqual([null]);
  });

  test("shop / staple / category changes propagate", () => {
    const r = reconcileGrocery(
      [d({ name: "light soy", unit: "tsp", qty_min: 4, category: "pantry", shop: "supermarket", staple: true })],
      [e({ id: 4, name: "light soy", unit: "tsp", qty_min: 4, category: "other", shop: null, staple: false })],
    );
    expect(r.updates[0].patch).toEqual({ category: "pantry", shop: "supermarket", staple: true });
  });

  test("a substituted row keeps the original identity: rebuilds update it, never re-insert the original", () => {
    const r = reconcileGrocery(
      [d({ name: "kailan", qty_min: 300, unit: "g" })],
      [e({ id: 7, name: "choy sum", qty_min: 200, unit: "g", substituted_for: "kailan" })],
    );
    expect(r.inserts).toEqual([]); // no fresh "kailan" row
    expect(r.updates).toEqual([{ id: 7, patch: { qty_min: 300 } }]); // qty flows to the swap
  });

  test("a substituted row is deleted when the original leaves the plan", () => {
    const r = reconcileGrocery([], [e({ id: 8, name: "choy sum", qty_min: 200, unit: "g", substituted_for: "kailan" })]);
    expect(r.deletes).toEqual([8]);
  });

  test("a substituted row does not shadow a genuine row of its new name", () => {
    const r = reconcileGrocery(
      [d({ name: "kailan", qty_min: 300, unit: "g" }), d({ name: "choy sum", qty_min: 150, unit: "g" })],
      [e({ id: 9, name: "choy sum", qty_min: 200, unit: "g", substituted_for: "kailan" })],
    );
    // the sub row matches kailan; choy sum inserts as its own row
    expect(r.updates).toEqual([{ id: 9, patch: { qty_min: 300 } }]);
    expect(r.inserts.map((i) => i.name)).toEqual(["choy sum"]);
  });
});
