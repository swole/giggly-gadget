import type { ReactNode } from "react";
import { isPlanner, type Role } from "@/lib/role";
import { BasketIcon, BookIcon, CalendarIcon, PlusIcon, SkilletIcon } from "@/components/icons";

export type Tab = {
  href: string;
  label: string;
  icon: (p: { size?: number; className?: string }) => ReactNode;
  match: (p: string) => boolean;
};

const KITCHEN: Tab = { href: "/", label: "Kitchen", icon: SkilletIcon, match: (p) => p === "/" || p.startsWith("/kitchen") };
const PLAN: Tab = { href: "/plan", label: "Plan", icon: CalendarIcon, match: (p) => p.startsWith("/plan") };
const GROCERY: Tab = { href: "/grocery", label: "Grocery", icon: BasketIcon, match: (p) => p.startsWith("/grocery") };
const RECIPES: Tab = { href: "/recipes", label: "Recipes", icon: BookIcon, match: (p) => p.startsWith("/recipes") };
const ADD: Tab = { href: "/add", label: "Add", icon: PlusIcon, match: (p) => p.startsWith("/add") };

/** The bar for this role, left to right. Also the order the number keys follow. */
export function tabsFor(role: Role | null): Tab[] {
  if (!role) return [];
  return isPlanner(role) ? [KITCHEN, PLAN, GROCERY, RECIPES, ADD] : [KITCHEN, GROCERY, RECIPES];
}
