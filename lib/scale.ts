// Pure-math portion scaling with readable fraction rendering.

import type { Eaters } from "./portions";

export type ScaleMode =
  | { kind: "servings"; target: number }
  | { kind: "mealPrep"; days: number; servingsPerDay: number }
  // Household mode: the recipe as written, split per ingredient category (see lib/portions.ts).
  | { kind: "eaters"; eaters: Eaters };

export function scaleFactor(originalServings: number | null | undefined, mode: ScaleMode): number {
  const base = originalServings && originalServings > 0 ? originalServings : 2; // safe default
  if (mode.kind === "servings") return mode.target / base;
  if (mode.kind === "eaters") return 1; // per-line factor is category-dependent; callers use eatersFactor()
  return (mode.days * mode.servingsPerDay) / base;
}

// Render a number as a mixed fraction when sensible: 1.5 -> "1 1/2", 0.25 -> "1/4"
// Tolerance lets near-fractions round to clean fractions for display.
const COMMON_DENOMS = [2, 3, 4, 6, 8];
export function renderQty(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  const whole = Math.floor(v);
  const frac = v - whole;
  if (frac < 1e-3) return `${sign}${whole}`;

  // find closest common fraction within 0.02 tolerance
  for (const d of COMMON_DENOMS) {
    for (let n = 1; n < d; n++) {
      if (Math.abs(frac - n / d) < 0.02) {
        const reduced = reduce(n, d);
        if (whole > 0) return `${sign}${whole} ${reduced[0]}/${reduced[1]}`;
        return `${sign}${reduced[0]}/${reduced[1]}`;
      }
    }
  }
  // fall back to 1-decimal
  const rounded = Math.round(v * 10) / 10;
  return `${sign}${rounded}`;
}

function reduce(n: number, d: number): [number, number] {
  const g = gcd(n, d);
  return [n / g, d / g];
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function formatRange(qtyMin: number | null, qtyMax: number | null): string {
  if (qtyMin === null) return "";
  if (qtyMax === null || qtyMin === qtyMax) return renderQty(qtyMin);
  return `${renderQty(qtyMin)}–${renderQty(qtyMax)}`;
}
