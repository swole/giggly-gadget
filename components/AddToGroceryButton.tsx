"use client";

import { useState } from "react";

type Props = {
  recipeId: string;
  scaleFactor: number;
};

export function AddToGroceryButton({ recipeId, scaleFactor }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [info, setInfo] = useState<{ added: number; merged: number } | null>(null);

  async function add() {
    setState("loading");
    try {
      const res = await fetch("/api/grocery/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipe_id: recipeId, scale_factor: scaleFactor }),
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
      className="group relative w-full rounded-lg border border-[var(--color-terra)]/40 bg-[var(--color-terra)]/5 px-5 py-3 text-sm text-[var(--color-terra)] transition-all hover:border-[var(--color-terra)]/80 hover:bg-[var(--color-terra)]/10 disabled:opacity-50"
    >
      <span className="inline-flex items-center gap-2">
        <span>{state === "done" ? "✓" : "+"}</span>
        {label}
      </span>
    </button>
  );
}
