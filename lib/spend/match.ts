// Receipt line -> shopping-list row. Pure and tested (match.test.ts).
//
// The receipt reader returns each line as printed ("CS FRESH BROCCOLI 300G") plus a generic
// name ("broccoli") and, when it can, the list name it thinks the line is. This module turns
// that into a grocery_list id per line, or null for "not on the list":
//   1. the reader's list_match, when it names a row that exists
//   2. otherwise a token match: retailer and pack-size noise dropped, till abbreviations
//      expanded, Singapore market names folded onto list names (tau kwa -> firm tofu),
//      plurals singularised, then Dice similarity with a containment boost
//   3. greedy one-to-one, then a second pass so two strong lines can share one row
//      (tau kwa and a pack of firm tofu both buy "firm tofu")
// Containment is vetoed when the line carries a word that makes it a different product:
// "spring onion" never ticks "onion", "egg noodles" never ticks "egg", "Kit Kat fingers"
// never ticks "lady's finger".

import { normalizeSearch } from "@/lib/plan/search";
import { singularize } from "@/lib/ingredients/categorize";
import { canonicalIngredientName } from "@/lib/ingredients/normalize";
import type { ItemKind } from "./types";

export type MatchRow = { id: number; name: string };
export type MatchLine = { name: string; raw?: string | null; kind?: ItemKind; list_match?: string | null };

/** Whole-phrase synonyms, applied to normalised text on both sides (longest first). */
const PHRASES: [string, string][] = [
  ["lady s finger", "okra"], ["ladys finger", "okra"], ["ladies finger", "okra"], ["lady finger", "okra"],
  ["tau kwa", "firm tofu"], ["taukwa", "firm tofu"], ["tau kua", "firm tofu"], ["taukua", "firm tofu"], ["pressed tofu", "firm tofu"],
  ["tau pok", "tofu puff"], ["taupok", "tofu puff"], ["tau hu", "tofu"], ["tauhu", "tofu"],
  ["chye sim", "choy sum"], ["chai sim", "choy sum"], ["cai xin", "choy sum"], ["caixin", "choy sum"],
  ["kailan", "kai lan"], ["gai lan", "kai lan"], ["chinese broccoli", "kai lan"],
  ["brinjal", "eggplant"], ["aubergine", "eggplant"],
  ["bell pepper", "capsicum"], ["sweet pepper", "capsicum"],
  ["green onion", "spring onion"], ["scallion", "spring onion"],
  ["coriander leaf", "coriander"], ["coriander leaves", "coriander"], ["chinese parsley", "coriander"], ["cilantro", "coriander"],
  ["zucchini", "courgette"], ["arugula", "rocket"], ["garbanzo", "chickpea"],
  ["egg white", "egg"], ["shrimp", "prawn"], ["kang kong", "kangkong"],
];

/** Till abbreviations, token by token. */
const ABBREV: Record<string, string> = {
  flt: "fillet", fil: "fillet", fllt: "fillet", filet: "fillet",
  chkn: "chicken", chk: "chicken", ckn: "chicken", chic: "chicken",
  brst: "breast", bst: "breast", thgh: "thigh",
  brocc: "broccoli", broc: "broccoli", brocolli: "broccoli",
  tom: "tomato", toms: "tomato", pot: "potato", pots: "potato", swt: "sweet", spr: "spring",
  onn: "onion", grn: "green", mush: "mushroom", mshrm: "mushroom", mushrm: "mushroom",
  veg: "vegetable", yog: "yogurt", yoghurt: "yogurt", yoghurts: "yogurt",
  cabb: "cabbage", carr: "carrot", cuc: "cucumber", cucum: "cucumber", capsi: "capsicum", avo: "avocado",
};

/** Words that say nothing about WHAT the item is: retailers, origin, grade, packaging. */
const NOISE = new Set([
  "cs", "ntuc", "fp", "fairprice", "finest", "xtra", "ss", "sheng", "siong", "cold", "storage", "giant", "lf", "little", "farms",
  "marketplace", "dfi", "donki", "mustafa", "redmart", "fresh", "organic", "premium", "imported", "local", "aust", "aus",
  "australian", "nz", "usa", "us", "japan", "japanese", "jpn", "thai", "msia", "malaysia", "china", "korea", "korean", "norway",
  "norwegian", "pack", "pk", "pkt", "pkts", "packet", "pcs", "pc", "piece", "each", "ea", "bag", "box", "tray", "btl", "bottle",
  "value", "house", "brand", "select", "choice", "pasture", "pastured", "free", "range", "cage", "grade", "large", "small",
  "medium", "big", "jumbo", "loose", "approx", "per", "kg", "g", "gm", "gms", "ml", "l", "ltr", "x", "s", "net", "wt",
  "the", "and", "with", "of", "a", "item", "items", "promo", "offer", "special",
]);

