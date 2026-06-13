"use client";

import type { ScaleMode } from "@/lib/scale";

type Props = {
  baseServings: number | null;
  mode: ScaleMode;
  onChange: (mode: ScaleMode) => void;
};

const SERVING_PRESETS = [1, 2, 4, 6];

export function ScaleControl({ baseServings, mode, onChange }: Props) {
  const isMealPrep = mode.kind === "mealPrep";
  const activeServings = mode.kind === "servings" ? mode.target : null;

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-2)]/40 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Scale
        </span>
        {baseServings && (
          <span className="text-[10px] text-[var(--color-faint)]">
            originally serves {baseServings}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SERVING_PRESETS.map((s) => (
          <button
            key={s}
            onClick={() => onChange({ kind: "servings", target: s })}
            className={pill(activeServings === s)}
          >
            {s}{" "}
            <span className="text-[var(--color-faint)]">{s === 1 ? "serving" : "servings"}</span>
          </button>
        ))}

        <button
          onClick={() =>
            onChange(
              isMealPrep
                ? { kind: "servings", target: baseServings ?? 2 }
                : { kind: "mealPrep", days: 5, servingsPerDay: 1 }
            )
          }
          className={pill(isMealPrep)}
        >
          Meal prep
        </button>
      </div>

      {isMealPrep && mode.kind === "mealPrep" && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stepper
            label="Days"
            value={mode.days}
            min={1}
            max={14}
            onChange={(v) =>
              onChange({ kind: "mealPrep", days: v, servingsPerDay: mode.servingsPerDay })
            }
          />
          <Stepper
            label="Per day"
            value={mode.servingsPerDay}
            min={1}
            max={6}
            onChange={(v) =>
              onChange({ kind: "mealPrep", days: mode.days, servingsPerDay: v })
            }
          />
        </div>
      )}
    </div>
  );
}

function pill(active: boolean): string {
  const base = "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all";
  return active
    ? `${base} border-[var(--color-terra-dark)] bg-[var(--color-terra)] text-[var(--color-cream)] shadow-sm`
    : `${base} border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-body)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]`;
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="text-lg text-[var(--color-muted)] hover:text-[var(--color-terra)] disabled:text-[var(--color-faint)]"
          disabled={value <= min}
        >
          −
        </button>
        <span className="font-display w-6 text-center text-xl text-[var(--color-ink)] tabular-nums">
          {value}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="text-lg text-[var(--color-muted)] hover:text-[var(--color-terra)] disabled:text-[var(--color-faint)]"
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}
