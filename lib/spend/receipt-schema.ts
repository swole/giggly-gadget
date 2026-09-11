// What Claude returns for a receipt photo (POST /api/spend/read-receipt), and the prompt.
// Structured outputs take no .regex(), so spent_on is checked with isValidYmd afterwards.

import { z } from "zod";

export const ReceiptSchema = z.object({
  readable: z.boolean().describe("false when the photo is not a shop receipt or is too blurred to read"),
  merchant: z
    .string()
    .max(60)
    .nullable()
    .describe("The shop's name in Title Case, e.g. 'Cold Storage', 'FairPrice Finest', 'Sheng Siong', 'Little Farms'; null if not printed"),
  spent_on: z
    .string()
    .max(10)
    .nullable()
    .describe("Purchase date as YYYY-MM-DD; Singapore receipts print the day first (12/09/26 is 2026-09-12); null if not printed"),
  total: z.number().nullable().describe("What was actually paid in SGD after discounts and rounding, GST included; null if unreadable"),
  lines: z
    .array(
      z.object({
        raw: z.string().max(80).describe("The line's description as printed"),
        name: z
          .string()
          .max(60)
          .describe("What was bought, as a plain lower-case grocery name without brand, size or shop prefix: 'broccoli', 'salmon fillet', 'firm tofu', 'eggs'; 'discount' for a saving"),
        qty: z.string().max(24).nullable().describe("Pack size or count as printed, e.g. '300g', '2 x 1.50', '10s'; null if none"),
        amount: z.number().describe("The line's amount in SGD; negative for discounts, vouchers and member savings"),
        kind: z.enum(["item", "discount", "fee"]).describe("item = something bought; discount = a saving; fee = bag charge, rounding or service charge"),
        list_match: z
          .string()
          .max(60)
          .nullable()
          .describe("If this item is one of the shopping-list names provided, that name copied exactly; otherwise null"),
      }),
    )
    .max(80),
});

export type ReceiptOut = z.infer<typeof ReceiptSchema>;

export const RECEIPT_SYSTEM = `You read photos of Singapore grocery receipts (FairPrice, Cold Storage, Sheng Siong, Little Farms, Giant, Don Don Donki, or a wet-market stall's slip) for a household's shopping log. Transcribe what was bought and what was paid.

- lines: every purchased item in printed order, plus discounts as negative amounts and fees such as a bag charge or cash rounding. Leave out subtotal, total, GST-included, payment, card, change, points and balance lines.
- When one line covers several units ("2 x 1.50"), give the line total as the amount.
- A discount printed under an item is its own discount line.
- The lines should add up to the total. If part of the receipt is cut off, return what you can read and still give the printed total.
- name: a plain generic grocery name in lower case, singular where natural, without brand, pack size or the shop's own prefix. "CS FRESH BROCCOLI 300G" is broccoli; "SS TAU KWA 2PCS" is tau kwa.
- list_match: compare each item with the shopping list you are given and copy the list name exactly when it is the same food. Brand, size and variety differences are fine. Leave it null when nothing on the list is that item: a Kit Kat is never "lady's finger", spring onion is never "onion".
- If there are two photos, they are the top and bottom of one long receipt. Count any line that appears in both only once.`;

export function receiptUserText(listNames: string[], shopLabel: string, photos: number): string {
  const list = listNames.length ? listNames.map((n) => `- ${n}`).join("\n") : "(the list is empty)";
  return [
    `${photos === 2 ? "Two photos: the top and the bottom of one receipt." : "One photo of a receipt."} It is from the ${shopLabel.toLowerCase()} trip.`,
    "",
    "This week's shopping list:",
    list,
  ].join("\n");
}
