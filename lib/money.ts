// Money in integer cents. Postgres stores numeric(8,2); everything the app adds, compares
// or prints goes through cents, so 0.1 + 0.2 never reaches a screen as 0.30000000000000004.
// Pure and client-safe (the grocery chips, the spend page and the API routes share it).

export type Cents = number;

/** Typographic minus for display. The DB and the CSV get the ASCII hyphen (amount2dp). */
const MINUS = "−";

/** Largest amount numeric(8,2) holds: S$999,999.99. */
export const MAX_CENTS = 99_999_999;

/**
 * 12.3 | "12.30" | "S$1,234.50" | "-2" | "−2.00" → cents. Rounds half away from zero at the
 * cent (1.005 → 101). Anything that is not a sum of money → null.
 */
export function toCents(v: number | string | null | undefined): Cents | null {
  if (v === null || v === undefined) return null;
  let s: string;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    // toFixed(6) first: 1.005 is stored as 1.00499999…, and six places brings it back to "1.005000".
    s = v.toFixed(6);
  } else {
    s = v.trim();
  }
  let neg = false;
  if (/^[-−]/.test(s)) {
    neg = true;
    s = s.slice(1).trim();
  }
  s = s.replace(/^S?\$\s*/i, "").replace(/[,\s]/g, "");
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return null;
  const frac = (m[2] ?? "").padEnd(3, "0");
  let cents = Number(m[1] || "0") * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return neg && cents !== 0 ? -cents : cents;
}

/** What someone typed into the amount field: a positive sum up to MAX_CENTS, else null. */
export function parseSgd(input: string): Cents | null {
  const c = toCents(input);
  if (c === null || c <= 0 || c > MAX_CENTS) return null;
  return c;
}

/** cents → number of dollars (34.2). Use amount2dp when the value goes to the DB or a file. */
export function fromCents(c: Cents): number {
  return Math.round(c) / 100;
}

/** "34.20" / "-2.00": two decimals, no grouping, ASCII minus. For numeric(8,2) writes and CSV. */
export function amount2dp(c: Cents): string {
  const a = Math.abs(Math.round(c));
  return `${c < 0 && a !== 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "18.90" / "−2.00" / "1,234.50": a receipt line, no currency sign. */
export function formatAmount(c: Cents): string {
  const a = Math.abs(Math.round(c));
  return `${c < 0 && a !== 0 ? MINUS : ""}${group(Math.floor(a / 100))}.${String(a % 100).padStart(2, "0")}`;
}

/** "S$34.20" / "S$1,234.50" / "−S$2.00". */
export function formatSgd(c: Cents): string {
  return c < 0 ? `${MINUS}S$${formatAmount(-c)}` : `S$${formatAmount(c)}`;
}

/** Whole dollars for chart labels: 11_849 → "118". */
export function formatDollars(c: Cents): string {
  return group(Math.round(c / 100));
}

export function sumCents(values: Iterable<Cents | null | undefined>): Cents {
  let total = 0;
  for (const v of values) if (typeof v === "number" && Number.isFinite(v)) total += v;
  return total;
}
