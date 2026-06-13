import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Debug endpoint: get a recipe's raw markdown body to investigate parsing issues
export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = url.searchParams.get("title");
  if (!title) return NextResponse.json({ error: "?title=... required" }, { status: 400 });

  const supa = supabaseAdmin();
  const { data } = await supa
    .from("recipes")
    .select("title, instructions_md")
    .ilike("title", `%${title}%`)
    .limit(1)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new Response(
    `=== ${data.title} ===\n\n${data.instructions_md}\n\n=== END ===`,
    { headers: { "content-type": "text/plain" } }
  );
}
