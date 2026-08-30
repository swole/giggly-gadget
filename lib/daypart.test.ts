import { daypartWord } from "./daypart";

describe("daypartWord", () => {
  test("morning is breakfast", () => {
    expect(daypartWord(5)).toBe("breakfast");
    expect(daypartWord(8)).toBe("breakfast");
    expect(daypartWord(10)).toBe("breakfast");
  });
  test("midday is lunch", () => {
    expect(daypartWord(11)).toBe("lunch");
    expect(daypartWord(14)).toBe("lunch");
  });
  test("afternoon through the small hours is dinner", () => {
    expect(daypartWord(15)).toBe("dinner");
    expect(daypartWord(19)).toBe("dinner");
    expect(daypartWord(23)).toBe("dinner");
    expect(daypartWord(2)).toBe("dinner");
  });
});