/** A line word the row lacks that makes the line a different product (vetoes containment). */
const DISTINCT = new Set([
  "spring", "sweet", "baby", "sauce", "paste", "powder", "oil", "juice", "stock", "broth", "flake", "seed", "milk", "cream",
  "chip", "cracker", "noodle", "bun", "bread", "cake", "ball", "snack", "bar", "drink", "tea", "jam", "candy", "chocolate",
  "dried", "canned", "smoked", "roasted", "kit", "kat", "puff", "skin", "wafer", "biscuit", "cookie", "ice",
]);

const SIZE_RE = /^(\d+(\.\d+)?(g|kg|gm|gms|ml|l|ltr|s|x|pcs|pc|pk|pkt)?|x\d+|\d+x\d+)$/;

export function matchTokens(text: string | null | undefined): string[] {
  let s = ` ${normalizeSearch(canonicalIngredientName(text ?? ""))} `;
  for (const [from, to] of PHRASES) s = s.split(` ${from} `).join(` ${to} `);
  const out: string[] = [];
  for (const raw of s.trim().split(/\s+/)) {
    if (!raw || SIZE_RE.test(raw)) continue;
    const t = singularize(ABBREV[raw] ?? raw);
    if (!t || NOISE.has(t) || NOISE.has(raw) || /^\d+$/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Same word, a one-letter typo ("corriander"), or a till prefix of 5+ letters ("brocc"). */
export function sameToken(a: string, b: string): boolean {
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = short === a ? b : a;
  if (short.length >= 5 && lev1(a, b)) return true;
  return short.length >= 5 && long.startsWith(short) && long.length - short.length <= 3;
}

function countShared(a: string[], b: string[]): number {
  const used = new Set<number>();
  let n = 0;
  for (const x of a) {
    const k = b.findIndex((y, i) => !used.has(i) && sameToken(x, y));
    if (k >= 0) { used.add(k); n++; }
  }
  return n;
}

/** 0..1 similarity between a receipt line's tokens and a row's tokens. */
export function scoreTokens(line: string[], row: string[]): number {
  if (line.length === 0 || row.length === 0) return 0;
  const shared = countShared(row, line);
  if (shared === 0) return 0;
  const lineHasAll = shared === row.length;
  const extra = line.filter((t) => !row.some((r) => sameToken(r, t)));
  if (lineHasAll && extra.length === 0 && line.length === row.length) return 1;
  if (lineHasAll && !extra.some((t) => DISTINCT.has(t))) return 0.85;
  const rowHasAll = countShared(line, row) === line.length;
  const rowExtra = row.filter((t) => !line.some((l) => sameToken(l, t)));
  if (rowHasAll && !rowExtra.some((t) => DISTINCT.has(t)) && !extra.some((t) => DISTINCT.has(t))) return 0.75;
  if (extra.some((t) => DISTINCT.has(t)) || rowExtra.some((t) => DISTINCT.has(t))) return 0;
  return (2 * shared) / (line.length + row.length);
}

const MIN_SCORE = 0.67;
const SHARE_SCORE = 0.85;

/** One grocery_list id (or null) per line, in line order. */
export function matchReceiptLines(lines: MatchLine[], rows: MatchRow[]): (number | null)[] {
  const result: (number | null)[] = lines.map(() => null);
  const rowTokens = rows.map((r) => matchTokens(r.name));
  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r.id]));
  const pairs: { li: number; ri: number; score: number }[] = [];

  lines.forEach((line, li) => {
    if (line.kind && line.kind !== "item") return;
    const hinted = line.list_match ? byName.get(line.list_match.trim().toLowerCase()) : undefined;
    if (hinted !== undefined) {
      pairs.push({ li, ri: rows.findIndex((r) => r.id === hinted), score: 1.1 });
      return;
    }
    const candidates = [matchTokens(line.name), matchTokens(line.raw ?? "")].filter((t) => t.length > 0);
    rows.forEach((_, ri) => {
      const score = Math.max(0, ...candidates.map((t) => scoreTokens(t, rowTokens[ri])));
      if (score >= MIN_SCORE) pairs.push({ li, ri, score });
    });
  });

  pairs.sort((a, b) => b.score - a.score || a.li - b.li);
  const rowTaken = new Set<number>();
  for (const p of pairs) {
    if (result[p.li] !== null || rowTaken.has(p.ri)) continue;
    result[p.li] = rows[p.ri].id;
    rowTaken.add(p.ri);
  }
  // Second pass: a strong line whose row was already claimed shares it.
  for (const p of pairs) {
    if (result[p.li] === null && p.score >= SHARE_SCORE) result[p.li] = rows[p.ri].id;
  }
  return result;
}
