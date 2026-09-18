import { BUILTIN_CARDS, groupDigits, isLink, normaliseValue } from "./catalog";

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

describe("isLink", () => {
  it("tells a payment link from a member number", () => {
    expect(isLink("https://www.dbs.com.sg/personal/mobile/paylink/index.html?tranRef=x")).toBe(true);
    expect(isLink("78683054")).toBe(false);
  });
});

describe("built-in cards", () => {
  it("have unique ids", () => {
    const ids = BUILTIN_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The encoded value is what the scanner reads — a stray space or dash there
  // is a card that silently fails at the till.
  it("encode a clean scannable value", () => {
    for (const card of BUILTIN_CARDS) {
      expect(card.value).toBe(normaliseValue(card.value));
    }
  });

  it("show a member number as just its pretty form", () => {
    for (const card of BUILTIN_CARDS.filter((c) => !isLink(c.value))) {
      expect(card.value).toMatch(/^[0-9]+$/);
      expect(card.display.replace(/\s/g, "")).toBe(card.value);
    }
  });

  it("still carry the numbers Johnny gave", () => {
    expect(BUILTIN_CARDS.find((c) => c.id === "yuu")?.value).toBe("78683054");
    expect(BUILTIN_CARDS.find((c) => c.id === "little-farms")?.value).toBe("92463867");
    // Decoded from the PayLah! app's own QR: lowercase L after "sK".
    expect(BUILTIN_CARDS.find((c) => c.id === "return-right")?.value).toBe(
      "https://www.dbs.com.sg/personal/mobile/paylink/index.html?tranRef=sKlFn1mnfl",
    );
  });
});
