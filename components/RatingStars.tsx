"use client";

import { useState } from "react";
import { isPlanner } from "@/lib/role";
import { useRole } from "@/components/role/RoleProvider";

type Props = {
  recipeId: string;
  initial: number | null;
  /** Smaller stars for inline spots (the Kitchen card after cooking). */
  compact?: boolean;
};

/** One star, filled 0 / ½ / 1 — drawn inline so halves render everywhere. */
function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: number }) {
  const path =
    "M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.57l-5.9 3.1 1.13-6.57L2.45 9.44l6.6-.96L12 2.5z";
  const id = `half-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {fill === 0.5 && (
        <defs>
          <clipPath id={id}>
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
      )}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[var(--color-line)]" />
      {fill === 1 && <path d={path} className="fill-[var(--color-mustard)]" />}
      {fill === 0.5 && <path d={path} clipPath={`url(#${id})`} className="fill-[var(--color-mustard)]" />}
    </svg>
  );
}

// Interactive rating, 1–5 in half-star steps. Tap a star for the full value;
// tap the same star again for the half (4 → 3.5); tap once more to clear.
// Writes through to Supabase + Notion via /api/recipes/[id]/rating.
export function RatingStars({ recipeId, initial, compact = false }: Props) {
  const role = useRole();
  const [rating, setRating] = useState(initial ?? 0);
  const [hover, setHover] = useState(0);
  const [pending, setPending] = useState(false);

  // Rating / want-to-try write back to Notion — curation is for the planners.
  if (!isPlanner(role)) return null;

  async function save(value: number) {
    if (pending) return;
    const prev = rating;
    setRating(value);
    setPending(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/rating`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setRating(prev); // revert on failure
    } finally {
      setPending(false);
    }
  }

  function tap(n: number) {
    // n → n-0.5 → clear → n …
    if (rating === n) return void save(n - 0.5);
    if (rating === n - 0.5) return void save(0);
    void save(n);
  }

  const display = hover || rating;
  const size = compact ? 18 : 22;
  const fillFor = (n: number): 0 | 0.5 | 1 => (display >= n ? 1 : display === n - 0.5 ? 0.5 : 0);

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="radiogroup"
      aria-label="Rating (1–5, half-star steps)"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={rating === n || rating === n - 0.5}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={pending}
          onClick={() => tap(n)}
          onMouseEnter={() => setHover(n)}
          title={
            rating === n
              ? `Tap again for ${n - 0.5}`
              : rating === n - 0.5
                ? "Tap to clear"
                : `Rate ${n}${rating ? ` (now ${rating})` : ""}`
          }
          className={`leading-none transition-transform ${pending ? "opacity-50" : "hover:scale-110"}`}
        >
          <Star fill={fillFor(n)} size={size} />
        </button>
      ))}
      {rating > 0 && (
        <span className={`ml-1.5 tabular-nums text-[var(--color-muted)] ${compact ? "text-xs" : "text-sm"}`}>
          {rating}
        </span>
      )}
      {rating > 0 && !compact && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void save(0)}
          title="Clear rating"
          className="ml-2 text-xs text-[var(--color-muted)] underline-offset-2 hover:underline"
        >
          clear
        </button>
      )}
    </div>
  );
}
