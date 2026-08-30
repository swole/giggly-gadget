"use client";

import { useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/lib/recipes";
import { totalMinutes } from "@/lib/recipes";
import { Die } from "./plan/Die";

export function RandomRoll({ recipes }: { recipes: Recipe[] }) {
  const [pick, setPick] = useState<Recipe | null>(null);
  const [spinning, setSpinning] = useState(false);

  function roll() {
    if (recipes.length === 0) return;
    setSpinning(true);

    const pool = pick ? recipes.filter((r) => r.id !== pick.id) : recipes;
    const next = pool[Math.floor(Math.random() * pool.length)];

    window.setTimeout(() => {
      setPick(next);
      setSpinning(false);
    }, 350);
  }

  function dismiss() {
    setPick(null);
  }

  // Initial state: prompt button
  if (!pick) {
    return (
      <button
        onClick={roll}
        className="group flex w-full items-center justify-between rounded-xl border-2 border-[var(--color-terra)] bg-[var(--color-card)] px-5 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[var(--color-terra)] hover:shadow-md"
      >
        <div className="flex items-center gap-4">
          <Die
            size={30}
            className="shrink-0 text-[var(--color-terra)] transition-all group-hover:rotate-12 group-hover:text-[var(--color-cream)]"
          />
          <div>
            <div className="font-display text-lg leading-tight text-[var(--color-ink)] group-hover:text-[var(--color-cream)]">
              Surprise me
            </div>
            <div className="text-xs text-[var(--color-muted)] group-hover:text-[var(--color-cream)]/85">
              Pick something from all {recipes.length} for me
            </div>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--color-terra)]/50 bg-[var(--color-card)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-terra)] shadow-[0_1px_3px_-1px_rgba(85,55,25,0.25)] transition-colors group-hover:border-[var(--color-cream)]/60 group-hover:bg-transparent group-hover:text-[var(--color-cream)]">
          Roll →
        </span>
      </button>
    );
  }

  // Rolled state: show the pick
  const total = totalMinutes(pick);
  const meta = [pick.cuisine, pick.meal_type, total ? `${total} min` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 border-[var(--color-terra)] bg-gradient-to-br from-[var(--color-card)] to-[var(--color-paper-2)]/40 shadow-md transition-all duration-300 ${
        spinning ? "scale-[0.98] opacity-60" : "scale-100 opacity-100"
      }`}
    >
      <button
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 text-sm text-[var(--color-faint)] hover:text-[var(--color-ink)]"
      >
        ✕
      </button>

      <div className="flex items-stretch">
        {pick.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pick.image_url}
            alt={pick.title}
            className={`h-28 w-28 shrink-0 object-cover transition-transform duration-300 sm:h-32 sm:w-32 ${
              spinning ? "scale-110 blur-sm" : ""
            }`}
          />
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center bg-[var(--color-paper-2)] sm:h-32 sm:w-32">
            <Die size={44} className={spinning ? "animate-dice text-[var(--color-terra)]" : "text-[var(--color-terra)]"} />
          </div>
        )}

        <div className="flex flex-1 flex-col justify-center px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[var(--color-terra)]">
            <Die size={15} className={spinning ? "animate-dice" : ""} />
            <span>Tonight&rsquo;s pick</span>
          </div>
          <div className="font-display mt-1 text-xl leading-tight text-[var(--color-ink)] sm:text-2xl">
            {pick.title}
          </div>
          {meta && (
            <div className="mt-1 text-xs text-[var(--color-muted)]">{meta}</div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={roll}
              disabled={spinning}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-xs text-[var(--color-body)] transition-colors hover:border-[var(--color-clay)]/60 hover:text-[var(--color-terra)] disabled:opacity-50"
            >
              <span className={spinning ? "inline-block animate-spin" : ""}>↻</span>
              Roll again
            </button>
            <Link
              href={`/recipes/${pick.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-terra)] px-4 py-1.5 text-xs font-medium text-[var(--color-cream)] shadow-sm transition-colors hover:bg-[var(--color-terra-dark)]"
            >
              Open →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
