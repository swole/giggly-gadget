import { amount2dp, formatAmount, formatDollars, formatSgd, fromCents, parseSgd, sumCents, toCents } from "./money";

describe("toCents", () => {
  it("reads numbers and strings the way a receipt prints them", () => {
    expect(toCents(34.2)).toBe(3420);
    expect(toCents("34.2")).toBe(3420);
    expect(toCents("34.20")).toBe(3420);
    expect(toCents("S$1,234.50")).toBe(123450);
    expect(toCents("$ 8")).toBe(800);
    expect(toCents(".5")).toBe(50);
    expect(toCents("34.")).toBe(3400);
  });
  it("rounds half away from zero at the cent, even where floats lie", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents("2.675")).toBe(268);
    expect(toCents(0.1)! + toCents(0.2)!).toBe(30);
  });
  it("keeps the sign of discounts, ASCII or typographic", () => {
    expect(toCents("-2.00")).toBe(-200);
    expect(toCents("−2")).toBe(-200);
    expect(toCents(-2)).toBe(-200);
    expect(toCents("-0")).toBe(0);
  });
  it("returns null for anything that is not money", () => {
    expect(toCents("")).toBeNull();
    expect(toCents("abc")).toBeNull();
    expect(toCents("12.3.4")).toBeNull();
    expect(toCents(Number.NaN)).toBeNull();
    expect(toCents(Infinity)).toBeNull();
    expect(toCents(null)).toBeNull();
  });
});

describe("parseSgd", () => {
  it("accepts a positive amount up to the column limit", () => {
    expect(parseSgd("34.2")).toBe(3420);
    expect(parseSgd("999999.99")).toBe(99_999_999);
  });
  it("refuses zero, negatives and overflow", () => {
    expect(parseSgd("0")).toBeNull();
    expect(parseSgd("-5")).toBeNull();
    expect(parseSgd("1000000")).toBeNull();
    expect(parseSgd("")).toBeNull();
  });
});

describe("formatting", () => {
  it("prints S$ with grouping and a real minus", () => {
    expect(formatSgd(3420)).toBe("S$34.20");
    expect(formatSgd(123450)).toBe("S$1,234.50");
    expect(formatSgd(-200)).toBe("−S$2.00");
    expect(formatSgd(0)).toBe("S$0.00");
  });
  it("prints receipt lines without the currency", () => {
    expect(formatAmount(1890)).toBe("18.90");
    expect(formatAmount(-200)).toBe("−2.00");
    expect(formatAmount(5)).toBe("0.05");
  });
  it("writes the DB / CSV form with an ASCII minus and no grouping", () => {
    expect(amount2dp(3420)).toBe("34.20");
    expect(amount2dp(-200)).toBe("-2.00");
    expect(amount2dp(123450)).toBe("1234.50");
    expect(amount2dp(0)).toBe("0.00");
  });
  it("rounds to whole dollars for chart labels", () => {
    expect(formatDollars(11_849)).toBe("118");
    expect(formatDollars(123_450)).toBe("1,235");
  });
  it("fromCents is the plain dollar number", () => {
    expect(fromCents(3420)).toBe(34.2);
  });
});

describe("sumCents", () => {
  it("adds in integers and skips gaps", () => {
    expect(sumCents([1890, 345, -200, null, undefined])).toBe(2035);
    expect(sumCents([])).toBe(0);
  });
});
