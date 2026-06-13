import { NextRequest, NextResponse } from "next/server";
import { syncRecipesFromNotion } from "@/lib/notion-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const result = await syncRecipesFromNotion({ force });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
