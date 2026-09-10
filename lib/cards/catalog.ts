import type { MemberCard } from "./types";

/** Group a digit string into readable chunks: "78683054" → "7868 3054". */
export function groupDigits(value: string, size = 4): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  const out: string[] = [];
  for (let i = 0; i < digits.length; i += size) out.push(digits.slice(i, i + size));
  return out.join(" ");
}

/** Strip everything a scanner would choke on. Phone numbers keep digits only. */
export function normaliseValue(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

export const BUILTIN_CARDS: MemberCard[] = [
  {
    id: "yuu",
    name: "yuu Rewards Club",
    where: "Cold Storage · Giant · CS Fresh · Guardian · 7-Eleven",
    label: "yuu ID",
    value: "78683054",
    display: "7868 3054",
    primary: "qr",
    accent: "#2b6fe0",
    accentInk: "#ffffff",
    note: "Generated from the yuu ID. If the till rejects it, tap “Use a photo” and snap the code in the yuu app.",
    builtin: true,
  },
  {
    id: "little-farms",
    name: "Little Farms",
    where: "Tanglin · Katong · Holland V · One Holland · Valley Point",
    label: "Mobile number",
    value: "92463867",
    display: "9246 3867",
    primary: "number",
    accent: "#3f7a4a",
    accentInk: "#ffffff",
    note: "Little Farms looks the account up by phone number — read it out or let them key it in.",
    builtin: true,
  },
];
