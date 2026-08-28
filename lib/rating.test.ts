import { isValidRating, NOTION_RATING_OPTIONS, parseNotionRating, toNotionRatingName } from "./rating";

describe("isValidRating", () => {
  it("accepts 0 (clear) and 1–5 in half steps", () => {
    for (const v of [0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) expect(isValidRating(v)).toBe(true);
  });
  it("rejects everything else", () => {
    for (const v of [0.5, 5.5, 3.25, -1, 6, NaN, Infinity]) expect(isValidRating(v)).toBe(false);
  });
});

describe("toNotionRatingName", () => {
  it("whole stars", () => {
    expect(toNotionRatingName(1)).toBe("⭐");
    expect(toNotionRatingName(5)).toBe("⭐⭐⭐⭐⭐");
  });
  it("half stars append ½", () => {
    expect(toNotionRatingName(1.5)).toBe("⭐½");
    expect(toNotionRatingName(3.5)).toBe("⭐⭐⭐½");
    expect(toNotionRatingName(4.5)).toBe("⭐⭐⭐⭐½");
  });
  it("clear / invalid → null", () => {
    expect(toNotionRatingName(0)).toBeNull();
    expect(toNotionRatingName(3.25)).toBeNull();
  });
});

describe("parseNotionRating", () => {
  it("round-trips every option", () => {
    let v = 1;
    for (const name of NOTION_RATING_OPTIONS) {
      expect(parseNotionRating(name)).toBe(v);
      v += 0.5;
    }
  });
  it("reads legacy ★ names and null", () => {
    expect(parseNotionRating("★★★★")).toBe(4);
    expect(parseNotionRating(null)).toBeNull();
    expect(parseNotionRating("unrated")).toBeNull();
  });
});
