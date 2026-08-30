"use client";

import { useState } from "react";

import type { Eaters } from "@/lib/portions";

type Props = {
  recipeId: string;
  scaleFactor: number;
  /** Household mode: server applies the per-category split instead of scale_factor. */
  eaters?: Eaters;
};

export function AddToGroceryButton({ recipeId, scaleFactor, eaters }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [info, setInfo] = useState<{ added: number; merged: number } | null>(null);

  async function add() {
    setState("loading");
    try {
      const res = await fetch("/api/grocery/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipe_id: recipeId, scale_factor: scaleFactor, eaters }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInfo({ added: data.added, merged: data.merged });
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  }

  const label =
    state === "loading"
      ? "Adding…"
      : state === "done"
        ? `Added · ${info?.added ?? 0} new, ${info?.merged ?? 0} merged`
        : state === "error"
          ? "Try again"
          : "Add to grocery list";

  return (
    <button
      onClick={add}
      disabled={state === "loading"}
      // Quiet on purpose: the list already follows the plan by itself — this is the
      // manual override, not the page's main act (that's Start cooking).
      className="group relative w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-3 text-sm font-medium text-[var(--color-body)] shadow-[0_1px_3px_-1px_rgba(92,65,40,0.25)] transition-all hover:border-[var(--color-terra)] hover:text-[var(--color-terra)] disabled:opacity-60"
    >
      <span className="inline-flex items-center gap-2">
        <span>{state === "done" ? "✓" : "+"}</span>
        {label}
      </span>
    </button>
  );
}
