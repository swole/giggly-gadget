"use client";

// "⋯" menu on the planner: fill from the heart-healthy rotation, or copy last week.

import { useState } from "react";
import { addDays } from "@/lib/week";
import { rotationWeekFor, type RotationWeekNo } from "@/lib/plan/rotation";

type Result = { text: string; tone: "ok" | "warn" };

export function WeekActionsMenu({ weekOf, onDone }: { weekOf: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rot, setRot] = useState<RotationWeekNo>(rotationWeekFor(weekOf));
  const [mode, setMode] = useState<"fill_empty" | "replace">("fill_empty");
  const [result, setResult] = useState<Result | null>(null);

  async function post(url: string, body: unknown): Promise<Record<string, unknown> | null> {
    if (mode === "replace" && !confirm("Replace the whole week? Every planned meal this week is removed first (cooked ones too).")) return null;
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setResult({ text: j.error ?? `Failed (${res.status})`, tone: "warn" });
        return null;
      }
      return (await res.json()) as Record<string, unknown>;
    } catch {
      setResult({ text: "No connection — try again.", tone: "warn" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function fill() {
    const j = await post("/api/plan/fill", { week_of: weekOf, rotation_week: rot, mode });
    if (!j) return;
    const unmatched = (j.unmatched as string[]) ?? [];
    setResult({
      text: `Rotation week ${rot}: ${j.added} added · ${j.skipped} skipped${Number(j.removed) ? ` · ${j.removed} cleared` : ""}${
        unmatched.length ? ` · not found: ${unmatched.join(", ")}` : ""
      }`,
      tone: unmatched.length ? "warn" : "ok",
    });
    onDone();
  }

  async function copyLast() {
    const j = await post("/api/plan/copy", { from_week: addDays(weekOf, -7), to_week: weekOf, mode });
    if (!j) return;
    setResult({ text: `Copied last week: ${j.copied} added · ${j.skipped} skipped`, tone: "ok" });
    onDone();
  }

  async function clearWeek() {
    if (!confirm("Clear the week? Every planned meal goes — cooked ones stay as the record.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/plan/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ week_of: weekOf }),
      });
      const j = (await res.json().catch(() => ({}))) as { removed?: number; kept_cooked?: number; error?: string };
      if (!res.ok) {
        setResult({ text: j.error ?? `Failed (${res.status})`, tone: "warn" });
        return;
      }
      setResult({
        text: `Cleared ${j.removed ?? 0} meal${(j.removed ?? 0) === 1 ? "" : "s"}${j.kept_cooked ? ` · ${j.kept_cooked} cooked kept` : ""}`,
        tone: "ok",
      });
      onDone();
    } catch {
      setResult({ text: "No connection — try again.", tone: "warn" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-quiet px-3 py-1.5 text-[10px] uppercase tracking-[0.18em]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        ⋯ Actions
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4 text-sm shadow-xl">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Fill from the rotation</div>
          <div className="mt-2 flex items-center gap-2">
            {([1, 2, 3] as RotationWeekNo[]).map((n) => (
              <button
                key={n}
                onClick={() => setRot(n)}
                className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${
                  rot === n ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "border border-[var(--color-line)] text-[var(--color-muted)]"
                }`}
              >
                Week {n}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-[var(--color-faint)]">suggested: {rotationWeekFor(weekOf)}</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            {(["fill_empty", "replace"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-[var(--color-muted)]">
                <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
                {m === "fill_empty" ? "Fill empty slots" : "Replace the week"}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={fill} disabled={busy} className="btn-ink px-4 py-2 text-[10px] uppercase tracking-[0.16em]">
              {busy ? "Working…" : "Fill"}
            </button>
            <button onClick={copyLast} disabled={busy} className="btn-quiet px-4 py-2 text-[10px] uppercase tracking-[0.16em]">
              Copy last week
            </button>
          </div>
          <div className="mt-3 border-t border-[var(--color-line)]/50 pt-3">
            <button
              onClick={clearWeek}
              disabled={busy}
              className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-terra-dark)] hover:text-[var(--color-terra)] disabled:opacity-50"
            >
              Clear the week (keeps cooked)
            </button>
          </div>
          {result && (
            <p className={`mt-3 text-xs ${result.tone === "ok" ? "text-[var(--color-sage)]" : "text-[var(--color-terra-dark)]"}`}>{result.text}</p>
          )}
          <button onClick={() => setOpen(false)} className="btn-quiet mt-3 px-3 py-1 text-[10px] uppercase tracking-[0.16em]">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
