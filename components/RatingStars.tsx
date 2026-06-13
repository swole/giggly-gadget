"use client";

import { useState } from "react";

type Props = {
  recipeId: string;
  initial: number | null;
};

// Interactive 1-5 star rating. Hover previews, click sets, clicking the current
// top star (or "clear") resets to unrated. Writes through to Supabase + Notion
// via /api/recipes/[id]/rating, mirroring the Want to Try toggle.
export function RatingStars({ recipeId, initial }: Props) {
  const [rating, setRating] = useState(initial ?? 0);
  const [hover, setHover] = useState(0);
  const [pending, setPending] = useState(false);

  async function save(value: number) {
    if (pending) return;
    const next = value === rating ? 0 : value; // re-click clears
    const prev = rating;
    setRating(next);
    setPending(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/rating`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setRating(prev); // revert on failure
    } finally {
      setPending(false);
    }
  }

  const display = hover || rating;

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="radiogroup"
      aria-label="Rating"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={rating === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={pending}
          onClick={() => save(n)}
          onMouseEnter={() => setHover(n)}
          title={
            n === rating
              ? "Click to clear rating"
              : `Rate ${n} star${n > 1 ? "s" : ""}`
          }
          className={`text-xl leading-none transition-transform ${
            pending ? "opacity-50" : "hover:scale-110"
          } ${
            n <= display
              ? "text-[var(--color-mustard)]"
              : "text-[var(--color-line)] hover:text-[var(--color-mustard)]"
          }`}
        >
          {n <= display ? "★" : "☆"}
        </button>
      ))}
      {rating > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => save(0)}
          title="Clear rating"
          className="ml-2 text-xs text-[var(--color-muted)] underline-offset-2 hover:underline"
        >
          clear
        </button>
      )}
    </div>
  );
}
