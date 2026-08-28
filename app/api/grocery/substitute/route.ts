import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { categorize } from "@/lib/ingredients/categorize";
import { roleFromRequest } from "@/lib/role.server";

export const runtime = "nodejs";
export const maxDuration = 30;

// The shopper is standing at the stall — latency is the feature, and picking
// 2-3 swaps is a small task, so this uses Haiku rather than the extract model.
const MODEL = process.env.CLAUDE_SUBSTITUTE_MODEL ?? "claude-haiku-4-5-20251001";

const SubOptionsSchema = z.object({
  options: z
    .array(
      z.object({
        name: z.string().min(2).max(60).describe("The substitute ingredient, lower case, as it would appear on a shopping list"),
        why: z.string().min(3).max(90).describe("One plain-English phrase on fit, e.g. 'same quick-cooking green, slightly sweeter'"),
        qty_note: z.string().max(60).nullable().describe("Only if the amount should change, e.g. 'use about half'; else null"),
      }),
    )
    .min(1)
    .max(3),
});

type Body =
  | { id: number; action: "suggest" }
  | { id: number; action: "apply"; name: string };

/**
 * POST /api/grocery/substitute
 *   { id, action: "suggest" }        → { options: [{name, why, qty_note}] }
 *   { id, action: "apply", name }    → { row }  (renames the row; substituted_for keeps the
 *                                      original so rebuilds treat it as the same item)
 * Open to every role — this exists for the person doing the shopping.
 */
export async function POST(req: NextRequest) {
  if (!roleFromRequest(req)) {
    return NextResponse.json({ error: "Pick who you are first." }, { status: 403 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supa = supabaseAdmin();
  const { data: row, error } = await supa.from("grocery_list").select("*").eq("id", body.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "That item is no longer on the list" }, { status: 404 });

  if (body.action === "apply") {
    const name = (body.name ?? "").trim().toLowerCase().slice(0, 60);
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const { data: updated, error: uErr } = await supa
      .from("grocery_list")
      .update({
        name,
        substituted_for: row.substituted_for ?? row.name,
        category: categorize(name),
        checked: false,
      })
      .eq("id", body.id)
      .select("*")
      .single();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    return NextResponse.json({ row: updated });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server" }, { status: 503 });
  }

  // What the item is for, so the swap suits the dishes (kailan for a stir-fry ≠ for a soup).
  let dishes: string[] = [];
  if (Array.isArray(row.recipe_ids) && row.recipe_ids.length > 0) {
    const { data: recs } = await supa.from("recipes").select("title").in("id", row.recipe_ids.slice(0, 5));
    dishes = (recs ?? []).map((r: { title: string }) => r.title);
  }

  const qty = [row.qty_min, row.qty_max].filter((x) => x !== null).join("–");
  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  try {
    const msg = await client.messages.parse({
      model: MODEL,
      max_tokens: 700,
      system:
        "You suggest grocery substitutions for a household in Singapore shopping at a wet market and FairPrice. " +
        "Suggest items actually easy to find there. Stay true to how the ingredient behaves in the listed dishes " +
        "(texture, cooking time, flavour role). The household cooks heart-healthy: avoid swaps that add a lot of " +
        "sodium or saturated fat. Never suggest something already equivalent to another item likely in the same basket.",
      messages: [
        {
          role: "user",
          content: `The shopper can't find: ${qty ? qty + " " : ""}${row.unit ? row.unit + " " : ""}${row.name}${
            dishes.length ? `\nIt is for: ${dishes.join(" · ")}` : ""
          }\nGive the best 2-3 substitutes.`,
        },
      ],
      output_config: { format: zodOutputFormat(SubOptionsSchema) },
    });
    if (msg.stop_reason === "refusal" || !msg.parsed_output) {
      return NextResponse.json({ error: "Could not think of a good swap — ask Johnny or Lydia" }, { status: 502 });
    }
    return NextResponse.json(msg.parsed_output);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Suggestion failed: ${m}` }, { status: 502 });
  }
}
