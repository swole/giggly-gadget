"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/lib/role";

const RoleContext = createContext<Role | null>(null);

export function RoleProvider({ role, children }: { role: Role | null; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/** The role stored on this device, or null when no one has picked yet. */
export function useRole(): Role | null {
  return useContext(RoleContext);
}
