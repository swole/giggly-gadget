"use client";

// "Share" on the planner: hands Johnny/Lydia a WhatsApp-ready message for Shallaine —
// the week's menu as text plus a link that opens this week read-only. The link carries
// ?as=helper so a browser with no role yet (e.g. WhatsApp's in-app browser) lands as
// the helper without seeing the picker.

import { useState } from "react";
import type { LunchLocationRow, PlannedMeal, PlannerRecipe, Slot } from "@/lib/plan/types";
import { mealTitle } from "@/lib/plan/types";
import { lunchAway, packShort } from "@/lib/plan/lunch";
import { formatDayLabel, formatWeekRange, weekDates } from "@/lib/week";

const SLOT_ORDER: Slot[] = ["breakfast", "lunch", "dinner", "snack"];

export function shareText(weekOf: string, meals: PlannedMeal[], byId: Record<string, PlannerRecipe>, lunch: LunchLocationRow[] = []): string {
  const lines: string[] = [`Meals for ${formatWeekRange(weekOf)}`];
  for (const d of weekDates(weekOf)) {
    const ms = meals
      .filter((m) => m.planned_for === d)
      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.position - b.position);
    if (ms.length === 0) continue;
    const dishes = ms.map((m) => `${m.leftover_of !== null ? "leftover " : ""}${mealTitle(m, byId)}`).join(" · ");
    // Office days: tell Shallaine whose lunch goes in a box.
    const pack = ms.some((m) => m.slot === "lunch") ? packShort(lunchAway(lunch, d)) : null;
    lines.push(`${formatDayLabel(d)}: ${dishes}${pack ? ` · ${pack}` : ""}`);
  }
  return lines.join("\n");
}

export function ShareWeekButton({
  weekOf,
  meals,
  byId,
  lunch = [],
}: {
  weekOf: string;
  meals: PlannedMeal[];
  byId: Record<string, PlannerRecipe>;
  lunch?: LunchLocationRow[];
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = `${window.location.origin}/plan?week=${weekOf}&as=helper`;
    const text = shareText(weekOf, meals, byId, lunch);
    const payload = { title: "This week's meals", text: `${text}\n`, url };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
    } catch {
      return; // user closed the share sheet — not an error
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <button onClick={() => void share()} className="btn-quiet px-3 py-1.5 text-[12px] uppercase tracking-[0.06em]" title="Send the week to Shallaine">
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed" : "Share"}
    </button>
  );
}
