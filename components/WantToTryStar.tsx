"use client";

import { useState } from "react";

type Props = {
  recipeId: string;
  initial: boolean;
  variant?: "overlay" | "inline";
};

export function WantToTryStar({ recipeId, initial, variant = "overlay" }: Props) {
  const [flagged, setFlagged] = useState(initial);
  const [pending, setPending] = useState(false);

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
        title={flagged ? "Remove from want-to-try" : "Add to want-to-try"}
        className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-medium transition-all ${
          flagged
            ? "border-[var(--color-mustard)] bg-[var(--color-mustard)] text-[var(--color-cream)]"
            : "border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-body)] hover:border-[var(--color-mustard)] hover:text-[var(--color-mustard)]"
        }`}
      >
        <span className="text-sm leading-none">{flagged ? "★" : "☆"}</span>
        {flagged ? "Want to try" : "Want to try"}
      </button>
    );
  }

  // overlay variant — for use on top of a card image
  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={flagged}
      title={flagged ? "Remove from want-to-try" : "Add to want-to-try"}
      className={`absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-base shadow-md transition-all ${
        flagged
          ? "bg-[var(--color-mustard)] text-[var(--color-cream)] hover:brightness-105"
          : "bg-[var(--color-card)]/95 text-[var(--color-muted)] hover:text-[var(--color-mustard)]"
      } ${pending ? "opacity-50" : ""}`}
    >
      {flagged ? "★" : "☆"}
    </button>
  );
}
