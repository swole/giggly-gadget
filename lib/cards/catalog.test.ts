import { BUILTIN_CARDS, groupDigits, normaliseValue } from "./catalog";

describe("groupDigits", () => {
  it("groups in fours", () => {
    expect(groupDigits("78683054")).toBe("7868 3054");
    expect(groupDigits("92463867")).toBe("9246 3867");
  });
  it("leaves a short tail alone", () => {
    expect(groupDigits("123456789")).toBe("1234 5678 9");
  });
  it("passes non-numeric values through untouched", () => {
    expect(groupDigits("ABC-123")).toBe("123");
    expect(groupDigits("ABCDEF")).toBe("ABCDEF");
  });
});

describe("normaliseValue", () => {
  it("strips the spaces a human types", () => {
    expect(normaliseValue(" 9246 3867 ")).toBe("92463867");
  });
});

describe("built-in cards", () => {
  it("have unique ids", () => {
    const ids = BUILTIN_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The encoded value is what the scanner reads — a stray space or dash there
  // is a card that silently fails at the till.
  it("encode a clean scannable value whose display is just the pretty form", () => {
    for (const card of BUILTIN_CARDS) {
      expect(card.value).toMatch(/^[0-9]+$/);
      expect(card.value).toBe(normaliseValue(card.value));
      expect(card.display.replace(/\s/g, "")).toBe(card.value);
    }
  });

  it("still carry the numbers Johnny gave", () => {
    expect(BUILTIN_CARDS.find((c) => c.id === "yuu")?.value).toBe("78683054");
    expect(BUILTIN_CARDS.find((c) => c.id === "little-farms")?.value).toBe("92463867");
  });
});
