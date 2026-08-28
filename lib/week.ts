// Date helpers. Every "today" / "this week" decision in the app goes through here.
//
// Vercel runs in UTC; the household lives in Singapore (UTC+8). Anything built on
// `new Date().getDay()` flips to the previous week between 00:00 and 08:00 SGT on
// Mondays, and `toISOString()` dates a 7am breakfast as yesterday. So: resolve
// "today" in APP_TZ once, then do all arithmetic on YYYY-MM-DD strings via Date.UTC.

export const APP_TZ = "Asia/Singapore";

export type Ymd = string; // "YYYY-MM-DD"

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(s: string | null | undefined): s is Ymd {
  if (!s || !YMD_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's calendar date in `tz` (default Asia/Singapore), regardless of server TZ. */
export function todayInTz(tz: string = APP_TZ, now: Date = new Date()): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtc(ymd: Ymd): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt: Date): Ymd {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDays(ymd: Ymd, n: number): Ymd {
  const dt = toUtc(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

/** Monday of the ISO week containing `ymd`. */
export function weekMondayOf(ymd: Ymd): Ymd {
  const dt = toUtc(ymd);
  const dow = dt.getUTCDay(); // 0 = Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return fromUtc(dt);
}

/** Monday of the current week in APP_TZ. */
export function currentWeekMonday(now: Date = new Date()): Ymd {
  return weekMondayOf(todayInTz(APP_TZ, now));
}

/** The seven dates Mon..Sun of the week starting at `monday`. */
export function weekDates(monday: Ymd): Ymd[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 0 = Monday … 6 = Sunday */
export function isoDow(ymd: Ymd): number {
  const dow = toUtc(ymd).getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 24" */
export function formatWeekLabel(ymd: Ymd): string {
  const dt = toUtc(ymd);
  return `${MONTH_SHORT[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

/** "Mon 24" */
export function formatDayLabel(ymd: Ymd): string {
  return `${DAY_SHORT[isoDow(ymd)]} ${toUtc(ymd).getUTCDate()}`;
}

/** "Monday 24 Aug" */
export function formatDayLong(ymd: Ymd): string {
  const dt = toUtc(ymd);
  return `${DAY_LONG[isoDow(ymd)]} ${dt.getUTCDate()} ${MONTH_SHORT[dt.getUTCMonth()]}`;
}

/** "Aug 24 – 30" or "Aug 31 – Sep 6" */
export function formatWeekRange(monday: Ymd): string {
  const sun = addDays(monday, 6);
  const a = toUtc(monday);
  const b = toUtc(sun);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${MONTH_SHORT[a.getUTCMonth()]} ${a.getUTCDate()} – ${b.getUTCDate()}`;
  }
  return `${formatWeekLabel(monday)} – ${formatWeekLabel(sun)}`;
}
