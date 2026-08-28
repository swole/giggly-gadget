// Keep the grocery list in step with the plan without anyone pressing "Build".
// Plan mutations call scheduleGroceryRebuild(weeks) and the rebuild runs after the
// response is sent (Next `after()` → Vercel waitUntil). Reconcile keeps checked state
// and manual rows, so rebuilding is always safe; runs for one week are coalesced.

import { after } from "next/server";
import { buildWeekGroceries } from "./build";

const inflight = new Map<string, Promise<unknown>>();

export function scheduleGroceryRebuild(...weeks: Array<string | null | undefined>) {
  const uniq = Array.from(new Set(weeks.filter((w): w is string => !!w)));
  if (uniq.length === 0) return;
  after(async () => {
    for (const w of uniq) await rebuildWeek(w);
  });
}

async function rebuildWeek(weekOf: string): Promise<void> {
  const running = inflight.get(weekOf);
  if (running) await running.catch(() => {});
  const p = buildWeekGroceries(weekOf).catch((e: unknown) => {
    console.error("[grocery] auto rebuild failed", weekOf, e instanceof Error ? e.message : e);
  });
  inflight.set(weekOf, p);
  try {
    await p;
  } finally {
    if (inflight.get(weekOf) === p) inflight.delete(weekOf);
  }
}
