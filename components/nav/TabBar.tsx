"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABEL } from "@/lib/role";
import { hotkeyDigit, type HotkeyAction } from "@/lib/nav/hotkeys";
import { useRole } from "@/components/role/RoleProvider";
import { RoleSheet } from "@/components/role/RolePicker";
import { tabsFor } from "@/components/nav/tabs";
import { useNavHotkeys } from "@/components/nav/useNavHotkeys";
import { ShortcutsSheet } from "@/components/nav/ShortcutsSheet";

export function TabBar() {
  const role = useRole();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [switching, setSwitching] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);

  // Cook mode is full-screen; no chrome, and it owns arrows + space. No bar (and no
  // hotkeys) until a role is chosen either.
  const inCookMode = /^\/recipes\/[^/]+\/cook/.test(pathname);
  const showBar = !!role && !inCookMode;

  const tabs = useMemo(() => tabsFor(role), [role]);
  const hrefs = useMemo(() => tabs.map((t) => t.href), [tabs]);
  const openPerson = useCallback(() => setSwitching(true), []);
  const closePerson = useCallback(() => setSwitching(false), []);
  const closeShortcuts = useCallback(() => setShortcuts(false), []);

  const onHotkey = useCallback(
    (action: HotkeyAction) => {
      if (action.kind === "help") return setShortcuts((v) => !v);
      // A hotkey that acts has done its teaching; get the card out of the way.
      setShortcuts(false);
      if (action.kind === "tab") router.push(hrefs[action.index]);
      else setSwitching(true);
    },
    [router, hrefs],
  );
  useNavHotkeys({ count: tabs.length, enabled: showBar, onAction: onHotkey });

  if (!showBar) return null;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-line)]/70 bg-[var(--color-card)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-card)]/85 print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-2xl items-stretch justify-between px-2">
          {tabs.map((t, i) => {
            const active = t.match(pathname);
            const digit = hotkeyDigit(i);
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
                <span className="flex items-baseline gap-1">
                  <span className={active ? "font-semibold" : ""}>{t.label}</span>
                  {digit && <Digit>{digit}</Digit>}
                </span>
                <span
                  className={`mt-0.5 h-0.5 w-6 rounded-full ${active ? "bg-[var(--color-terra)]" : "bg-transparent"}`}
                  aria-hidden
                />
              </Link>
            );
          })}
          <button
            onClick={openPerson}
            className="flex flex-col items-center gap-1 px-2 py-2 text-[11px] uppercase tracking-[0.05em] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            aria-label={`Signed in as ${ROLE_LABEL[role]}. Switch person.`}
          >
            <span className="font-display flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ink)] text-[11px] leading-none text-[var(--color-cream)]">
              {ROLE_LABEL[role][0]}
            </span>
            <span className="flex items-baseline gap-1">
              <span>{ROLE_LABEL[role]}</span>
              {hotkeyDigit(tabs.length) && <Digit>{hotkeyDigit(tabs.length)}</Digit>}
            </span>
            <span className="mt-0.5 h-0.5 w-6" aria-hidden />
          </button>
        </div>
      </nav>
      {switching && (
        <RoleSheet title="Switch person" subtitle="Who is using this phone?" onClose={closePerson} />
      )}
      {shortcuts && (
        <ShortcutsSheet tabs={tabs} personLabel={ROLE_LABEL[role]} onClose={closeShortcuts} />
      )}
    </>
  );
}

/** The shortcut number, footnote-style beside the label, only where there is a keyboard. */
function Digit({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="kbd-hint relative -top-1 font-mono text-[9px] leading-none text-[var(--color-faint)]">
      {children}
    </span>
  );
}
