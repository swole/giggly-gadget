"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Recipe } from "@/lib/recipes";
import { totalMinutes } from "@/lib/recipes";
import { thumb } from "@/lib/images";
import { daypartWord } from "@/lib/daypart";
import { RecipeCard } from "./RecipeCard";
import { FilterBar } from "./FilterBar";
import { RandomRoll } from "./RandomRoll";
import { RecipePreview } from "./RecipePreview";

export function Discover({ recipes }: { recipes: Recipe[] }) {
  const [q, setQ] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [maxTime, setMaxTime] = useState<number | null>(null);
  const [wantToTry, setWantToTry] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [preview, setPreview] = useState<Recipe | null>(null);
  const greet = useGreeting();
  const daypart = useDaypart();
  // 185 cards of markup is ~450 KB of HTML on a phone; render a page at a time (filters still see everything).
  const PAGE = 24;
  const [limit, setLimit] = useState(PAGE);
  // Two densities: hero cards for browsing moods, a compact list for finding
  // things. Remembered per device; the picker sheet already proved the row works.
  const [density, setDensity] = useState<"cards" | "list">("cards");
  useEffect(() => {
    // One-shot restore of the device's remembered view — external-system sync on mount.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("gg-discover-density") === "list") setDensity("list");
    } catch {}
  }, []);
  function pickDensity(d: "cards" | "list") {
    setDensity(d);
    try { localStorage.setItem("gg-discover-density", d); } catch {}
  }

  const cuisines = useMemo(
    () =>
      Array.from(
        new Set(recipes.map((r) => r.cuisine).filter(Boolean) as string[])
      ).sort(),
    [recipes]
  );

  const tags = useMemo(
    () =>
      Array.from(
        new Set(recipes.flatMap((r) => r.tags ?? []))
      ).sort(),
    [recipes]
  );

  const cuisineCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of recipes) if (r.cuisine) m[r.cuisine] = (m[r.cuisine] ?? 0) + 1;
    return m;
  }, [recipes]);

  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of recipes) for (const t of r.tags ?? []) m[t] = (m[t] ?? 0) + 1;
    return m;
  }, [recipes]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return recipes.filter((r) => {
      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      if (cuisine && r.cuisine !== cuisine) return false;
      if (wantToTry && !r.want_to_try) return false;
      if (tag && !(r.tags ?? []).includes(tag)) return false;
      if (maxTime) {
        const t = totalMinutes(r);
        if (t === null || t > maxTime) return false;
      }
      return true;
    });
  }, [recipes, q, cuisine, maxTime, wantToTry, tag]);

  return (
    <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-10 sm:mb-14">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--color-muted)]">
            Recipes
          </span>
        </div>
        <h1 className="font-display-italic mt-4 text-5xl leading-[0.95] text-[var(--color-ink)] sm:text-7xl">
          What&rsquo;s for{" "}
          <span className="text-[var(--color-terra-dark)]">{daypart}</span>?
        </h1>
        <p className="mt-4 max-w-xl text-sm text-[var(--color-muted)]">
          {greet}. Pick something you&rsquo;ll actually want to cook — filter
          by mood, time, or what&rsquo;s pinned to try.
        </p>
      </header>

      <div className="mb-8">
        <RandomRoll recipes={recipes} />
      </div>

      <FilterBar
        q={q}
        onQ={setQ}
        cuisines={cuisines}
        cuisineCounts={cuisineCounts}
        activeCuisine={cuisine}
        onCuisine={setCuisine}
        maxTime={maxTime}
        onMaxTime={setMaxTime}
        wantToTryOnly={wantToTry}
        onWantToTry={setWantToTry}
        tags={tags}
        tagCounts={tagCounts}
        activeTag={tag}
        onTag={setTag}
        total={recipes.length}
        shown={filtered.length}
      />

      <div className="mt-6 flex items-center justify-end gap-1" role="group" aria-label="View density">
        <DensityButton active={density === "cards"} onClick={() => pickDensity("cards")} label="Cards" kind="cards" />
        <DensityButton active={density === "list"} onClick={() => pickDensity("list")} label="List" kind="list" />
      </div>

      {density === "cards" ? (
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.slice(0, limit).map((r) => (
            <RecipeCard key={r.id} recipe={r} onPreview={setPreview} />
          ))}
        </div>
      ) : (
        <ul className="mt-4 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] shadow-[0_2px_8px_rgba(60,30,10,0.06)]">
          {filtered.slice(0, limit).map((r) => (
            <CompactRow key={r.id} recipe={r} onPreview={setPreview} />
          ))}
        </ul>
      )}
      {filtered.length > limit && (
        <div className="mt-8 text-center">
          <button
            onClick={() => setLimit((n) => n + PAGE * 2)}
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-line)] px-5 text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
          >
            Show more · {filtered.length - limit} left
          </button>
        </div>
      )}

      {preview && (
        <RecipePreview recipe={preview} onClose={() => setPreview(null)} />
      )}

      {filtered.length === 0 && (
        <div className="mt-20 text-center text-[var(--color-muted)]">
          <p className="font-display-italic text-2xl text-[var(--color-body)]">
            Nothing matches that mood.
          </p>
          <p className="mt-2 text-xs text-[var(--color-faint)]">
            Loosen a filter or try a different cuisine.
          </p>
        </div>
      )}
    </main>
  );
}

function DensityButton({
  active,
  onClick,
  label,
  kind,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  kind: "cards" | "list";
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={`${label} view`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
        active
          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-cream)]"
          : "border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-muted)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
      }`}
    >
      {kind === "cards" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** 56px thumb, title, the deciding meta — the finding-things view. */
function CompactRow({ recipe, onPreview }: { recipe: Recipe; onPreview: (r: Recipe) => void }) {
  const total = totalMinutes(recipe);
  const meta = [
    total ? `${total} min` : null,
    recipe.cuisine,
    recipe.rating ? `★ ${String(recipe.rating).replace(/\.0$/, "")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="border-b border-[var(--color-line)]/50 last:border-0">
      <button
        onClick={() => onPreview(recipe)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-paper)]/50"
      >
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--color-paper-2)]">
          {recipe.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb(recipe.image_url, 112)!} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="font-display flex h-full w-full items-center justify-center text-lg text-[var(--color-faint)]">
              {recipe.title.slice(0, 1)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display block truncate text-base leading-tight text-[var(--color-ink)]">{recipe.title}</span>
          <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]">{meta || "—"}</span>
        </span>
        {recipe.want_to_try && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-[var(--color-mustard)]">
            <path d="M12 16.5v5" />
            <path d="M9 3.5h6l-.8 5.6 3.2 3.4a1 1 0 0 1-.73 1.68H7.33a1 1 0 0 1-.73-1.68l3.2-3.4z" />
          </svg>
        )}
      </button>
    </li>
  );
}

const noop = () => () => {};
/** Device-local greeting without a hydration mismatch: the server says "Hungry", the client takes over after mount. */
function useGreeting(): string {
  return useSyncExternalStore(noop, greeting, () => "Hungry");
}

/** The headline follows the clock — a library with all three dayparts shouldn't
    ask "What's for dinner?" over morning coffee. Server says "dinner" (most
    visits are evening); the client corrects after mount, same as the greeting. */
function useDaypart(): string {
  return useSyncExternalStore(noop, () => daypartWord(new Date().getHours()), () => "dinner");
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late tonight";
  if (h < 11) return "Good morning";
  if (h < 15) return "Afternoon";
  if (h < 18) return "Early evening";
  if (h < 22) return "Tonight";
  return "Up late tonight";
}
