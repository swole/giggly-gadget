"use client";

import { useEffect } from "react";
import { hotkeyDigit } from "@/lib/nav/hotkeys";

type Row = { keys: string[]; label: string };

/**
 * The `?` card. Marked data-hotkeys="passthrough" so the number keys still work while it
 * is open — you read the digit off the card and press it, and the navigation closes it.
 * `?` itself is owned by the global handler (it toggles); this only takes Escape.
 */
export function ShortcutsSheet({
  tabs,
  personLabel,
  onClose,
}: {
  tabs: { label: string }[];
  personLabel: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nav: Row[] = tabs.map((t, i) => ({ keys: [hotkeyDigit(i) ?? ""], label: t.label }));
  nav.push({ keys: [hotkeyDigit(tabs.length) ?? ""], label: `Switch person (${personLabel})` });

  const elsewhere: Row[] = [
    { keys: ["?"], label: "This card" },
    { keys: ["Esc"], label: "Close any sheet" },
    { keys: ["←", "→"], label: "Cook mode: previous / next step" },
    { keys: ["Space"], label: "Cook mode: next step" },
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      data-hotkeys="passthrough"
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-[var(--color-card)] px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 shadow-2xl sm:rounded-3xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Giggly Gadget</div>
        <h2 id="shortcuts-title" className="font-display-italic mt-2 text-3xl leading-tight text-[var(--color-ink)]">
          Keyboard
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Numbers follow the bar, left to right.</p>

        <Group title="Go to" rows={nav} />
        <Group title="Everywhere else" rows={elsewhere} />

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-2xl border border-[var(--color-line)] py-3 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-terra)] hover:text-[var(--color-ink)]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <>
      <div className="mt-6 text-[11px] uppercase tracking-[0.18em] text-[var(--color-faint)]">{title}</div>
      <dl className="mt-2 divide-y divide-[var(--color-line)]/40">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-sm text-[var(--color-body)]">{r.label}</dt>
            <dd className="flex shrink-0 gap-1">
              {r.keys.map((k) => (
                <kbd
                  key={k}
                  className="min-w-[1.75rem] rounded-md border border-[var(--color-line)] bg-[var(--color-paper)]/60 px-1.5 py-0.5 text-center font-mono text-[12px] text-[var(--color-ink)]"
                >
                  {k}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
