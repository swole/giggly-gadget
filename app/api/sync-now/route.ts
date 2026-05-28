import { NextResponse } from "next/server";
import { syncRecipesFromNotion } from "@/lib/notion-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncRecipesFromNotion();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Allow GET for quick browser-based triggering during development
  return POST();
}
