// Fish and prawns are the household's sodium trap at the shop, not in the pan: shop-frozen
// seafood is routinely soaked in brine or sodium phosphate to hold water, which multiplies its
// sodium. The recipes now say "fresh"; this puts the same line where the buying decision
// happens. Saturday's shop covers the whole week, so the hint says what to do about that.

const SEAFOOD =
  /\b(fish|fillet|salmon|cod|mackerel|saba|sardines?|tuna|sea ?bass|seabass|snapper|grouper|barramundi|tilapia|pomfret|threadfin|batang|halibut|trout|kembung|selar|stingray|prawns?|shrimps?|squid|sotong|octopus|scallops?|clams?|mussels?|crabs?|lobster)\b/i;
const NOT_SEAFOOD = /\b(sauce|paste|stock|powder|ball|balls|cake|cakes|stick|sticks|floss|crackers?|ikan bilis|anchov|dried)\b/i;

/** The line to show under a seafood row on the shopping list, or null. */
export function freshSeafoodHint(name: string | null | undefined, category: string | null | undefined): string | null {
  const n = (name ?? "").toLowerCase();
  if (!n || NOT_SEAFOOD.test(n) || !SEAFOOD.test(n)) return null;
  if (category && !["protein", "other", "produce"].includes(category)) return null;
  return "Buy fresh. Freeze it at home if it is for later in the week.";
}
