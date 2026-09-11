import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { roleFromRequest } from "@/lib/role.server";
import { labelFor } from "@/lib/role";
import { isValidYmd, weekMondayOf } from "@/lib/week";
import { formatSgd, sumCents, toCents } from "@/lib/money";
import { linesDisagree } from "@/lib/spend/summary";
import { isMissingTable } from "@/lib/spend/queries";
import { RECEIPT_SYSTEM, ReceiptSchema, receiptUserText } from "@/lib/spend/receipt-schema";
import { parseItemKind, parseSpendShop, SPEND_SHOP_LABEL, type ReceiptLine, type ReceiptRead } from "@/lib/spend/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Reading till print is a vision task where a wrong digit costs money; Sonnet reads it well
// in 10-30 s at about US$0.04 a receipt. Override with CLAUDE_RECEIPT_MODEL.
const MODEL = process.env.CLAUDE_RECEIPT_MODEL ?? "claude-sonnet-5";
const MAX_PHOTO_B64 = 2_400_000; // one 2200px JPEG at 0.8 is 0.6-1.5 MB of base64
const MAX_TOTAL_B64 = 3_800_000; // stays under Vercel's 4.5 MB request cap with JSON overhead
const DAILY_CAP = 12;
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type Photo = { media_type: (typeof TYPES)[number]; data_base64: string };

/**
 * POST /api/spend/read-receipt { photos: [{ media_type, data_base64 }] (1-2), week_of, shop }
 *   -> { receipt: ReceiptRead }
 * Any role (the helper is the one at the till). The photo is read and dropped: nothing is
 * stored except a row in receipt_reads for the daily cap.
 */
export async function POST(req: NextRequest) {
  const role = roleFromRequest(req);
  if (!role) return NextResponse.json({ error: "Pick who you are first." }, { status: 403 });
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server" }, { status: 503 });

  let body: { photos?: Photo[]; week_of?: string; shop?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (photos.length < 1 || photos.length > 2) return NextResponse.json({ error: "Send one or two photos." }, { status: 400 });
  let total = 0;
  for (const p of photos) {
    if (!TYPES.includes(p?.media_type) || typeof p.data_base64 !== "string" || p.data_base64.length > MAX_PHOTO_B64) {
      return NextResponse.json({ error: "That photo is too big or not a picture. Take it again." }, { status: 400 });
    }
    total += p.data_base64.length;
  }
  if (total > MAX_TOTAL_B64) return NextResponse.json({ error: "Those photos are too big together. Try one photo." }, { status: 400 });
  const shop = parseSpendShop(body.shop) ?? "supermarket";
  const week = isValidYmd(body.week_of) ? weekMondayOf(body.week_of) : null;

  const supa = supabaseAdmin();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: capErr } = await supa.from("receipt_reads").select("id", { count: "exact", head: true }).gte("read_at", since);
  if (!capErr && (count ?? 0) >= DAILY_CAP) {
    return NextResponse.json({ error: `That is ${DAILY_CAP} receipts today. Type the total instead.` }, { status: 429 });
  }
  if (capErr && !isMissingTable(capErr)) return NextResponse.json({ error: capErr.message }, { status: 500 });

  // The list names let the reader say which line is which list item.
  let listNames: string[] = [];
  if (week) {
    const { data } = await supa.from("grocery_list").select("name").eq("week_of", week);
    listNames = [...new Set((data ?? []).map((r: { name: string }) => r.name))].sort();
  }
  const listSet = new Set(listNames.map((n) => n.toLowerCase()));

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  let parsed;
  try {
    const msg = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: RECEIPT_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            ...photos.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.media_type, data: p.data_base64 } })),
            { type: "text" as const, text: receiptUserText(listNames, SPEND_SHOP_LABEL[shop], photos.length) },
          ],
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(ReceiptSchema) },
    });
    if (msg.stop_reason === "refusal") return NextResponse.json({ error: "Could not read that receipt. Type the total instead." }, { status: 422 });
    parsed = msg.parsed_output;
  } catch (e) {
    await supa.from("receipt_reads").insert({ read_by: labelFor(role), ok: false });
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Reading failed (${m}). Try again, or type the total.` }, { status: 502 });
  }
  await supa.from("receipt_reads").insert({ read_by: labelFor(role), ok: !!parsed?.readable });
  if (!parsed) return NextResponse.json({ error: "Could not read that receipt. Type the total instead." }, { status: 502 });
  if (!parsed.readable) {
    return NextResponse.json({ error: "That does not look like a receipt. Take the photo again with the whole receipt in view, or type the total." }, { status: 422 });
  }

  const lines: ReceiptLine[] = [];
  for (const l of parsed.lines) {
    const cents = toCents(l.amount);
    if (cents === null || cents === 0) continue;
    const kind = parseItemKind(l.kind);
    lines.push({
      raw: l.raw.trim(),
      name: (l.name || l.raw).trim().toLowerCase(),
      qty: l.qty?.trim() || null,
      amount_cents: kind === "discount" ? -Math.abs(cents) : cents,
      kind,
      list_match: l.list_match && listSet.has(l.list_match.trim().toLowerCase()) ? l.list_match.trim().toLowerCase() : null,
    });
  }
  const totalCents = toCents(parsed.total);
  const receipt: ReceiptRead = {
    merchant: parsed.merchant?.trim() || null,
    spent_on: isValidYmd(parsed.spent_on) ? parsed.spent_on : null,
    total_cents: totalCents !== null && totalCents > 0 ? totalCents : null,
    lines,
    warnings: [],
  };
  const sum = sumCents(lines.map((l) => l.amount_cents));
  if (receipt.total_cents === null) receipt.warnings.push("Could not read the total. Type it in.");
  else if (lines.length && linesDisagree(sum, receipt.total_cents)) {
    receipt.warnings.push(`The lines add up to ${formatSgd(sum)} and the receipt says ${formatSgd(receipt.total_cents)}. A line may be missing.`);
  }
  if (!receipt.spent_on) receipt.warnings.push("Could not read the date. Check it.");
  return NextResponse.json({ receipt });
}
