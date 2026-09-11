import { matchReceiptLines, matchTokens, sameToken, scoreTokens } from "./match";

const rows = [
  { id: 1, name: "broccoli" },
  { id: 2, name: "salmon" },
  { id: 3, name: "egg" },
  { id: 4, name: "firm tofu" },
  { id: 5, name: "lady's finger" },
  { id: 6, name: "onion" },
  { id: 7, name: "coriander" },
  { id: 8, name: "chicken breast" },
  { id: 9, name: "greek yogurt" },
];

const one = (raw: string, list = rows, extra: Partial<{ name: string; kind: "item" | "discount" | "fee"; list_match: string }> = {}) =>
  matchReceiptLines([{ raw, name: extra.name ?? raw, kind: extra.kind, list_match: extra.list_match }], list)[0];

describe("matchTokens", () => {
  it("drops retailer, grade and pack-size noise", () => {
    expect(matchTokens("CS FRESH BROCCOLI 300G")).toEqual(["broccoli"]);
    expect(matchTokens("EGGS PASTURE 10S")).toEqual(["egg"]);
    expect(matchTokens("SALMON FILLET 2X")).toEqual(["salmon", "fillet"]);
  });
  it("folds market names and till abbreviations onto list names", () => {
    expect(matchTokens("SS TAU KWA 2PCS")).toEqual(["firm", "tofu"]);
    expect(matchTokens("NZ CHKN BRST 500G")).toEqual(["chicken", "breast"]);
    expect(matchTokens("lady's finger")).toEqual(["okra"]);
  });
});

describe("sameToken", () => {
  it("forgives one-letter typos and till prefixes on longer words only", () => {
    expect(sameToken("corriander", "coriander")).toBe(true);
    expect(sameToken("brocc", "broccoli")).toBe(true);
    expect(sameToken("pear", "pearl")).toBe(false);
    expect(sameToken("beef", "beer")).toBe(false);
  });
});

describe("matchReceiptLines", () => {
  it("CS FRESH BROCCOLI 300G -> broccoli", () => expect(one("CS FRESH BROCCOLI 300G")).toBe(1));
  it("SALMON FILLET 2X -> salmon", () => expect(one("SALMON FILLET 2X")).toBe(2));
  it("EGGS PASTURE 10S -> egg", () => expect(one("EGGS PASTURE 10S")).toBe(3));
  it("SS TAU KWA 2PCS and FIRM TOFU 300G both buy firm tofu", () => {
    expect(
      matchReceiptLines(
        [
          { raw: "SS TAU KWA 2PCS", name: "SS TAU KWA 2PCS" },
          { raw: "FIRM TOFU 300G", name: "FIRM TOFU 300G" },
        ],
        rows,
      ),
    ).toEqual([4, 4]);
  });
  it("KIT KAT 4 FINGERS never ticks lady's finger", () => expect(one("KIT KAT 4 FINGERS")).toBeNull());
  it("SPRING ONION never ticks onion, but finds spring onion when it is on the list", () => {
    expect(one("SPRING ONION")).toBeNull();
    expect(one("SPRING ONION", [...rows, { id: 10, name: "spring onion" }])).toBe(10);
  });
  it("RED ONION 1KG -> onion (a colour is not a different product)", () => expect(one("RED ONION 1KG")).toBe(6));
  it("CORRIANDER LEAVES -> coriander", () => expect(one("CORRIANDER LEAVES")).toBe(7));
  it("NZ CHKN BRST 500G -> chicken breast", () => expect(one("NZ CHKN BRST 500G")).toBe(8));
  it("EGG NOODLES never ticks egg", () => expect(one("EGG NOODLES 400G")).toBeNull());
  it("a chicken thigh is not the chicken breast", () => expect(one("CHICKEN THIGH 500G")).toBeNull());
  it("discount and fee lines never match", () => {
    expect(one("MEMBER DISCOUNT", rows, { kind: "discount" })).toBeNull();
    expect(one("BAG CHARGE", rows, { kind: "fee" })).toBeNull();
  });
  it("the reader's list_match wins when it names a real row", () => {
    const list = [{ id: 20, name: "tomato" }, { id: 21, name: "cherry tomato" }];
    expect(one("TOMATO CHERRY 250G", list, { name: "tomato", list_match: "cherry tomato" })).toBe(21);
    expect(one("TOMATO 250G", list, { name: "tomato", list_match: "no such row" })).toBe(20);
  });
  it("uses the generic name when the till text is cryptic", () => {
    expect(one("GRK YGT 1KG", rows, { name: "greek yogurt" })).toBe(9);
  });
  it("one line per row before sharing: the stronger line keeps it", () => {
    const lines = [
      { raw: "BROCCOLI", name: "broccoli" },
      { raw: "BROCCOLI FLORETS FROZEN", name: "frozen broccoli florets" },
    ];
    expect(matchReceiptLines(lines, rows)[0]).toBe(1);
  });
});

describe("scoreTokens", () => {
  it("scores exact 1, containment 0.85, and vetoes a distinct product word", () => {
    expect(scoreTokens(["broccoli"], ["broccoli"])).toBe(1);
    expect(scoreTokens(["salmon", "fillet"], ["salmon"])).toBe(0.85);
    expect(scoreTokens(["spring", "onion"], ["onion"])).toBe(0);
  });
});
