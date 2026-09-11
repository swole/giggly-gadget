// Tips that belong with the ingredients: callout or quote blocks sitting inside the
// Ingredients section of the Notion body. The sodium pass writes two of them (how to buy the
// fish, what was changed to cut the salt), and the ingredient parser skips anything that is
// not a bullet, so they never reach the shopping list. Pure, so it is unit-tested.

export type RecipeTip = { icon: string | null; text: string };

const ING_HEADER = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:🥣\s*)?ingredients\s*\n/i;
const METHOD_HEADER = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:👩‍🍳\s*|👨‍🍳\s*)?(?:instructions|method|directions|steps)\b/i;
const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)\s*/u;

export function extractIngredientTips(markdown: string | null | undefined): RecipeTip[] {
  if (!markdown) return [];
  const start = markdown.search(ING_HEADER);
  const block = start >= 0 ? markdown.slice(start).replace(ING_HEADER, "") : markdown;
  const end = block.search(METHOD_HEADER);
  const section = end >= 0 ? block.slice(0, end) : block;

  const tips: RecipeTip[] = [];
  for (const line of section.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith(">")) continue;
    const body = t.replace(/^>\s?/, "").trim();
    if (!body) continue;
    const m = LEADING_EMOJI.exec(body);
    const text = (m ? body.slice(m[0].length) : body).trim();
    if (text) tips.push({ icon: m ? m[1] : null, text });
  }
  return tips;
}
