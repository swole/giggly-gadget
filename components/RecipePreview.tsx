"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/lib/recipes";
import { totalMinutes } from "@/lib/recipes";
import { WantToTryStar } from "./WantToTryStar";

type IngredientRow = {
  name: string | null;
  qty_min: number | null;
  unit: string | null;
  to_taste: boolean;
};

type Props = {
  recipe: Recipe;
  onClose: () => void;
};

export function RecipePreview({ recipe, onClose }: Props) {
  const [ingredients, setIngredients] = useState<IngredientRow[] | null>(null);

  // Lazy fetch ingredient names
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/recipes/${recipe.id}/ingredients`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setIngredients(data as IngredientRow[]);
      })
      .catch(() => {
        if (!cancelled) setIngredients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [recipe.id]);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock background scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const total = totalMinutes(recipe);
  const ingredientNames = (ingredients ?? [])
    .map((i) => i.name?.trim())
    .filter((n): n is string => Boolean(n));
  const visibleNames = ingredientNames.slice(0, 14);
  const remaining = Math.max(0, ingredientNames.length - visibleNames.length);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-ink)]/55 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={recipe.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-slide-up flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border-2 border-[var(--color-line)] bg-[var(--color-card)] shadow-2xl sm:rounded-3xl"
      >
        {/* Drag handle (mobile feel) */}
        <div className="flex justify-center pt-2 sm:hidden">
          <div className="h-1 w-12 rounded-full bg-[var(--color-line)]" />
        </div>

        {/* Image hero */}
        {recipe.image_url ? (
          <div className="relative aspect-[16/10] shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="h-full w-full object-cover"
            />
            <CloseButton onClose={onClose} />
          </div>
        ) : (
          <div className="relative flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-[var(--color-clay)] to-[var(--color-terra)]">
            <span className="font-display text-5xl text-[var(--color-cream)]/70">🥄</span>
            <CloseButton onClose={onClose} />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
              {[recipe.cuisine, recipe.meal_type].filter(Boolean).join(" · ") || "Recipe"}
            </div>
            {recipe.source && (
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-cream)] ${
                  recipe.source === "Claude"
                    ? "bg-[var(--color-sage)]"
                    : "bg-[var(--color-clay)]"
                }`}
              >
                by {recipe.source}
              </span>
            )}
          </div>

          <h2 className="font-display mt-2 text-3xl leading-tight text-[var(--color-ink)] sm:text-4xl">
            {recipe.title}
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
            {total !== null && <span>◷ {total} min</span>}
            {recipe.difficulty && <span>◆ {recipe.difficulty}</span>}
            {recipe.servings && <span>⊙ serves {recipe.servings}</span>}
            {recipe.rating ? (
              <span className="text-[var(--color-mustard)]">
                {"★".repeat(recipe.rating)}
              </span>
            ) : null}
          </div>

          {recipe.tags?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {recipe.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--color-line-soft)] bg-[var(--color-paper-2)]/70 px-2 py-0.5 text-[10px] tracking-wide text-[var(--color-body)]"
                >
                  {t.toLowerCase()}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-[var(--color-line-soft)] pt-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">
              What&rsquo;s inside
            </div>
            {ingredients === null ? (
              <div className="mt-2 text-sm italic text-[var(--color-faint)]">
                Loading ingredients…
              </div>
            ) : ingredientNames.length === 0 ? (
              <div className="mt-2 text-sm italic text-[var(--color-faint)]">
                No ingredients listed yet.
              </div>
            ) : (
              <div className="mt-2 text-sm leading-relaxed text-[var(--color-body)]">
                {visibleNames.join(" · ")}
                {remaining > 0 && (
                  <span className="text-[var(--color-faint)]"> · +{remaining} more</span>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <WantToTryStar
              recipeId={recipe.id}
              initial={recipe.want_to_try}
              variant="inline"
            />
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="btn-quiet px-4 py-2.5 text-sm"
            >
              ✕ Close
            </button>
            <Link
              href={`/recipes/${recipe.id}`}
              className="btn-primary px-5 py-2.5 text-sm font-medium"
            >
              Open recipe →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Close"
      className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-ink)]/65 text-[var(--color-cream)] backdrop-blur-sm transition-colors hover:bg-[var(--color-ink)]/85"
    >
      ✕
    </button>
  );
}
