"use client";

// Four filters map to real decisions and stay visible: pinned-to-try, ≤30 min,
// heart-healthy, Lydia's picks. The other twenty-odd chips (cuisines, tags, more
// time buckets) fold into one Filters sheet with sections and counts — the same
// structure the randomize sheet already proved out.

import { useEffect, useState } from "react";

type Props = {
  q: string;
  onQ: (v: string) => void;
  cuisines: string[];
  cuisineCounts: Record<string, number>;
  activeCuisine: string | null;
  onCuisine: (v: string | null) => void;
  maxTime: number | null;
  onMaxTime: (v: number | null) => void;
  wantToTryOnly: boolean;
  onWantToTry: (v: boolean) => void;
  tags: string[];
  tagCounts: Record<string, number>;
  activeTag: string | null;
  onTag: (v: string | null) => void;
  total: number;
  shown: number;
};

const TIME_BUCKETS: { label: string; max: number }[] = [
  { label: "≤ 15", max: 15 },
  { label: "≤ 30", max: 30 },
  { label: "≤ 60", max: 60 },
];

/** Tags whose UI name differs from the Notion option ("Lydia" is a person, not a flavour). */
const TAG_DISPLAY: Record<string, string> = { Lydia: "Lydia's picks" };
const displayTag = (t: string) => TAG_DISPLAY[t] ?? t.toLowerCase();

const PROMOTED_TAGS = ["Heart Healthy", "Lydia"];

export function FilterBar({
  q,
  onQ,
  cuisines,
  cuisineCounts,
  activeCuisine,
  onCuisine,
  maxTime,
  onMaxTime,
  wantToTryOnly,
  onWantToTry,
  tags,
  tagCounts,
  activeTag,
  onTag,
  total,
  shown,
}: Props) {
  const [sheet, setSheet] = useState(false);

  // Anything active beyond the promoted four earns a badge on the Filters chip.
  const advancedCount =
    (activeCuisine ? 1 : 0) +
    (maxTime !== null && maxTime !== 30 ? 1 : 0) +
    (activeTag && !PROMOTED_TAGS.includes(activeTag) ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="Search…"
          className="w-full border-b-2 border-[var(--color-line)] bg-transparent py-3 pl-7 text-base text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-terra)]"
        />
        <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">
          ⌕
        </span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
          {shown} / {total}
        </span>
      </div>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip active={wantToTryOnly} onClick={() => onWantToTry(!wantToTryOnly)} glyph="pin">
          Pinned to try
        </Chip>
        <Chip active={maxTime === 30} onClick={() => onMaxTime(maxTime === 30 ? null : 30)}>
          ≤ 30 min
        </Chip>
        {tags.includes("Heart Healthy") && (
          <Chip active={activeTag === "Heart Healthy"} onClick={() => onTag(activeTag === "Heart Healthy" ? null : "Heart Healthy")}>
            ♥ Heart healthy
          </Chip>
        )}
        {tags.includes("Lydia") && (
          <Chip active={activeTag === "Lydia"} onClick={() => onTag(activeTag === "Lydia" ? null : "Lydia")}>
            Lydia&rsquo;s picks
          </Chip>
        )}
        <Chip active={advancedCount > 0} onClick={() => setSheet(true)}>
          Filters{advancedCount > 0 ? ` · ${advancedCount}` : ""} ▾
        </Chip>
      </div>

      {sheet && (
        <FilterSheet
          cuisines={cuisines}
          cuisineCounts={cuisineCounts}
          activeCuisine={activeCuisine}
          onCuisine={onCuisine}
          maxTime={maxTime}
          onMaxTime={onMaxTime}
          tags={tags}
          tagCounts={tagCounts}
          activeTag={activeTag}
          onTag={onTag}
          onClose={() => setSheet(false)}
          onClear={() => {
            onCuisine(null);
            onMaxTime(null);
            onTag(null);
            onWantToTry(false);
          }}
        />
      )}
    </div>
  );
}

function FilterSheet({
  cuisines,
  cuisineCounts,
  activeCuisine,
  onCuisine,
  maxTime,
  onMaxTime,
  tags,
  tagCounts,
  activeTag,
  onTag,
  onClose,
  onClear,
}: {
  cuisines: string[];
  cuisineCounts: Record<string, number>;
  activeCuisine: string | null;
  onCuisine: (v: string | null) => void;
  maxTime: number | null;
  onMaxTime: (v: number | null) => void;
  tags: string[];
  tagCounts: Record<string, number>;
  activeTag: string | null;
  onTag: (v: string | null) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const chip = (on: boolean, label: string, count: number | null, onClick: () => void) => (
    <button key={label} onClick={onClick} data-on={on} className="chip-toggle shrink-0 px-3 py-1.5 text-[12px]">
      {label}
      {count !== null && <span className={on ? "opacity-70" : "text-[var(--color-faint)]"}> {count}</span>}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="filters-title"
    >
      <div
        className="animate-slide-up flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-[var(--color-card)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h2 id="filters-title" className="font-display-italic text-2xl text-[var(--color-ink)]">
            Filters
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={onClear} className="min-h-9 text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted)] hover:text-[var(--color-terra)]">
              Clear all
            </button>
            <button onClick={onClose} className="btn-quiet px-3 py-1 text-[11px] uppercase tracking-[0.08em]">
              Done
            </button>
          </div>
        </div>

        <div className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Time</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIME_BUCKETS.map((b) =>
            chip(maxTime === b.max, `${b.label} min`, null, () => onMaxTime(maxTime === b.max ? null : b.max)),
          )}
        </div>

        <div className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Cuisine</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {cuisines.map((c) =>
            chip(activeCuisine === c, c, cuisineCounts[c] ?? 0, () => onCuisine(activeCuisine === c ? null : c)),
          )}
        </div>

        <div className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Tags</div>
        <div className="mt-2 flex flex-wrap gap-2 pb-2">
          {tags.map((t) =>
            chip(activeTag === t, displayTag(t), tagCounts[t] ?? 0, () => onTag(activeTag === t ? null : t)),
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  glyph,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  glyph?: "pin";
}) {
  const base =
    "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap min-h-9";
  const activeCls =
    "border-[var(--color-terra-dark)] bg-[var(--color-terra)] text-[var(--color-cream)] shadow-sm";
  const inactiveCls =
    "border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-body)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]";

  return (
    <button onClick={onClick} className={`${base} ${active ? activeCls : inactiveCls}`}>
      {glyph === "pin" && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="mr-1.5 inline-block align-[-1px]"
        >
          <path d="M12 16.5v5" />
          <path d="M9 3.5h6l-.8 5.6 3.2 3.4a1 1 0 0 1-.73 1.68H7.33a1 1 0 0 1-.73-1.68l3.2-3.4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
