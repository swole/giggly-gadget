"use client";

// The money chip on a shop's section heading in /grocery. Quiet while the shop still has
// items to tick, terra once that shop is ticked through with nothing logged (the one nudge,
// at the one moment it makes sense), and the amount itself once there is one.

import { formatSgd } from "@/lib/money";
import { SPEND_SHOP_LABEL, type SpendShop } from "@/lib/spend/types";
import { CoinsIcon } from "@/components/icons";

export function MoneyChip({
  shop,
  cents,
  count,
  nudge,
  onClick,
}: {
  shop: SpendShop;
  cents: number;
  count: number;
  /** That shop is fully ticked and nothing is logged yet. */
  nudge: boolean;
  onClick: () => void;
}) {
  const has = count > 0;
  const label = has
    ? `${SPEND_SHOP_LABEL[shop]} spend, ${formatSgd(cents)}`
    : `Add ${SPEND_SHOP_LABEL[shop].toLowerCase()} spend`;
  const tone = has
    ? "border-[var(--color-line)] bg-[var(--color-card)] text-[var(--color-ink)]"
    : nudge
      ? "border-[var(--color-terra-dark)] bg-[var(--color-terra)] text-[var(--color-cream)]"
      : "border-dashed border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`ml-2 inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-sans text-[11px] font-medium tabular-nums transition-colors ${tone}`}
    >
      <CoinsIcon size={13} />
      {has ? formatSgd(cents) : "+ S$"}
      {count > 1 && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-paper-2)] px-1 text-[9px] text-[var(--color-muted)]">
          {count}
        </span>
      )}
    </button>
  );
}
