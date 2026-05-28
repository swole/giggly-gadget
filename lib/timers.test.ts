import { detectTimers } from "./timers";

describe("detectTimers", () => {
  test("simmer 10 minutes", () => {
    const t = detectTimers("Simmer for 10 minutes until reduced.");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ raw: "10 minutes", seconds: 600 });
  });
  test("multiple", () => {
    const t = detectTimers("Sear 3 min, then braise 2 hours.");
    expect(t).toHaveLength(2);
    expect(t[0].seconds).toBe(180);
    expect(t[1].seconds).toBe(7200);
  });
  test("seconds and abbreviations", () => {
    const t = detectTimers("Bloom yeast 30s. Mix 5 m.");
    expect(t.map((x) => x.seconds)).toEqual([30, 300]);
  });
  test("ignores non-time mentions", () => {
    const t = detectTimers("Cut into 2 cm cubes.");
    expect(t).toHaveLength(0);
  });
  test("range 5-7 minutes — keeps the lower bound", () => {
    const t = detectTimers("Pan-fry 5-7 minutes.");
    expect(t).toHaveLength(1);
    expect(t[0].seconds).toBe(300); // 5 min
  });
});
