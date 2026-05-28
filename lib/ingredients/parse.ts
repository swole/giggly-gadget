import { categorize, type Category } from "./categorize";

export type ParsedIngredient = {
  raw: string;
  qty_min: number | null;
  qty_max: number | null;
  unit: string | null;
  name: string;
  modifier: string | null;
  optional: boolean;
  to_taste: boolean;
  scalable: boolean;
  category: Category;
};

// Canonical units. Keys are aliases, values are the canonical form.
const UNIT_MAP: Record<string, string> = {
  tbsp: "tbsp", tbsps: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", "t.": "tbsp",
  tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  cup: "cup", cups: "cup", c: "cup",
  g: "g", gram: "g", grams: "g", gr: "g",
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg",
  mg: "mg", milligram: "mg",
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can",
  jar: "jar", jars: "jar",
  bottle: "bottle", bottles: "bottle",
  slice: "slice", slices: "slice",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece",
  bunch: "bunch", bunches: "bunch",
  sprig: "sprig", sprigs: "sprig",
  stalk: "stalk", stalks: "stalk",
  pinch: "pinch", pinches: "pinch",
  dash: "dash", dashes: "dash",
  handful: "handful", handfuls: "handful",
};

const UNIT_REGEX_SOURCE = Object.keys(UNIT_MAP)
  .sort((a, b) => b.length - a.length) // longer aliases first so "tablespoon" beats "t"
  .map((u) => u.replace(/\./g, "\\."))
  .join("|");

const TO_TASTE_RE = /\b(to taste|as needed|as desired|for serving|for garnish)\b/i;
const OPTIONAL_RE = /\(optional\)|\boptional\b/i;
const RANGE_SEP_RE = /\s*(?:-|–|to)\s*/;
const FRACTION_UNICODE: Record<string, number> = {
  "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
  "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

function parseNumber(token: string): number | null {
  const t = token.trim();
  if (!t) return null;
  // unicode fraction alone (½) or mixed (1½)
  const uniMatch = t.match(/^(\d+)?\s*([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/);
  if (uniMatch) {
    const whole = uniMatch[1] ? parseInt(uniMatch[1], 10) : 0;
    return whole + FRACTION_UNICODE[uniMatch[2]];
  }
  // mixed fraction "1 1/2"
  const mixedMatch = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1], 10) + parseInt(mixedMatch[2], 10) / parseInt(mixedMatch[3], 10);
  }
  // plain fraction "1/2"
  const fracMatch = t.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10);
  }
  // decimal or integer
  const num = parseFloat(t);
  return Number.isFinite(num) ? num : null;
}

const QTY_TOKEN = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\\d+[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])";
const QTY_RANGE_RE = new RegExp(`^(${QTY_TOKEN})(?:${RANGE_SEP_RE.source}(${QTY_TOKEN}))?`, "i");
const UNIT_RE = new RegExp(`^(${UNIT_REGEX_SOURCE})\\b\\.?`, "i");
const PAREN_METRIC_RE = /\s*\(([^)]+)\)/;

export function parseIngredient(line: string): ParsedIngredient {
  const raw = line;
  // strip leading list markers
  let work = line.replace(/^[\s\-•*]+/, "").trim();

  const optional = OPTIONAL_RE.test(work);
  if (optional) work = work.replace(OPTIONAL_RE, "").trim().replace(/,$/, "").trim();

  // "salt, to taste" or "olive oil for serving"
  const toTaste = TO_TASTE_RE.test(work);
  if (toTaste) {
    const name = work.replace(TO_TASTE_RE, "").replace(/,\s*$/, "").trim();
    return {
      raw,
      qty_min: null, qty_max: null, unit: null,
      name: name || work,
      modifier: null,
      optional,
      to_taste: true,
      scalable: false,
      category: categorize(name || work),
    };
  }

  // strip parenthetical (e.g., "(120ml)" or "(about 2 cups)")
  // We prefer the metric inside if it gives us qty+unit and the leading part doesn't.
  let parenMetric: { qty: number; unit: string } | null = null;
  const parenMatch = work.match(PAREN_METRIC_RE);
  if (parenMatch) {
    const inside = parenMatch[1].trim();
    const innerQty = inside.match(QTY_RANGE_RE);
    if (innerQty) {
      const innerAfter = inside.slice(innerQty[0].length).trim();
      const innerUnit = innerAfter.match(UNIT_RE);
      if (innerUnit) {
        const num = parseNumber(innerQty[1]);
        if (num !== null) {
          parenMetric = { qty: num, unit: UNIT_MAP[innerUnit[1].toLowerCase().replace(/\.$/, "")] };
        }
      }
    }
    work = work.replace(PAREN_METRIC_RE, " ").replace(/\s{2,}/g, " ").trim();
  }

  const qtyMatch = work.match(QTY_RANGE_RE);
  let qty_min: number | null = null;
  let qty_max: number | null = null;
  if (qtyMatch) {
    qty_min = parseNumber(qtyMatch[1]);
    qty_max = qtyMatch[2] ? parseNumber(qtyMatch[2]) : null;
    work = work.slice(qtyMatch[0].length).trim();
  }

  let unit: string | null = null;
  const unitMatch = work.match(UNIT_RE);
  if (unitMatch) {
    unit = UNIT_MAP[unitMatch[1].toLowerCase().replace(/\.$/, "")];
    work = work.slice(unitMatch[0].length).trim();
  }

  // Prefer paren metric if we got qty but no unit and paren had both
  if (qty_min !== null && unit === null && parenMetric) {
    qty_min = parenMetric.qty;
    qty_max = null;
    unit = parenMetric.unit;
  }

  // Remainder is name [, modifier]
  let name = work;
  let modifier: string | null = null;
  const commaIdx = work.indexOf(",");
  if (commaIdx >= 0) {
    name = work.slice(0, commaIdx).trim();
    modifier = work.slice(commaIdx + 1).trim() || null;
  }
  name = name.replace(/\s+/g, " ").trim();

  // If we never parsed a qty and the line isn't to-taste, mark unscalable
  const scalable = qty_min !== null;

  return {
    raw,
    qty_min,
    qty_max,
    unit,
    name,
    modifier,
    optional,
    to_taste: false,
    scalable,
    category: categorize(name),
  };
}

export function parseIngredients(markdown: string): ParsedIngredient[] {
  // Take the section after the ingredients header up to the instructions header
  const ingHeader = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:🥣\s*)?ingredients\s*\n/i;
  const instHeader = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:👩‍🍳\s*|👨‍🍳\s*)?(?:instructions|method|directions|steps)\b/i;

  const ingStart = markdown.search(ingHeader);
  const block =
    ingStart >= 0 ? markdown.slice(ingStart).replace(ingHeader, "") : markdown;
  const instStart = block.search(instHeader);
  const ingredientBlock = instStart >= 0 ? block.slice(0, instStart) : block;

  return ingredientBlock
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-•*]\s+\S/.test(l))
    .map((line) => parseIngredient(line));
}
