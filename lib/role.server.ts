// Server-only role helpers. Never import from a client component.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { ROLE_COOKIE, parseRole, type Role } from "./role";

/** Role for the current request, from the gg_role cookie (Server Components, layouts, route handlers). */
export async function getRole(): Promise<Role | null> {
  const store = await cookies();
  return parseRole(store.get(ROLE_COOKIE)?.value);
}

/** Same, but from a NextRequest (handy inside route handlers that already hold the request). */
export function roleFromRequest(req: NextRequest): Role | null {
  return parseRole(req.cookies.get(ROLE_COOKIE)?.value);
}


/** 403 unless the request carries a planner role cookie (Johnny / Lydia). Null when allowed. */
export function plannerGate(req: NextRequest): NextResponse | null {
  const role = roleFromRequest(req);
  if (role === "johnny" || role === "lydia") return null;
  return NextResponse.json({ error: "Only Johnny and Lydia can do that. Switch person from the bar below." }, { status: 403 });
}

/**
 * Maintenance routes (bulk re-sync, wipe images, recategorise …) are not for phones: they need
 * `?secret=<CRON_SECRET>` or `Authorization: Bearer <CRON_SECRET>`. Denied outright when the secret is unset.
 */
export function secretGate(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const q = req.nextUrl.searchParams.get("secret") ?? "";
  if (bearer === secret || q === secret) return null;
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
