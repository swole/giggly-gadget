"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { renderQty } from "@/lib/scale";
import { formatWeekLabel } from "@/lib/week";

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
};

const CATEGORY_ORDER = ["produce", "protein", "dairy", "grain", "pantry", "spice", "other"];

const CATEGORY_LABEL: Record<string, string> = {
  produce: "Produce",
  protein: "Protein",
  dairy: "Dairy",
  grain: "Grain & noodles",
  pantry: "Pantry",
  spice: "Spices",
  other: "Other",
};

const CATEGORY_GLYPH: Record<string, string> = {
  produce: "🌿",
  protein: "🥩",
  dairy: "🧈",
  grain: "🍚",
  pantry: "🫙",
  spice: "🧂",
  other: "🥄",
};

export function GroceryList({
  initial,
  week,
}: {
  initial: GroceryRow[];
  week: string;
}) {
  const [rows, setRows] = useState<GroceryRow[]>(initial);

  useEffect(() => {
    const supa = supabaseBrowser();
    const ch = supa
      .channel(`grocery:${week}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "grocery_list", filter: `week_of=eq.${week}` },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") {
              return [...prev, payload.new as GroceryRow];
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((r) =>
                r.id === (payload.new as GroceryRow).id ? (payload.new as GroceryRow) : r
              );
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((r) => r.id !== (payload.old as GroceryRow).id);
            }
            return prev;
          });
        }
      )
      .subscribe();
    return () => {
      supa.removeChannel(ch);
    };
  }, [week]);

  const grouped = useMemo(() => {
    const buckets: Record<string, GroceryRow[]> = {};
    for (const r of rows) {
      const c = r.category ?? "other";
      (buckets[c] ??= []).push(r);
    }
    return CATEGORY_ORDER.filter((c) => buckets[c]?.length).map((c) => ({
      category: c,
      rows: buckets[c].sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)),
    }));
  }, [rows]);

  const totalCount = rows.length;
  const checkedCount = rows.filter((r) => r.checked).length;

  async function toggle(row: GroceryRow) {
    const newChecked = !row.checked;
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, checked: newChecked, checked_at: newChecked ? new Date().toISOString() : null }
          : r
      )
    );
    const supa = supabaseBrowser();
    const update: { checked: boolean; checked_at: string | null } = {
      checked: newChecked,
      checked_at: newChecked ? new Date().toISOString() : null,
    };
    await (supa.from("grocery_list") as unknown as {
      update: (v: typeof update) => { eq: (col: string, val: number) => Promise<unknown> };
    })
      .update(update)
      .eq("id", row.id);
  }

  async function clearAll() {
    if (!confirm(`Clear all ${totalCount} items for the week of ${formatWeekLabel(week)}?`)) return;
    await fetch("/api/grocery/clear", { method: "POST" });
    setRows([]);
  }

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <Link
        href="/"
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)] transition-colors hover:text-[var(--color-terra)]"
      >
        ← Discover
      </Link>

      <header className="mt-8 flex items-baseline justify-between border-b border-[var(--color-line)] pb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Week of {formatWeekLabel(week)}
          </div>
          <h1 className="font-display-italic mt-2 text-4xl text-[var(--color-ink)]">
            Grocery list
          </h1>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl tabular-nums text-[var(--color-terra)]">
            {checkedCount}
            <span className="text-[var(--color-faint)]">/{totalCount}</span>
          </div>
          {totalCount > 0 && (
            <button
              onClick={clearAll}
              className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)] hover:text-[var(--color-terra)]"
            >
              Clear all
            </button>
          )}
        </div>
      </header>

      {grouped.length === 0 ? (
        <div className="mt-24 text-center text-[var(--color-muted)]">
          <p className="font-display-italic text-2xl text-[var(--color-body)]">
            Nothing on the list yet.
          </p>
          <p className="mt-2 text-xs text-[var(--color-faint)]">
            Open a recipe and tap "Add to grocery list."
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {grouped.map(({ category, rows }) => (
            <section key={category}>
              <h2 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">
                <span className="text-base">{CATEGORY_GLYPH[category] ?? "🥄"}</span>
                {CATEGORY_LABEL[category] ?? category}
              </h2>
              <ul className="mt-3">
                {rows.map((row) => (
                  <GroceryRowItem key={row.id} row={row} onToggle={toggle} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function GroceryRowItem({
  row,
  onToggle,
}: {
  row: GroceryRow;
  onToggle: (r: GroceryRow) => void;
}) {
  const qtyText =
    row.qty_min === null
      ? ""
      : row.qty_max === null || row.qty_max === row.qty_min
        ? renderQty(Number(row.qty_min))
        : `${renderQty(Number(row.qty_min))}–${renderQty(Number(row.qty_max))}`;

  return (
    <li>
      <button
        onClick={() => onToggle(row)}
        className="group flex w-full items-baseline gap-3 border-b border-[var(--color-line)]/60 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)]/40"
      >
        <span
          aria-hidden
          className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
            row.checked
              ? "border-[var(--color-sage)] bg-[var(--color-sage)]/30 text-[var(--color-ink)]"
              : "border-[var(--color-line)] text-transparent group-hover:border-[var(--color-clay)]"
          }`}
        >
          ✓
        </span>
        <span className={row.checked ? "text-[var(--color-faint)] line-through" : "text-[var(--color-ink)]"}>
          <span className="font-display text-[var(--color-terra)] tabular-nums mr-1.5">{qtyText}</span>
          {row.unit && <span className="text-[var(--color-muted)] mr-1.5">{row.unit}</span>}
          <span>{row.name}</span>
          {row.recipe_ids.length > 1 && (
            <span className="ml-2 text-[10px] text-[var(--color-faint)]">
              × {row.recipe_ids.length} recipes
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
