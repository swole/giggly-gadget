import { getPlannedMealsForWeek, listPlannerRecipes } from "@/lib/plan/queries";
import { supabaseAdmin } from "@/lib/supabase/server";
import { mealTitle, SLOT_LABEL, type Slot } from "@/lib/plan/types";
import { EATERS_SHORT } from "@/lib/portions";
import { currentWeekMonday, formatDayLong, formatWeekRange, isoDow, isValidYmd, weekDates, weekMondayOf } from "@/lib/week";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/grocery/labels";
import { SHOP_LABEL, SHOP_ORDER, type Shop } from "@/lib/grocery/shop";
import { displayGroceryRow } from "@/lib/grocery/display";

export const dynamic = "force-dynamic";

const ALL_SLOTS: Slot[] = ["breakfast", "lunch", "dinner", "snack"];

// One A4 sheet for the fridge: the week's meals on top, the shopping list below.
export default async function PrintPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const weekOf = isValidYmd(week) ? weekMondayOf(week) : currentWeekMonday();
  const supa = supabaseAdmin();
  const [meals, recipes, { data: grocery }] = await Promise.all([
    getPlannedMealsForWeek(weekOf),
    listPlannerRecipes(),
    supa.from("grocery_list").select("*").eq("week_of", weekOf).eq("staple", false).order("name"),
  ]);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const days = weekDates(weekOf);
  const rows = (grocery ?? []) as { name: string; qty_min: number | null; qty_max: number | null; unit: string | null; category: string | null; shop: Shop | null; checked: boolean }[];
  const byShop = new Map<Shop, Map<string, typeof rows>>();
  for (const r of rows) {
    const s = r.shop ?? "supermarket";
    const c = r.category ?? "other";
    if (!byShop.has(s)) byShop.set(s, new Map());
    const m = byShop.get(s)!;
    if (!m.has(c)) m.set(c, []);
    m.get(c)!.push(r);
  }

  return (
    <main className="print-sheet relative z-10 mx-auto max-w-3xl px-6 py-8 text-[var(--color-ink)]">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          nav, .noprint { display: none !important; }
          body { background: #fff !important; }
          body::before { display: none !important; }
          .print-sheet { max-width: none; padding: 0; }
          .break-avoid { break-inside: avoid; }
        }
      `}</style>
      <header className="flex items-baseline justify-between border-b-2 border-[var(--color-ink)] pb-2">
        <h1 className="font-display text-2xl">The week · {formatWeekRange(weekOf)}</h1>
        <span className="noprint text-[12px] uppercase tracking-[0.06em] text-[var(--color-muted)]">Ctrl/Cmd + P to print</span>
      </header>

      {(() => {
        // A4 space is precious: no SNACK column when nothing is snacked, no empty
        // rest-day row — the fridge copy shows only what the week actually holds.
        const slots = ALL_SLOTS.filter((s) => s !== "snack" || meals.some((m) => m.slot === "snack"));
        const printDays = days.filter((d) => !(isoDow(d) === 6 && !meals.some((m) => m.planned_for === d)));
        return (
          <table className="mt-4 w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
                <th className="w-24 py-1 pr-2">Day</th>
                {slots.map((s) => (
                  <th key={s} className="py-1 pr-2">{SLOT_LABEL[s]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {printDays.map((d) => {
                const ms = meals.filter((m) => m.planned_for === d);
                return (
                  <tr key={d} className="break-avoid border-t border-[var(--color-line)] align-top">
                    <td className="py-2 pr-2 font-display text-sm">{formatDayLong(d).replace(/ \d+ \w+$/, "")}<br /><span className="text-[10px] text-[var(--color-muted)]">{d.slice(5)}</span></td>
                    {slots.map((s) => (
                      <td key={s} className="py-2 pr-2">
                        {ms.filter((m) => m.slot === s).map((m) => (
                          <div key={m.id}>
                            {m.leftover_of !== null && <span className="text-[var(--color-muted)]">Leftovers · </span>}
                            {mealTitle(m, byId)}
                            {m.eaters !== "both" && <span className="ml-1 text-[10px] text-[var(--color-muted)]"> ({EATERS_SHORT[m.eaters]})</span>}
                            {m.note && <div className="text-[10px] italic text-[var(--color-muted)]">{m.note}</div>}
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })()}

      <h2 className="mt-8 border-b-2 border-[var(--color-ink)] pb-1 font-display text-xl">Shopping list</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">Not built yet — tap “Build from plan” on the Grocery tab.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4 text-[12px] sm:grid-cols-3">
          {SHOP_ORDER.filter((s) => byShop.has(s)).map((s) => (
            <section key={s} className="break-avoid">
              <h3 className="text-[12px] uppercase tracking-[0.06em] text-[var(--color-terra)]">{SHOP_LABEL[s]}</h3>
              {CATEGORY_ORDER.filter((c) => byShop.get(s)!.has(c)).map((c) => (
                <div key={c} className="mt-1.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">{CATEGORY_LABEL[c]}</div>
                  <ul>
                    {byShop.get(s)!.get(c)!.map((r, i) => {
                      // Same buyable-units translation the live list uses.
                      const d = displayGroceryRow({
                        name: r.name,
                        qty_min: r.qty_min === null ? null : Number(r.qty_min),
                        qty_max: r.qty_max === null ? null : Number(r.qty_max),
                        unit: r.unit,
                        category: r.category,
                      });
                      return (
                        <li key={i} className="flex gap-1.5 leading-snug">
                          <span className="inline-block h-3 w-3 shrink-0 translate-y-0.5 rounded-sm border border-[var(--color-ink)]" aria-hidden />
                          <span>
                            {d.qty && <span className="tabular-nums font-medium">{d.qty} </span>}
                            {d.unit && <span>{d.unit} </span>}
                            {d.name}
                            {d.note && <span className="text-[10px] text-[var(--color-muted)]"> · {d.note}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      <footer className="mt-8 text-[10px] uppercase tracking-[0.16em] text-[var(--color-faint)]">
        Giggly Gadget · plate split Johnny 3 : Lydia 2 on protein and grains · vegetables equal · pantry staples not listed
      </footer>
    </main>
  );
}
