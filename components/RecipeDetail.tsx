"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Recipe, ParsedIngredientRow } from "@/lib/recipes";
import { totalMinutes, extractMethodSteps } from "@/lib/recipes";
import type { ScaleMode } from "@/lib/scale";
import { scaleFactor } from "@/lib/scale";
import { ScaleControl } from "./ScaleControl";
import { IngredientLine } from "./IngredientLine";
import { AddToGroceryButton } from "./AddToGroceryButton";
import { renderInlineMd } from "@/lib/markdown";

type Props = {
  recipe: Recipe;
  ingredients: ParsedIngredientRow[];
};

export function RecipeDetail({ recipe, ingredients }: Props) {
  const search = useSearchParams();
  const justCooked = search.get("cooked") === "1";
  const [showCookedToast, setShowCookedToast] = useState(justCooked);

  useEffect(() => {
    if (showCookedToast) {
      const t = setTimeout(() => setShowCookedToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [showCookedToast]);

  const [mode, setMode] = useState<ScaleMode>(() => ({
    kind: "servings",
    target: recipe.servings && recipe.servings > 0 ? recipe.servings : 2,
  }));

  const factor = scaleFactor(recipe.servings, mode);
  const total = totalMinutes(recipe);
  const steps = useMemo(
    () => extractMethodSteps(recipe.instructions_md),
    [recipe.instructions_md]
  );

  return (
    <main className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      {showCookedToast && (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-lg border border-[var(--color-sage)]/50 bg-[var(--color-sage)]/15 px-4 py-3 text-sm text-[var(--color-ink)] shadow-sm backdrop-blur-sm">
          ✓ Marked as cooked — well done.
        </div>
      )}
      <Link
        href="/"
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)] transition-colors hover:text-[var(--color-terra)]"
      >
        ← Discover
      </Link>

      {recipe.image_url && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-line)] shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="aspect-[16/9] w-full object-cover"
          />
        </div>
      )}

      <header className="mt-8 border-b border-[var(--color-line)] pb-8">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          {[recipe.cuisine, recipe.meal_type].filter(Boolean).join(" · ") || "Recipe"}
        </div>
        <h1 className="font-display mt-3 text-4xl leading-[1.02] text-[var(--color-ink)] sm:text-5xl">
          {recipe.title}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--color-muted)]">
          {total !== null && <span>◷ {total} min</span>}
          {recipe.difficulty && <span>◆ {recipe.difficulty}</span>}
          {recipe.servings && <span>⊙ originally serves {recipe.servings}</span>}
          {recipe.rating ? (
            <span className="text-[var(--color-mustard)]">
              {"★".repeat(recipe.rating)}
            </span>
          ) : null}
        </div>
      </header>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display-italic text-2xl text-[var(--color-ink)]">
            Ingredients
          </h2>
          <ScaleSummary mode={mode} factor={factor} />
        </div>

        <div className="mt-4">
          <ScaleControl
            baseServings={recipe.servings}
            mode={mode}
            onChange={setMode}
          />
        </div>

        <ul className="mt-6 space-y-0">
          {ingredients.map((ing, i) => (
            <IngredientLine
              key={ing.line_index}
              ing={ing}
              scale={factor}
              index={i}
            />
          ))}
        </ul>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AddToGroceryButton recipeId={recipe.id} scaleFactor={factor} />
          <Link
            href={`/recipes/${recipe.id}/cook`}
            className="group flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-3 text-sm text-[var(--color-ink)] transition-all hover:border-[var(--color-terra)]/50 hover:text-[var(--color-terra)]"
          >
            <span className="text-[var(--color-clay)]">◷</span>
            Start cooking
          </Link>
        </div>
      </section>

      {steps.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display-italic text-2xl text-[var(--color-ink)]">Method</h2>
          <ol className="mt-5 space-y-5">
            {steps.map((step, i) => (
              <li
                key={i}
                className="flex gap-4 text-sm leading-relaxed text-[var(--color-body)]"
              >
                <span className="font-display text-[var(--color-terra)] text-lg leading-none tabular-nums w-7 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="whitespace-pre-wrap">{renderInlineMd(step)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.source_url && (
        <div className="mt-12 text-xs text-[var(--color-muted)]">
          Source:{" "}
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-terra)] underline-offset-4 hover:underline"
          >
            {hostnameOf(recipe.source_url)}
          </a>
        </div>
      )}
    </main>
  );
}

function ScaleSummary({ mode, factor }: { mode: ScaleMode; factor: number }) {
  const label =
    mode.kind === "servings"
      ? `${mode.target} ${mode.target === 1 ? "serving" : "servings"}`
      : `${mode.days}d × ${mode.servingsPerDay} = ${mode.days * mode.servingsPerDay}`;
  return (
    <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-faint)]">
      {label} · ×{factor.toFixed(2).replace(/\.00$/, "")}
    </span>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
