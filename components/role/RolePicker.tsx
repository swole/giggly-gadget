"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/role";
import { useRole } from "./RoleProvider";

const BLURB: Record<Role, string> = {
  johnny: "Plan the week, add meals, build the list.",
  lydia: "Plan the week, add meals, build the list.",
  helper: "See what to cook today and what to buy.",
};

async function setRole(role: Role): Promise<boolean> {
  try {
    const res = await fetch("/api/role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const noop = () => () => {};
/** True when the app runs from the home screen (no browser chrome) - the install tip is pointless then. */
function useStandalone(): boolean {
  return useSyncExternalStore(
    noop,
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true,
    () => true,
  );
}

/** Full-screen first-visit picker. Renders nothing once a role is stored. */
export function RolePicker() {
  const role = useRole();
  if (role) return null;
  return <RoleSheet title="Who's in the kitchen?" subtitle="Pick once. This phone will remember." firstVisit />;
}

/** The same sheet, used from the tab bar to switch. */
export function RoleSheet({
  title,
  subtitle,
  onClose,
  firstVisit = false,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  firstVisit?: boolean;
}) {
  const router = useRouter();
  const current = useRole();
  const standalone = useStandalone();
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(r: Role) {
    setBusy(r);
    setError(null);
    const ok = await setRole(r);
    if (!ok) {
      setError("Could not save on this phone - check the connection and tap again.");
      setBusy(null);
      return;
    }
    router.refresh();
    onClose?.();
    setBusy(null);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-[var(--color-card)] px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 shadow-2xl sm:rounded-3xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--color-muted)]">Giggly Gadget</div>
        <h2 className="font-display-italic mt-2 text-3xl leading-tight text-[var(--color-ink)]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}

        <div className="mt-6 grid gap-3">
          {ROLES.map((r) => {
            const active = r === current;
            return (
              <button
                key={r}
                onClick={() => pick(r)}
                disabled={busy !== null}
                className={`group flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-all active:scale-[0.99] ${
                  active
                    ? "border-[var(--color-terra)] bg-[var(--color-terra)]/10"
                    : "border-[var(--color-line)] bg-[var(--color-paper)]/40 hover:border-[var(--color-terra)]"
                }`}
              >
                <span
                  className={`font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl ${
                    active
                      ? "bg-[var(--color-terra)] text-[var(--color-cream)]"
                      : "bg-[var(--color-ink)] text-[var(--color-cream)] group-hover:bg-[var(--color-terra)]"
                  }`}
                >
                  {ROLE_LABEL[r][0]}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-xl text-[var(--color-ink)]">{ROLE_LABEL[r]}</span>
                  <span className="block text-xs text-[var(--color-muted)]">{BLURB[r]}</span>
                </span>
                {busy === r && <span className="ml-auto text-xs text-[var(--color-faint)]">…</span>}
              </button>
            );
          })}
        </div>
        {error && <p className="mt-3 text-xs text-[var(--color-terra-dark)]">{error}</p>}
        {firstVisit && !standalone && (
          <p className="mt-5 rounded-xl bg-[var(--color-paper)]/60 px-3 py-2 text-[11px] leading-relaxed text-[var(--color-muted)]">
            <span className="font-semibold text-[var(--color-ink)]">Tip:</span> keep it on your home screen - iPhone: Share → Add to Home Screen · Android: ⋮ → Add to Home screen.
          </p>
        )}
      </div>
    </div>
  );
}
