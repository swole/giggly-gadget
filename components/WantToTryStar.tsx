"use client";

import { useState } from "react";
import { isPlanner } from "@/lib/role";
import { useRole } from "@/components/role/RoleProvider";

type Props = {
  recipeId: string;
  initial: boolean;
  variant?: "overlay" | "inline";
};

export function WantToTryStar({ recipeId, initial, variant = "overlay" }: Props) {
  const role = useRole();
  const [flagged, setFlagged] = useState(initial);
  const [pending, setPending] = useState(false);

  // Rating / want-to-try write back to Notion — curation is for the planners.
  if (!isPlanner(role)) return null;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const next = !flagged;
    setFlagged(next);
    setPending(true);

    try {
      const res = await fetch(`/api/recipes/${recipeId}/want-to-try`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setFlagged(!next); // revert on failure
    } finally {
      setPending(false);
    }
  }

  if (variant === "inline") {
    return (
      <button
        onClick={toggle}
        disabled={pending}
        aria-pressed={flagged}
        title={flagged ? "Unpin from the try list" : "Pin to try"}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-medium transition-all ${
          flagged
            ? "border-[var(--color-mustard)] bg-[var(--color-mustard)] text-[var(--color-cream)]"
            : "border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-body)] hover:border-[var(--color-mustard)] hover:text-[var(--color-mustard)]"
        }`}
      >
        <PinIcon filled={flagged} />
        {flagged ? "Pinned to try" : "Pin to try"}
      </button>
    );
  }

  // overlay variant — for use on top of a card image
  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={flagged}
      title={flagged ? "Unpin from the try list" : "Pin to try"}
      className={`absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-all ${
        flagged
          ? "bg-[var(--color-mustard)] text-[var(--color-cream)] hover:brightness-105"
          : "bg-[var(--color-card)]/95 text-[var(--color-muted)] hover:text-[var(--color-mustard)]"
      } ${pending ? "opacity-50" : ""}`}
    >
      <PinIcon filled={flagged} />
    </button>
  );
}

/* One glyph per concept: stars rate, pins queue. Discover's own copy already says
   "what's pinned to try" — the control finally agrees with it. */
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M12 16.5v5" />
      <path d="M9 3.5h6l-.8 5.6 3.2 3.4a1 1 0 0 1-.73 1.68H7.33a1 1 0 0 1-.73-1.68l3.2-3.4z" />
    </svg>
  );
}
