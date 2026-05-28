"use client";

type Props = {
  q: string;
  onQ: (v: string) => void;
  cuisines: string[];
  activeCuisine: string | null;
  onCuisine: (v: string | null) => void;
  maxTime: number | null;
  onMaxTime: (v: number | null) => void;
  wantToTryOnly: boolean;
  onWantToTry: (v: boolean) => void;
  tags: string[];
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

export function FilterBar({
  q,
  onQ,
  cuisines,
  activeCuisine,
  onCuisine,
  maxTime,
  onMaxTime,
  wantToTryOnly,
  onWantToTry,
  tags,
  activeTag,
  onTag,
  total,
  shown,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="Search…"
          className="w-full border-b border-[var(--color-line)] bg-transparent py-3 pl-7 text-base text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-faint)] focus:border-[var(--color-terra)]"
        />
        <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[var(--color-faint)]">
          ⌕
        </span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-faint)]">
          {shown} / {total}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
        <Chip
          active={wantToTryOnly}
          onClick={() => onWantToTry(!wantToTryOnly)}
          glyph="★"
        >
          Want to try
        </Chip>
        {TIME_BUCKETS.map((b) => (
          <Chip
            key={b.max}
            active={maxTime === b.max}
            onClick={() => onMaxTime(maxTime === b.max ? null : b.max)}
          >
            {b.label} min
          </Chip>
        ))}
      </div>

      {cuisines.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
          {cuisines.map((c) => (
            <Chip
              key={c}
              active={activeCuisine === c}
              onClick={() => onCuisine(activeCuisine === c ? null : c)}
            >
              {c}
            </Chip>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
          {tags.map((t) => (
            <Chip
              key={t}
              active={activeTag === t}
              onClick={() => onTag(activeTag === t ? null : t)}
              tone="subtle"
            >
              {t.toLowerCase()}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  glyph,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  glyph?: string;
  tone?: "default" | "subtle";
}) {
  const base =
    "shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors whitespace-nowrap";
  const activeCls =
    "border-[var(--color-terra)]/70 bg-[var(--color-terra)]/10 text-[var(--color-terra)]";
  const inactiveCls =
    tone === "subtle"
      ? "border-[var(--color-line)]/60 bg-[var(--color-paper)] text-[var(--color-muted)] hover:border-[var(--color-line)] hover:text-[var(--color-ink)]"
      : "border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-body)] hover:border-[var(--color-clay)]/60";

  return (
    <button
      onClick={onClick}
      className={`${base} ${active ? activeCls : inactiveCls}`}
    >
      {glyph && <span className="mr-1.5">{glyph}</span>}
      {children}
    </button>
  );
}
