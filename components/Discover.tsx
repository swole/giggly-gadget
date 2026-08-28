"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { Recipe } from "@/lib/recipes";
import { totalMinutes } from "@/lib/recipes";
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
  // 185 cards of markup is ~450 KB of HTML on a phone; render a page at a time (filters still see everything).
  const PAGE = 24;
  const [limit, setLimit] = useState(PAGE);

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
          <span className="text-[10px] uppercase tracking-[0.32em] text-[var(--color-muted)]">
            Recipes
          </span>
        </div>
        <h1 className="font-display-italic mt-4 text-5xl leading-[0.95] text-[var(--color-ink)] sm:text-7xl">
          What&rsquo;s for{" "}
          <span className="text-[var(--color-terra-dark)]">dinner</span>?
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
        activeCuisine={cuisine}
        onCuisine={setCuisine}
        maxTime={maxTime}
        onMaxTime={setMaxTime}
        wantToTryOnly={wantToTry}
        onWantToTry={setWantToTry}
        tags={tags}
        activeTag={tag}
        onTag={setTag}
        total={recipes.length}
        shown={filtered.length}
      />

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.slice(0, limit).map((r) => (
          <RecipeCard key={r.id} recipe={r} onPreview={setPreview} />
        ))}
      </div>
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

const noop = () => () => {};
/** Device-local greeting without a hydration mismatch: the server says "Hungry", the client takes over after mount. */
function useGreeting(): string {
  return useSyncExternalStore(noop, greeting, () => "Hungry");
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
