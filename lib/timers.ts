// Detect time durations in step text. Returns offsets + seconds so the UI can
// render an inline tappable <TimerChip> over the matched text.

export type DetectedTimer = {
  start: number;       // offset in the source string
  end: number;
  raw: string;         // matched substring
  seconds: number;
};

const TIME_RE = /(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;

const UNIT_SECONDS: Record<string, number> = {
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
};

export function detectTimers(text: string): DetectedTimer[] {
  const out: DetectedTimer[] = [];
  let m: RegExpExecArray | null;
  TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(text)) !== null) {
    const value = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const perUnit = UNIT_SECONDS[unit];
    if (!perUnit) continue;
    // Reject bare 'm' / 's' / 'h' if surrounded by non-time context (e.g., "1m wide")
    // Cheap heuristic: require >= 2 chars OR longer-form unit
    if (unit.length === 1 && value < 1) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      seconds: Math.round(value * perUnit),
    });
  }
  return out;
}
