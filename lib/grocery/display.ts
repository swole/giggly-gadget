// The shopping list is a buying document, not a lab sheet. The math layer keeps
// exact recipe quantities; this layer translates them into things a person can
// actually buy at a Singapore wet market or FairPrice — whole vegetables, bunches,
// heads, full packs — with the exact figure preserved as a sub-note.
//
// Display-time only: nothing here touches stored rows, reconcile keys or scaling.

import { renderQty } from "@/lib/scale";

export type DisplayRow = {
  /** Quantity text for the fixed gutter, e.g. "1½", "2", "" (unquantified). */
  qty: string;
  /** Unit for the gutter, already pluralized: "g", "packs", "heads", null. */
  unit: string | null;
  /** The item name to show. */
  name: string;
  /** Sub-note with the exact recipe math or the either-or alternative. */
  note: string | null;
};

type RowInput = {
  name: string;
  qty_min: number | null;
  qty_max: number | null;
  unit: string | null;
  category: string | null;
};

// Units where a fraction cannot be bought — you get the whole pack/can/piece.
const DISCRETE_UNITS = new Set([
  "pack", "can", "jar", "bottle", "slice", "piece", "bunch", "sprig", "stalk", "clove",
]);

// Pseudo-units the parser leaves inside the name ("1.2 packs fresh yakisoba noodles"
// has qty 1.2, no unit, name "packs fresh yakisoba noodles").
const PSEUDO_UNIT_RE = /^(packs?|heads?|blocks?|sheets?|knobs?|tins?|tubs?|punnets?)\s+(.+)$/;

// "grated ginger" as a row makes the shopper hunt for pre-grated ginger. Show the
// buyable thing and keep the prep as the note.
const PREP_RE = /^(grated|minced|finely grated|finely minced|shredded|julienned|ground)\s+(.+)$/;

// Whole-vegetable count rows round up (you buy 3 onions, not 2¼).
const isCount = (unit: string | null) => unit === null || unit === "";

const NON_PLURAL_ENDINGS = /(s|ss|ish|choy|sum|lan|corn|garlic|broccoli|kale|cabbage|spinach)$/i;
const IRREGULAR_PLURAL: Record<string, string> = {
  tomato: "tomatoes", potato: "potatoes", chilli: "chillies", chili: "chilies", leaf: "leaves",
};
function pluralizeName(name: string, qty: number): string {
  if (qty <= 1) return name;
  const words = name.split(" ");
  const last = words[words.length - 1];
  const lower = last.toLowerCase();
  if (IRREGULAR_PLURAL[lower]) {
    words[words.length - 1] = IRREGULAR_PLURAL[lower];
    return words.join(" ");
  }
  if (NON_PLURAL_ENDINGS.test(last)) return name;
  words[words.length - 1] = last + "s";
  return words.join(" ");
}

// Word units pluralize ("2 packs"); measurement abbreviations never do ("200 g").
const PLURALIZABLE_UNITS = new Set([
  "cup", "pack", "can", "jar", "bottle", "slice", "piece", "bunch", "sprig", "stalk",
  "clove", "head", "handful", "knob", "block", "sheet", "tin", "tub", "punnet",
]);
function pluralizeUnit(unit: string, qty: number): string {
  if (qty <= 1 || !PLURALIZABLE_UNITS.has(unit)) return unit;
  return /(ch|sh|s|x)$/.test(unit) ? unit + "es" : unit + "s";
}

const fmt = (min: number, max: number | null) =>
  max === null || max === min ? renderQty(min) : `${renderQty(min)}–${renderQty(max)}`;

export function displayGroceryRow(row: RowInput): DisplayRow {
  let name = row.name;
  let unit = row.unit;
  let qtyMin = row.qty_min;
  let qtyMax = row.qty_max;
  let note: string | null = null;

  // "leek or scallion" — the shopper buys one thing; the alternative is a note.
  const orMatch = name.split(/\s+or\s+/);
  if (orMatch.length === 2 && !/\b(more|less)\b/.test(name)) {
    name = orMatch[0].trim();
    note = `or ${orMatch[1].trim()}`;
  }

  // Pseudo-unit stuck in the name: promote it to the unit slot.
  if (isCount(unit) && qtyMin !== null) {
    const m = name.match(PSEUDO_UNIT_RE);
    if (m) {
      unit = m[1].replace(/s$/, "");
      name = m[2];
    }
  }

  // Prep-participle produce: show the vegetable, keep the prep as the note.
  const prep = name.match(PREP_RE);
  if (prep && qtyMin !== null && (isCount(unit) || ["tsp", "tbsp", "cup"].includes(unit ?? ""))) {
    const amount = unit ? `${fmt(qtyMin, qtyMax)} ${unit}` : fmt(qtyMin, qtyMax);
    note = note ? `${amount} ${prep[1]} · ${note}` : `${amount} ${prep[1]}`;
    return { qty: "", unit: null, name: prep[2], note };
  }

  if (qtyMin === null) return { qty: "", unit, name, note };

  // Garlic by the clove reads as a riddle at the stall — translate to heads.
  if (unit === "clove" && /garlic/.test(name) && qtyMin >= 8) {
    const heads = Math.ceil(qtyMin / 11);
    const maxHeads = qtyMax !== null ? Math.ceil(qtyMax / 11) : null;
    note = joinNote(`${fmt(qtyMin, qtyMax)} cloves`, note);
    return {
      qty: fmt(heads, maxHeads !== null && maxHeads !== heads ? maxHeads : null),
      unit: pluralizeUnit("head", Math.max(heads, maxHeads ?? 0)),
      name,
      note,
    };
  }

  // Spring onions by the dozen come in bunches.
  if (isCount(unit) && /^spring onions?$/.test(name) && qtyMin >= 6) {
    const bunches = Math.ceil(qtyMin / 8);
    note = joinNote(`about ${fmt(qtyMin, qtyMax)} stalks`, note);
    return { qty: renderQty(bunches), unit: pluralizeUnit("bunch", bunches), name, note };
  }

  // Discrete units and whole-vegetable counts: round up, keep the math as a note.
  const discrete = (unit !== null && DISCRETE_UNITS.has(unit)) || isCount(unit);
  const fractional = qtyMin % 1 !== 0 || (qtyMax !== null && qtyMax % 1 !== 0);
  if (discrete && fractional) {
    const upMin = Math.ceil(qtyMin);
    const upMax = qtyMax !== null ? Math.ceil(qtyMax) : null;
    note = joinNote(`recipes need ${fmt(qtyMin, qtyMax)}`, note);
    const shown = upMax !== null && upMax !== upMin ? `${upMin}–${upMax}` : `${upMin}`;
    return {
      qty: shown,
      unit: unit ? pluralizeUnit(unit, upMax ?? upMin) : null,
      name: isCount(unit) ? pluralizeName(name, upMax ?? upMin) : name,
      note,
    };
  }

  return {
    qty: fmt(qtyMin, qtyMax),
    unit: unit ? pluralizeUnit(unit, qtyMax ?? qtyMin) : null,
    name: isCount(unit) ? pluralizeName(name, qtyMax ?? qtyMin) : name,
    note,
  };
}

function joinNote(first: string, rest: string | null): string {
  return rest ? `${first} · ${rest}` : first;
}
