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

/**
 * A payment or web link rather than a member number. Links are QR only: a
 * whole URL as Code 128 comes out too fine to scan at phone width, and a
 * second code on screen only gives the scanner a bad target to lock onto.
 */
export function isLink(value: string): boolean {
  return /^https?:\/\//i.test(value);
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
  {
    id: "return-right",
    name: "Return Right",
    where: "Bottle and can machines, 10¢ back each",
    label: "Refunds to",
    // Decoded from the QR on the PayLah! app's "My QR Code" screen. The ref is
    // sK + lowercase L; the caption under that QR makes it look like a capital I.
    value: "https://www.dbs.com.sg/personal/mobile/paylink/index.html?tranRef=sKlFn1mnfl",
    display: "PayLah!",
    primary: "qr",
    accent: "#da291c",
    accentInk: "#ffffff",
    note: "Scans the same as the QR in the PayLah! app. Refunds go to Johnny's wallet.",
    builtin: true,
  },
];
