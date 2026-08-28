// Who is using the app on this device. Client-safe (no server imports).
//
// The app is an open URL; the role is a convenience, not a lock. It decides which
// tabs show, which controls are hidden, and who gets stamped on added_by /
// checked_by / cooked_by. Stored as an httpOnly cookie set by POST /api/role.

export const ROLES = ["johnny", "lydia", "helper"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_COOKIE = "gg_role";

export const ROLE_LABEL: Record<Role, string> = {
  johnny: "Johnny",
  lydia: "Lydia",
  helper: "Shallaine",
};

export const ROLE_GLYPH: Record<Role, string> = {
  johnny: "J",
  lydia: "L",
  helper: "S",
};

export function parseRole(v: string | null | undefined): Role | null {
  if (!v) return null;
  return (ROLES as readonly string[]).includes(v) ? (v as Role) : null;
}

/** Johnny and Lydia plan; the helper cooks and shops. */
export function isPlanner(role: Role | null): boolean {
  return role === "johnny" || role === "lydia";
}

export function labelFor(role: Role | null): string | null {
  return role ? ROLE_LABEL[role] : null;
}
