import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isValidYmd, todayInTz, weekDates, weekMondayOf } from "@/lib/week";
import { parseSlot, type PlannedMeal, type Slot } from "@/lib/plan/types";
import { rollCells, type RollCell, type RollFilters } from "@/lib/plan/randomize";
import { weekConstraintStatus } from "@/lib/plan/constraints";
import { listPlannerRecipes } from "@/lib/plan/queries";
import { analyseRecipes } from "@/lib/plan/analysis";
import { plannerGate, roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";
import { scheduleGroceryRebuild } from "@/lib/grocery/auto-build";

export const runtime = "nodejs";

type Body = {
  week_of?: string;
  days?: string[];
  slots?: string[];
  filters?: RollFilters;
  mode?: "fill_empty" | "replace";
  include_sunday?: boolean;
  /** Re-roll: delete these (un-cooked) rows first and fill exactly their cells. */
  replace_ids?: number[];
};

const DEFAULT_SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

function parseFilters(f: RollFilters | undefined): RollFilters {
  if (!f || typeof f !== "object") return {};
  const out: RollFilters = {};
  if (typeof f.source === "string" && f.source.length <= 40) out.source = f.source;
  if (f.healthy === true) out.healthy = true;
  if (Array.isArray(f.cuisines)) out.cuisines = f.cuisines.filter((c) => typeof c === "string" && c.length <= 40).slice(0, 20);
  if (f.quick === true) out.quick = true;
  if (f.wantToTry === true) out.wantToTry = true;
  if (f.favourites === true) out.favourites = true;
  return out;
}

/**
 * POST /api/plan/randomize — themed random fill.
 * Scope is a set of day+slot cells; only empty cells are filled (mode "replace" clears
 * un-cooked meals in scope first; replace_ids re-rolls exactly those rows). Cooked
 * meals are never touched.
 */
export async function POST(req: NextRequest) {
  const denied = plannerGate(req);
  if (denied) return denied;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!isValidYmd(body.week_of)) return NextResponse.json({ error: "week_of required" }, { status: 400 });
  const weekOf = weekMondayOf(body.week_of);
  const dates = weekDates(weekOf);

  const scopeDays = (() => {
    if (Array.isArray(body.days)) {
      const ds = body.days.filter((d) => isValidYmd(d) && dates.includes(d));
      return ds.length > 0 ? ds : null;
    }
    return body.include_sunday ? dates : dates.slice(0, 6);
  })();
  if (!scopeDays) return NextResponse.json({ error: "days must fall inside the week" }, { status: 400 });

  const scopeSlots = (() => {
    if (Array.isArray(body.slots)) {
      const ss = body.slots.map(parseSlot).filter((s): s is Slot => s !== null);
      return ss.length > 0 ? ss : null;
    }
    return DEFAULT_SLOTS;
  })();
  if (!scopeSlots) return NextResponse.json({ error: "bad slots" }, { status: 400 });

  const mode = body.mode === "replace" ? "replace" : "fill_empty";
  const replaceIds = Array.isArray(body.replace_ids)
    ? body.replace_ids.filter((x) => Number.isInteger(x) && x > 0).slice(0, 50)
    : [];
  const filters = parseFilters(body.filters);
  const addedBy = labelFor(roleFromRequest(req));

  const supa = supabaseAdmin();
  const { data: weekRows, error: readErr } = await supa
    .from("planned_meals")
    .select("*")
    .gte("planned_for", dates[0])
    .lte("planned_for", dates[6]);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  let meals = (weekRows ?? []) as PlannedMeal[];

  let removed = 0;
  let cells: RollCell[];

  if (replaceIds.length > 0) {
    // Re-roll exactly these rows (never cooked ones); their cells get one new pick each.
    const targets = meals.filter((m) => replaceIds.includes(m.id) && m.cooked_at === null);
    if (targets.length === 0) return NextResponse.json({ error: "nothing to re-roll" }, { status: 400 });
    const { error } = await supa.from("planned_meals").delete().in("id", targets.map((m) => m.id));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    removed = targets.length;
    meals = meals.filter((m) => !targets.some((t) => t.id === m.id));
    cells = targets.map((m) => ({ planned_for: m.planned_for, slot: m.slot }));
  } else {
    const inScope = (m: PlannedMeal) => scopeDays.includes(m.planned_for) && (scopeSlots as string[]).includes(m.slot);
    if (mode === "replace") {
      const toRemove = meals.filter((m) => inScope(m) && m.cooked_at === null);
      if (toRemove.length > 0) {
        const { error } = await supa.from("planned_meals").delete().in("id", toRemove.map((m) => m.id));
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        removed = toRemove.length;
        meals = meals.filter((m) => !toRemove.some((t) => t.id === m.id));
      }
    }
    const occupied = new Set(meals.map((m) => `${m.planned_for}|${m.slot}`));
    cells = [];
    for (const d of scopeDays) {
      for (const s of scopeSlots) {
        if (!occupied.has(`${d}|${s}`)) cells.push({ planned_for: d, slot: s });
      }
    }
  }

  const [recipes, analysis] = await Promise.all([listPlannerRecipes(), analyseRecipes(null)]);
  const { picks, unfilled, pool } = rollCells({
    cells,
    recipes,
    filters,
    classByRecipe: analysis.classByRecipe,
    keepMeals: meals.map((m) => ({ recipe_id: m.recipe_id, slot: m.slot, leftover_of: m.leftover_of })),
    today: todayInTz(),
  });

  let added: PlannedMeal[] = [];
  if (picks.length > 0) {
    const { data, error } = await supa
      .from("planned_meals")
      .insert(
        picks.map((p) => ({
          planned_for: p.planned_for,
          slot: p.slot,
          recipe_id: p.recipe_id,
          eaters: "both",
          position: 0,
          added_by: addedBy,
        })),
      )
      .select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    added = (data ?? []) as PlannedMeal[];
  }

  if (added.length > 0 || removed > 0) scheduleGroceryRebuild(weekOf);

  const constraints = weekConstraintStatus(
    [...meals, ...added].map((m) => ({ recipe_id: m.recipe_id, slot: m.slot, leftover_of: m.leftover_of })),
    analysis.classByRecipe,
  );

  return NextResponse.json({
    week_of: weekOf,
    added,
    added_ids: added.map((m) => m.id),
    removed,
    unfilled,
    pool,
    constraints,
  });
}
