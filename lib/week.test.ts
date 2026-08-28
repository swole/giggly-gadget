import {
  addDays,
  currentWeekMonday,
  formatDayLabel,
  formatWeekLabel,
  formatWeekRange,
  isValidYmd,
  isoDow,
  todayInTz,
  weekDates,
  weekMondayOf,
} from "./week";

describe("todayInTz", () => {
  test("Sunday 23:30 SGT is still Sunday in SG even though it is 15:30 UTC", () => {
    // 2026-08-23T15:30:00Z == 2026-08-23 23:30 SGT
    expect(todayInTz("Asia/Singapore", new Date("2026-08-23T15:30:00Z"))).toBe("2026-08-23");
  });
  test("Monday 07:00 SGT is Monday in SG although UTC is still Sunday 23:00", () => {
    // 2026-08-23T23:00:00Z == 2026-08-24 07:00 SGT
    expect(todayInTz("Asia/Singapore", new Date("2026-08-23T23:00:00Z"))).toBe("2026-08-24");
    expect(todayInTz("UTC", new Date("2026-08-23T23:00:00Z"))).toBe("2026-08-23");
  });
});

describe("weekMondayOf / currentWeekMonday", () => {
  test("Monday maps to itself", () => expect(weekMondayOf("2026-08-24")).toBe("2026-08-24"));
  test("Wednesday maps back to Monday", () => expect(weekMondayOf("2026-08-26")).toBe("2026-08-24"));
  test("Sunday maps back six days", () => expect(weekMondayOf("2026-08-30")).toBe("2026-08-24"));
  test("the old UTC bug: Mon 07:00 SGT is the NEW week", () => {
    expect(currentWeekMonday(new Date("2026-08-23T23:00:00Z"))).toBe("2026-08-24");
  });
  test("crosses month boundary", () => expect(weekMondayOf("2026-09-01")).toBe("2026-08-31"));
  test("crosses year boundary", () => expect(weekMondayOf("2027-01-02")).toBe("2026-12-28"));
});

describe("addDays / weekDates / isoDow", () => {
  test("addDays across a month end", () => expect(addDays("2026-08-30", 3)).toBe("2026-09-02"));
  test("negative addDays", () => expect(addDays("2026-09-01", -1)).toBe("2026-08-31"));
  test("weekDates returns Mon..Sun", () => {
    expect(weekDates("2026-08-24")).toEqual([
      "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30",
    ]);
  });
  test("isoDow Monday=0 Sunday=6", () => {
    expect(isoDow("2026-08-24")).toBe(0);
    expect(isoDow("2026-08-30")).toBe(6);
  });
});

describe("formatting", () => {
  test("formatWeekLabel", () => expect(formatWeekLabel("2026-08-24")).toBe("Aug 24"));
  test("formatDayLabel", () => expect(formatDayLabel("2026-08-24")).toBe("Mon 24"));
  test("formatWeekRange same month", () => expect(formatWeekRange("2026-08-24")).toBe("Aug 24 – 30"));
  test("formatWeekRange across months", () => expect(formatWeekRange("2026-08-31")).toBe("Aug 31 – Sep 6"));
});

describe("isValidYmd", () => {
  test("accepts real dates", () => expect(isValidYmd("2026-02-28")).toBe(true));
  test("rejects impossible dates", () => expect(isValidYmd("2026-02-30")).toBe(false));
  test("rejects garbage", () => {
    expect(isValidYmd("24-08-2026")).toBe(false);
    expect(isValidYmd("")).toBe(false);
    expect(isValidYmd(undefined)).toBe(false);
  });
});
