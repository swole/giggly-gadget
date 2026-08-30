"use client";

// "Week actions" on the planner: fill from the heart-healthy rotation, copy last
// week, clear. A bottom sheet like every other overlay in the app — it dims the
// page, closes on Escape and backdrop tap, and never stacks under other popovers.

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-quiet whitespace-nowrap px-3 py-1.5 text-[11px] uppercase tracking-[0.08em]"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Week actions
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-[2px] sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="week-actions-title"
        >
          <div
            className="animate-slide-up w-full max-w-md rounded-t-3xl bg-[var(--color-card)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-sm shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h2 id="week-actions-title" className="font-display-italic text-2xl text-[var(--color-ink)]">
                Week actions
              </h2>
              <button onClick={() => setOpen(false)} className="btn-quiet px-3 py-1 text-[11px] uppercase tracking-[0.08em]">
                Close
              </button>
            </div>

            <div className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Fill from the rotation</div>
            <div className="mt-2 flex items-center gap-2">
              {([1, 2, 3] as RotationWeekNo[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setRot(n)}
                  className={`min-h-9 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.08em] ${
                    rot === n ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "border border-[var(--color-line)] text-[var(--color-muted)]"
                  }`}
                >
                  Week {n}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-[var(--color-faint)]">suggested: {rotationWeekFor(weekOf)}</span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs">
              {(["fill_empty", "replace"] as const).map((m) => (
                <label key={m} className="flex min-h-9 items-center gap-1.5 text-[var(--color-muted)]">
                  <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--color-terra)]" />
                  {m === "fill_empty" ? "Fill empty slots" : "Replace the week"}
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={fill} disabled={busy} className="btn-primary px-4 py-2 text-[11px] uppercase tracking-[0.08em]">
                {busy ? "Working…" : "Fill"}
              </button>
              <button onClick={copyLast} disabled={busy} className="btn-quiet px-4 py-2 text-[11px] uppercase tracking-[0.08em]">
                Copy last week
              </button>
            </div>
            <div className="mt-4 border-t border-[var(--color-line)]/50 pt-3">
              <button
                onClick={clearWeek}
                disabled={busy}
                className="btn-quiet px-4 py-2 text-[11px] uppercase tracking-[0.08em] text-[var(--color-terra-dark)] disabled:opacity-50"
              >
                Clear the week (keeps cooked)
              </button>
            </div>
            {result && (
              <p className={`mt-3 text-xs ${result.tone === "ok" ? "text-[var(--color-sage)]" : "text-[var(--color-terra-dark)]"}`}>{result.text}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
