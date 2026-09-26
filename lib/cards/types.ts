// Membership / loyalty cards shown at the till (see components/cards).
// Built-ins live in `lib/cards/catalog.ts`; anything Johnny adds on a phone is
// stored per-device in localStorage — there is no account to sync them to.

/** Which representation gets the hero slot on the scan screen. */
export type PrimaryCode = "qr" | "barcode" | "number";

export type MemberCard = {
  id: string;
  /** Programme name, e.g. "yuu Rewards Club". */
  name: string;
  /** Where it is accepted — one short line under the name. */
  where: string;
  /** What the value is called on the card, e.g. "yuu ID". */
  label: string;
  /** Raw value that gets encoded. Digits only for phone/member numbers. */
  value: string;
  /**
   * What the QR carries when the programme's own QR is more than the bare value
   * (yuu's wraps the ID in a member link). Copy and the number on screen stay on `value`.
   */
  qr?: string;
  /** How the value reads to a human — grouped for the cashier. */
  display: string;
  primary: PrimaryCode;
  /** Brand colour for the spine and the chip. */
  accent: string;
  /** Ink on top of `accent`. */
  accentInk: string;
  /** Optional caveat shown under the codes. */
  note?: string;
  /** Built-ins cannot be deleted, only hidden. */
  builtin?: boolean;
};
