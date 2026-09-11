import { extractIngredientTips } from "./recipe-tips";

const md = `An easy weeknight curry.

## Ingredients
- 300 g mackerel fillet, fresh, skin on
- 1 tbsp reduced-sodium light soy sauce
> 🐟 Buy fish and seafood fresh at the wet market.
> 🧂 Lower-salt version: reduced-sodium soy, no stock powder.

## Instructions
1. Fry the rempah.
> 💡 A quote in the method is not an ingredient tip.

## Notes
Protein 50 g / 34 g.
> 🍋 Nor is one in the notes.`;

describe("extractIngredientTips", () => {
  it("takes the quote lines from the ingredients section, with their emoji", () => {
    expect(extractIngredientTips(md)).toEqual([
      { icon: "🐟", text: "Buy fish and seafood fresh at the wet market." },
      { icon: "🧂", text: "Lower-salt version: reduced-sodium soy, no stock powder." },
    ]);
  });
  it("ignores quotes after the method header", () => {
    expect(extractIngredientTips(md).some((t) => t.text.includes("method"))).toBe(false);
    expect(extractIngredientTips(md).some((t) => t.text.includes("notes"))).toBe(false);
  });
  it("handles a tip with no emoji, no ingredients header, and empty input", () => {
    expect(extractIngredientTips("> Plain tip\n\n## Method\n1. Go")).toEqual([{ icon: null, text: "Plain tip" }]);
    expect(extractIngredientTips("")).toEqual([]);
    expect(extractIngredientTips(null)).toEqual([]);
    expect(extractIngredientTips("## Ingredients\n- 1 egg\n\n## Method\n1. Fry")).toEqual([]);
  });
});
