"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLE_LABEL, isPlanner } from "@/lib/role";
import { useRole } from "@/components/role/RoleProvider";
import { RoleSheet } from "@/components/role/RolePicker";
import { BasketIcon, BookIcon, CalendarIcon, PlusIcon, SkilletIcon } from "@/components/icons";

type Tab = { href: string; label: string; icon: (p: { size?: number; className?: string }) => React.ReactNode; match: (p: string) => boolean };

const KITCHEN: Tab = { href: "/", label: "Kitchen", icon: SkilletIcon, match: (p) => p === "/" || p.startsWith("/kitchen") };
const PLAN: Tab = { href: "/plan", label: "Plan", icon: CalendarIcon, match: (p) => p.startsWith("/plan") };
const GROCERY: Tab = { href: "/grocery", label: "Grocery", icon: BasketIcon, match: (p) => p.startsWith("/grocery") };
const RECIPES: Tab = { href: "/recipes", label: "Recipes", icon: BookIcon, match: (p) => p.startsWith("/recipes") };
const ADD: Tab = { href: "/add", label: "Add", icon: PlusIcon, match: (p) => p.startsWith("/add") };

export function TabBar() {
  const role = useRole();
  const pathname = usePathname() ?? "/";
  const [switching, setSwitching] = useState(false);

  // Cook mode is full-screen; no chrome. No bar until a role is chosen either.
  if (!role) return null;
  if (/^\/recipes\/[^/]+\/cook/.test(pathname)) return null;

  const tabs = isPlanner(role) ? [KITCHEN, PLAN, GROCERY, RECIPES, ADD] : [KITCHEN, GROCERY, RECIPES];

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-line)]/70 bg-[var(--color-card)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-card)]/85 print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-2xl items-stretch justify-between px-2">
          {tabs.map((t) => {
            const active = t.match(pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] uppercase tracking-[0.05em] transition-colors ${
                  active ? "text-[var(--color-terra)]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                <span className={active ? "" : "opacity-80"} aria-hidden>
                  {t.icon({ size: 20 })}
                </span>
                <span className={active ? "font-semibold" : ""}>{t.label}</span>
                <span
                  className={`mt-0.5 h-0.5 w-6 rounded-full ${active ? "bg-[var(--color-terra)]" : "bg-transparent"}`}
                  aria-hidden
                />
              </Link>
            );
          })}
          <button
            onClick={() => setSwitching(true)}
            className="flex flex-col items-center gap-1 px-2 py-2 text-[11px] uppercase tracking-[0.05em] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            aria-label={`Signed in as ${ROLE_LABEL[role]}. Switch person.`}
          >
            <span className="font-display flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ink)] text-[11px] leading-none text-[var(--color-cream)]">
              {ROLE_LABEL[role][0]}
            </span>
            <span>{ROLE_LABEL[role]}</span>
            <span className="mt-0.5 h-0.5 w-6" aria-hidden />
          </button>
        </div>
      </nav>
      {switching && (
        <RoleSheet title="Switch person" subtitle="Who is using this phone?" onClose={() => setSwitching(false)} />
      )}
    </>
  );
}
