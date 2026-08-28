// Ratings run 1–5 in half-star steps (0 = unrated). Notion stores them as a
// select whose option names are star emoji, with "½" appended for halves:
// ⭐ ⭐½ ⭐⭐ … ⭐⭐⭐⭐½ ⭐⭐⭐⭐⭐. Supabase stores numeric(3,1).

/** 0 (clear) or 1–5 in 0.5 steps. */
export function isValidRating(v: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (v === 0) return true;
  return v >= 1 && v <= 5 && Number.isInteger(v * 2);
}

/** 3.5 → "⭐⭐⭐½" · 4 → "⭐⭐⭐⭐" · 0/invalid → null (clears the select). */
export function toNotionRatingName(v: number): string | null {
  if (!isValidRating(v) || v === 0) return null;
  const full = Math.floor(v);
  return "⭐".repeat(full) + (v - full === 0.5 ? "½" : "");
}

/** "⭐⭐⭐½" → 3.5 · "★★★★" → 4 · anything unstarred → null. */
export function parseNotionRating(raw: string | null): number | null {
  if (!raw) return null;
  const stars = (raw.match(/[★⭐]/g) || []).length;
  if (stars === 0) return null;
  const half = /[½]/.test(raw) || /\.5/.test(raw) ? 0.5 : 0;
  const v = Math.min(stars + half, 5);
  return v;
}

/** Every Notion select option name a rating can take, low to high. */
export const NOTION_RATING_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let v = 1; v <= 5; v += 0.5) out.push(toNotionRatingName(v)!);
  return out;
})();
