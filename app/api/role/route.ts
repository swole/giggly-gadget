import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ROLE_COOKIE, parseRole } from "@/lib/role";

export const runtime = "nodejs";

// 400 days: Chrome's cap on cookie lifetime. Server-set cookies also survive Safari ITP,
// which would expire a script-written cookie after 7 days.
const MAX_AGE = 400 * 24 * 60 * 60;

export async function POST(req: NextRequest) {
  let body: { role?: string };
  try {
    body = (await req.json()) as { role?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const role = parseRole(body.role);
  if (!role) return NextResponse.json({ error: "unknown role" }, { status: 400 });

  const store = await cookies();
  store.set(ROLE_COOKIE, role, {
    maxAge: MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true, role });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(ROLE_COOKIE);
  return NextResponse.json({ ok: true });
}
