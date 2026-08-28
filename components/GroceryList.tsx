"use client";

// The shopping list. Realtime-subscribed, grouped by where the helper buys things
// (wet market / supermarket / either) with category sub-groups, or by aisle.
// Pantry staples are generated but hidden until toggled. Anyone can add a free-text
// item. The list follows the plan automatically (plan routes rebuild it after every
// change); planners can also force a rebuild.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { renderQty } from "@/lib/scale";
import { addDays, currentWeekMonday, formatWeekRange } from "@/lib/week";
import { CATEGORY_GLYPH, CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/grocery/labels";
import { SHOP_LABEL, SHOP_ORDER, type Shop } from "@/lib/grocery/shop";
import { isPlanner, ROLE_LABEL } from "@/lib/role";
import { useRole } from "@/components/role/RoleProvider";

export type GroceryRow = {
  id: number;
  week_of: string;
  name: string;
  qty_min: number | null;
  qty_max: number | null;
  unit: string | null;
  category: string | null;
  recipe_ids: string[];
  checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  source: "plan" | "manual";
  shop: Shop | null;
  staple: boolean;
  added_by: string | null;
  substituted_for: string | null;
};

type BuildInfo = {
  inserted: number;
  updated: number;
  deleted: number;
  kept_manual: number;
  staples: number;
  meals: number;
  recipes_without_ingredients: string[];
};

const SHOP_GLYPH: Record<Shop, string> = { wet_market: "🐟", supermarket: "🛒", either: "🧺" };
const DONE_LINES = ["Basket full. Nicely done.", "That's the week bought.", "All in — kitchen's stocked."];

/** From Friday on, the current week's list carries a pointer to next week's shop. */
export type NextShop = { week: string; meals: number; items: number } | null;

export function GroceryList({ initial, week, nextShop = null }: { initial: GroceryRow[]; week: string; nextShop?: NextShop }) {
  const role = useRole();
  const canBuild = isPlanner(role);
  const [rows, setRows] = useState<GroceryRow[]>(initial);
  const [view, setView] = useState<"shop" | "aisle">("shop");
  const [showStaples, setShowStaples] = useState(false);
  const [adding, setAdding] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [subFor, setSubFor] = useState<GroceryRow | null>(null);
  const [live, setLive] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [justTicked, setJustTicked] = useState<number | null>(null);
  const [doneLine] = useState(() => DONE_LINES[Math.floor(Math.random() * DONE_LINES.length)]);

  async function refetch() {
    try {
      const { data } = await supabaseBrowser().from("grocery_list").select("*").eq("week_of", week);
      if (data) setRows(data as GroceryRow[]);
    } catch {}
  }

  useEffect(() => {
    const supa = supabaseBrowser();
    let first = true;
    const ch = supa
      .channel(`grocery:${week}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "grocery_list", filter: `week_of=eq.${week}` },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") {
              const n = payload.new as GroceryRow;
              return prev.some((r) => r.id === n.id) ? prev : [...prev, n];
            }
            if (payload.eventType === "UPDATE") {
              const n = payload.new as GroceryRow;
              return prev.some((r) => r.id === n.id) ? prev.map((r) => (r.id === n.id ? n : r)) : [...prev, n];
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((r) => r.id !== (payload.old as GroceryRow).id);
            }
            return prev;
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive("live");
          if (!first) void refetch(); // the socket was asleep: pull what we missed
          first = false;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLive("reconnecting");
        }
      });
    // A phone that slept in the shop: refresh when it wakes.
    const onVis = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      supa.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  const visible = useMemo(() => rows.filter((r) => showStaples || !r.staple), [rows, showStaples]);
  const stapleCount = rows.filter((r) => r.staple).length;
  const totalCount = visible.length;
  const checkedCount = visible.filter((r) => r.checked).length;
  const allBought = totalCount > 0 && checkedCount === totalCount;

  // Group: by shop (then category) or by aisle (category only)
  const groups = useMemo(() => {
    const sortRows = (a: GroceryRow, b: GroceryRow) =>
      Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name);
    if (view === "aisle") {
      const buckets: Record<string, GroceryRow[]> = {};
      for (const r of visible) (buckets[r.category ?? "other"] ??= []).push(r);
      return CATEGORY_ORDER.filter((c) => buckets[c]?.length).map((c) => ({
        key: c,
        title: CATEGORY_LABEL[c] ?? c,
        glyph: CATEGORY_GLYPH[c] ?? "🥄",
        sections: [{ key: c, title: null as string | null, rows: buckets[c].sort(sortRows) }],
      }));
    }
    const byShop: Record<string, Record<string, GroceryRow[]>> = {};
    for (const r of visible) {
      const s = r.shop ?? "supermarket";
      const c = r.category ?? "other";
      ((byShop[s] ??= {})[c] ??= []).push(r);
    }
    return SHOP_ORDER.filter((s) => byShop[s]).map((s) => ({
      key: s,
      title: SHOP_LABEL[s],
      glyph: SHOP_GLYPH[s],
      sections: CATEGORY_ORDER.filter((c) => byShop[s][c]?.length).map((c) => ({
        key: c,
        title: CATEGORY_LABEL[c] ?? c,
        rows: byShop[s][c].sort(sortRows),
      })),
    }));
  }, [visible, view]);

  async function toggle(row: GroceryRow) {
    const newChecked = !row.checked;
    const checkedBy = newChecked ? (role ? ROLE_LABEL[role] : null) : null;
    const checkedAt = newChecked ? new Date().toISOString() : null;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, checked: newChecked, checked_by: checkedBy, checked_at: checkedAt } : r)),
    );
    if (newChecked) {
      setJustTicked(row.id);
      try { navigator.vibrate?.(8); } catch {}
    }
    try {
      const { error } = await supabaseBrowser()
        .from("grocery_list")
        .update({ checked: newChecked, checked_by: checkedBy, checked_at: checkedAt })
        .eq("id", row.id);
      if (error) throw error;
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    }
  }

  async function setStaple(row: GroceryRow, staple: boolean) {
    setMenuFor(null);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, staple } : r)));
    try {
      const res = await fetch("/api/staples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: row.name, staple, week_of: week }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    }
  }

  async function removeRow(row: GroceryRow) {
    setMenuFor(null);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      const { error } = await supabaseBrowser().from("grocery_list").delete().eq("id", row.id);
      if (error) throw error;
    } catch {
      setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
    }
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    setAddError(null);
    try {
      const res = await fetch("/api/grocery/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, week_of: week }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setAddError(j.error ?? `Could not add (${res.status})`);
        return;
      }
      const j = (await res.json()) as { row: GroceryRow };
      setRows((prev) =>
        prev.some((r) => r.id === j.row.id) ? prev.map((r) => (r.id === j.row.id ? j.row : r)) : [...prev, j.row],
      );
      setAdding("");
    } catch {
      setAddError("No connection — try again.");
    }
  }

  async function build() {
    setBuilding(true);
    setBuildInfo(null);
    setBuildError(null);
    try {
      const res = await fetch("/api/grocery/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ week_of: week }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setBuildError(j.error ?? `Build failed (${res.status})`);
      } else {
        setBuildInfo((await res.json()) as BuildInfo);
        await refetch(); // Realtime delivers the rows; refetch anyway in case the socket was asleep.
      }
    } catch {
      setBuildError("No connection — try again.");
    } finally {
      setBuilding(false);
    }
  }

  async function clearAll() {
    if (!confirm(`Clear all ${rows.length} items for ${formatWeekRange(week)}? The list rebuilds itself from the plan on the next change.`)) return;
    try {
      const res = await fetch("/api/grocery/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ week_of: week }),
      });
      if (res.ok) setRows([]);
    } catch {}
  }

  const navBtn =
    "inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-muted)] shadow-[0_1px_3px_-1px_rgba(85,55,25,0.25)] transition-colors hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]";

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10" onClick={() => setMenuFor(null)}>
      <header className="border-b border-[var(--color-line)] pb-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.32em] text-[var(--color-muted)]">
            Grocery <span className="ml-2 text-[var(--color-faint)]">{live === "live" ? "● live" : live === "reconnecting" ? "○ reconnecting" : ""}</span>
          </span>
          <nav className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em]" aria-label="Week">
            <Link href={`/grocery?week=${addDays(week, -7)}`} className={navBtn} aria-label="Previous week">
              ←
            </Link>
            <span className="px-1 text-[var(--color-muted)]">{formatWeekRange(week)}</span>
            <Link href={`/grocery?week=${addDays(week, 7)}`} className={navBtn} aria-label="Next week">
              →
            </Link>
          </nav>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <h1 className="font-display-italic text-4xl leading-none text-[var(--color-ink)]">Shopping list</h1>
          <div className={`font-display text-3xl tabular-nums ${allBought ? "text-[var(--color-sage)]" : "text-[var(--color-terra)]"}`}>
            {checkedCount}
            <span className="text-[var(--color-faint)]">/{totalCount}</span>
          </div>
        </div>
        {totalCount > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-paper-2)]" role="progressbar" aria-valuemin={0} aria-valuemax={totalCount} aria-valuenow={checkedCount}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${allBought ? "bg-[var(--color-sage)]" : "bg-[var(--color-terra)]"}`}
              style={{ width: `${Math.round((checkedCount / totalCount) * 100)}%` }}
            />
          </div>
        )}
        {allBought && (
          <div className="animate-slide-up mt-3 flex items-center gap-3 rounded-2xl bg-[var(--color-sage)]/12 px-4 py-3 text-sm text-[var(--color-sage)]">
            <span className="text-2xl" aria-hidden>🧺</span>
            <span><span className="font-medium">{doneLine}</span>{!showStaples && stapleCount > 0 ? ` Staples are hidden — tap “Show pantry staples” if you need to check those too.` : ""}</span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-[var(--color-line)] text-[10px] uppercase tracking-[0.16em]">
            {(["shop", "aisle"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`min-h-9 px-3 ${view === v ? "bg-[var(--color-terra)] text-[var(--color-cream)]" : "text-[var(--color-muted)]"}`}
              >
                {v === "shop" ? "By shop" : "By aisle"}
              </button>
            ))}
          </div>
          {stapleCount > 0 && (
            <button
              onClick={() => setShowStaples((v) => !v)}
              aria-pressed={showStaples}
              className="btn-quiet min-h-9 px-3 text-[10px] uppercase tracking-[0.16em]"
            >
              {showStaples ? "Hide" : "Show"} pantry staples ({stapleCount})
            </button>
          )}
          {canBuild && (
            <button
              onClick={build}
              disabled={building}
              title="The list follows the plan by itself; this forces a refresh."
              className="min-h-9 rounded-full border border-[var(--color-line)] px-3 text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)] hover:text-[var(--color-terra)] disabled:opacity-60"
            >
              {building ? "Rebuilding…" : "Rebuild from plan"}
            </button>
          )}
          {canBuild && rows.length > 0 && (
            <button
              onClick={clearAll}
              className="ml-auto min-h-9 text-[10px] uppercase tracking-[0.18em] text-[var(--color-faint)] hover:text-[var(--color-terra)]"
            >
              Clear all
            </button>
          )}
        </div>

        {buildError && <div className="mt-3 rounded-xl border border-[var(--color-terra)]/40 bg-[var(--color-terra)]/10 px-3 py-2 text-xs text-[var(--color-terra-dark)]">{buildError}</div>}
        {buildInfo && (
          <div className="mt-3 rounded-xl border border-[var(--color-sage)]/40 bg-[var(--color-sage)]/10 px-3 py-2 text-xs text-[var(--color-ink)]">
            Synced with {buildInfo.meals} planned meals: {buildInfo.inserted} new · {buildInfo.updated} updated · {buildInfo.deleted} removed
            {buildInfo.kept_manual > 0 && ` · ${buildInfo.kept_manual} manual kept`}
            {buildInfo.staples > 0 && ` · ${buildInfo.staples} staples hidden`}
            {buildInfo.recipes_without_ingredients.length > 0 && (
              <div className="mt-1 text-[var(--color-terra-dark)]">
                No parsed ingredients for: {buildInfo.recipes_without_ingredients.join(", ")} — add those by hand.
              </div>
            )}
          </div>
        )}
      </header>

      {/* Saturday shop: from Friday the current week points at next week's list. */}
      {nextShop && nextShop.meals > 0 && (
        <Link
          href={`/grocery?week=${nextShop.week}`}
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--color-terra)]/50 bg-[var(--color-terra)]/5 px-4 py-3 text-sm text-[var(--color-ink)] hover:bg-[var(--color-terra)]/10"
        >
          <span>
            <span className="font-medium">Shopping for next week?</span>{" "}
            {nextShop.items > 0
              ? `The list is ready — ${nextShop.items} item${nextShop.items === 1 ? "" : "s"} for ${nextShop.meals} meal${nextShop.meals === 1 ? "" : "s"}.`
              : `${nextShop.meals} meal${nextShop.meals === 1 ? "" : "s"} planned — the list builds on the next plan change.`}
          </span>
          <span className="btn-quiet shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-terra-dark)]">Next week&rsquo;s list →</span>
        </Link>
      )}
      {nextShop && nextShop.meals === 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-paper)]/40 px-4 py-3 text-sm text-[var(--color-muted)]">
          <span>
            <span className="font-medium text-[var(--color-ink)]">Next week isn&rsquo;t planned yet.</span>{" "}
            {canBuild ? "Plan it and the shopping list writes itself." : "Johnny or Lydia will plan it — the list follows."}
          </span>
          {canBuild && (
            <Link href={`/plan?week=${nextShop.week}`} className="btn-quiet shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-terra-dark)]">
              Plan it →
            </Link>
          )}
        </div>
      )}
      {week > currentWeekMonday() && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-mustard)]/12 px-4 py-2.5 text-xs text-[var(--color-ink)]">
          <span>
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-terra-dark)]">Shopping ahead</span>
            Buying for the week of {formatWeekRange(week)}.
          </span>
          <Link href="/grocery" className="btn-quiet shrink-0 px-3 py-1 text-[10px] uppercase tracking-[0.16em]">
            This week ←
          </Link>
        </div>
      )}

      <form onSubmit={addManual} className="mt-4">
        <div className="flex gap-2">
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="Add an item… (kitchen towel, lemons)"
            aria-label="Add an item"
            className="min-w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-2.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:border-[var(--color-terra)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!adding.trim()}
            className="min-h-11 rounded-xl border border-[var(--color-line)] px-4 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)] disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {addError && <p className="mt-1 text-xs text-[var(--color-terra-dark)]">{addError}</p>}
      </form>

      {groups.length === 0 ? (
        <div className="mt-20 text-center text-[var(--color-muted)]">
          <div className="text-3xl">🧺</div>
          <p className="font-display-italic mt-2 text-2xl text-[var(--color-body)]">Nothing on the list yet.</p>
          <p className="mt-2 text-xs text-[var(--color-faint)]">
            {canBuild ? "Plan the week and the list writes itself. Or add items by hand above." : "The list fills in once Johnny or Lydia plan the week. You can add items by hand above."}
          </p>
          {canBuild && (
            <Link href={`/plan?week=${week}`} className="btn-ink mt-4 px-5 text-[10px] uppercase tracking-[0.18em]">
              Open the plan →
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-10">
          {groups.map((g) => {
            const gTotal = g.sections.reduce((n, s) => n + s.rows.length, 0);
            const gDone = g.sections.reduce((n, s) => n + s.rows.filter((r) => r.checked).length, 0);
            return (
              <section key={g.key}>
                <h2 className="flex items-center gap-2 border-b border-[var(--color-line)] pb-2 font-display text-2xl text-[var(--color-ink)]">
                  <span className="text-xl">{g.glyph}</span>
                  {g.title}
                  <span className={`ml-auto text-[10px] uppercase tracking-[0.18em] ${gDone === gTotal ? "text-[var(--color-sage)]" : "text-[var(--color-faint)]"}`}>
                    {gDone === gTotal ? "✓ done" : `${gDone}/${gTotal}`}
                  </span>
                </h2>
                {g.sections.map((s) => (
                  <div key={s.key} className="mt-3">
                    {s.title && view === "shop" && (
                      <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">
                        <span>{CATEGORY_GLYPH[s.key] ?? "🥄"}</span>
                        {s.title}
                      </h3>
                    )}
                    <ul className="mt-1">
                      {s.rows.map((row) => (
                        <GroceryRowItem
                          key={row.id}
                          row={row}
                          justTicked={justTicked === row.id}
                          onToggle={toggle}
                          menuOpen={menuFor === row.id}
                          onMenu={(open) => setMenuFor(open ? row.id : null)}
                          canConfigure={canBuild}
                          onStaple={(v) => setStaple(row, v)}
                          onRemove={() => removeRow(row)}
                          onSubstitute={() => { setMenuFor(null); setSubFor(row); }}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
      {subFor && (
        <SubstituteSheet
          row={subFor}
          onClose={() => setSubFor(null)}
          onApplied={(r) => {
            setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)));
            setSubFor(null);
          }}
        />
      )}
    </main>
  );
}

type SubOption = { name: string; why: string; qty_note: string | null };

/** "Can't find it" — asks the kitchen brain for 2-3 stall-friendly swaps, one tap applies. */
function SubstituteSheet({ row, onClose, onApplied }: { row: GroceryRow; onClose: () => void; onApplied: (r: GroceryRow) => void }) {
  const [options, setOptions] = useState<SubOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/grocery/substitute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: row.id, action: "suggest" }),
        });
        const j = (await res.json().catch(() => ({}))) as { options?: SubOption[]; error?: string };
        if (!alive) return;
        if (!res.ok || !j.options) setError(j.error ?? `Failed (${res.status})`);
        else setOptions(j.options);
      } catch {
        if (alive) setError("No connection — try again.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [row.id]);

  async function apply(name: string) {
    setBusy(name);
    try {
      const res = await fetch("/api/grocery/substitute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: row.id, action: "apply", name }),
      });
      const j = (await res.json().catch(() => ({}))) as { row?: GroceryRow; error?: string };
      if (!res.ok || !j.row) {
        setError(j.error ?? `Failed (${res.status})`);
        setBusy(null);
        return;
      }
      onApplied(j.row);
    } catch {
      setError("No connection — try again.");
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sub-title"
    >
      <div
        className="animate-slide-up w-full max-w-md rounded-t-3xl bg-[var(--color-card)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">Can&rsquo;t find it?</div>
            <h2 id="sub-title" className="font-display-italic mt-1 text-2xl text-[var(--color-ink)]">
              Swap {row.substituted_for ?? row.name}
            </h2>
          </div>
          <button onClick={onClose} className="btn-quiet px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
            Close
          </button>
        </div>

        {!options && !error && (
          <div className="mt-6 flex items-center gap-3 pb-4 text-sm text-[var(--color-muted)]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-terra)]" aria-hidden />
            Thinking of what works instead…
          </div>
        )}
        {error && <p className="mt-5 pb-3 text-sm text-[var(--color-terra-dark)]">{error}</p>}

        {options && (
          <ul className="mt-4 space-y-2">
            {options.map((o) => (
              <li key={o.name}>
                <button
                  onClick={() => void apply(o.name)}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)]/40 px-4 py-3 text-left transition-all hover:border-[var(--color-terra)] active:scale-[0.99] disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block font-display text-lg text-[var(--color-ink)]">{o.name}</span>
                    <span className="block text-xs text-[var(--color-muted)]">
                      {o.why}
                      {o.qty_note ? ` · ${o.qty_note}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-[var(--color-terra)]">
                    {busy === o.name ? "…" : "Use this"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {options && (
          <p className="mt-3 text-[11px] text-[var(--color-faint)]">
            The list remembers the original, so next week goes back to {row.substituted_for ?? row.name}.
          </p>
        )}
      </div>
    </div>
  );
}

function GroceryRowItem({
  row,
  justTicked,
  onToggle,
  menuOpen,
  onMenu,
  canConfigure,
  onStaple,
  onRemove,
  onSubstitute,
}: {
  row: GroceryRow;
  justTicked: boolean;
  onToggle: (r: GroceryRow) => void;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  canConfigure: boolean;
  onStaple: (v: boolean) => void;
  onRemove: () => void;
  onSubstitute: () => void;
}) {
  const qtyText =
    row.qty_min === null
      ? ""
      : row.qty_max === null || row.qty_max === row.qty_min
        ? renderQty(Number(row.qty_min))
        : `${renderQty(Number(row.qty_min))}–${renderQty(Number(row.qty_max))}`;

  return (
    <li className="relative">
      <div className="group flex w-full items-center gap-2 border-b border-[var(--color-line)]/60">
        <button onClick={() => onToggle(row)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 text-left" aria-pressed={row.checked}>
          <span
            aria-hidden
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
              row.checked
                ? `border-[var(--color-sage)] bg-[var(--color-sage)] text-[var(--color-cream)] ${justTicked ? "animate-tick-in" : ""}`
                : "border-[var(--color-line)] text-transparent group-hover:border-[var(--color-terra)]"
            }`}
          >
            ✓
          </span>
          <span className={`min-w-0 leading-snug ${row.checked ? "text-[var(--color-faint)] line-through" : "text-[var(--color-ink)]"}`}>
            <span className="font-display mr-1.5 tabular-nums text-[var(--color-terra)]">{qtyText}</span>
            {row.unit && <span className="mr-1.5 text-[var(--color-muted)]">{row.unit}</span>}
            <span>{row.name}</span>
            {row.substituted_for && (
              <span className="ml-2 text-[10px] text-[var(--color-terra-dark)]">for {row.substituted_for}</span>
            )}
            {row.staple && (
              <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-[var(--color-faint)]">staple</span>
            )}
            {row.source === "manual" && (
              <span className="ml-2 text-[10px] text-[var(--color-faint)]">
                {row.added_by ? `added by ${row.added_by}` : "added"}
              </span>
            )}
            {row.recipe_ids.length > 1 && (
              <span className="ml-2 text-[10px] text-[var(--color-faint)]">× {row.recipe_ids.length} recipes</span>
            )}
            {row.checked && row.checked_by && (
              <span className="ml-2 text-[10px] text-[var(--color-faint)]">· {row.checked_by}</span>
            )}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenu(!menuOpen);
          }}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-[var(--color-faint)] hover:text-[var(--color-terra)]"
          aria-label={`More options for ${row.name}`}
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
      </div>
      {menuOpen && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] text-sm shadow-lg"
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          <button role="menuitem" onClick={onSubstitute} className="block min-h-11 w-full px-4 text-left hover:bg-[var(--color-paper)]/60">
            <span className="mr-1.5" aria-hidden>🔄</span>Can&rsquo;t find it? Get a swap
          </button>
          {canConfigure && (
            <button role="menuitem" onClick={() => onStaple(!row.staple)} className="block min-h-11 w-full px-4 text-left hover:bg-[var(--color-paper)]/60">
              {row.staple ? "Not a staple" : "Mark as pantry staple"}
            </button>
          )}
          <button
            role="menuitem"
            onClick={onRemove}
            className="block min-h-11 w-full px-4 text-left text-[var(--color-terra-dark)] hover:bg-[var(--color-paper)]/60"
          >
            {row.source === "plan" ? "Remove — we have this" : "Remove from list"}
          </button>
        </div>
      )}
    </li>
  );
}
