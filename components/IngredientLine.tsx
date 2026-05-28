import type { ParsedIngredientRow } from "@/lib/recipes";
import { renderQty } from "@/lib/scale";

type Props = {
  ing: ParsedIngredientRow;
  scale: number;
  showIndex?: boolean;
  index?: number;
};

export function IngredientLine({ ing, scale, showIndex = true, index }: Props) {
  if (!ing.scalable && !ing.to_taste) {
    return (
      <li className="flex items-baseline gap-3 border-b border-[var(--color-line)]/60 py-2 text-sm">
        {showIndex && (
          <span className="w-6 shrink-0 text-right text-[var(--color-faint)] tabular-nums">
            {(index ?? 0) + 1}.
          </span>
        )}
        <span className="italic text-[var(--color-muted)]">
          {ing.raw.replace(/^[-•*]\s+/, "")}
        </span>
      </li>
    );
  }

  if (ing.to_taste) {
    return (
      <li className="flex items-baseline gap-3 border-b border-[var(--color-line)]/60 py-2 text-sm">
        {showIndex && (
          <span className="w-6 shrink-0 text-right text-[var(--color-faint)] tabular-nums">
            {(index ?? 0) + 1}.
          </span>
        )}
        <span className="text-[var(--color-body)]">
          {ing.name}
          <span className="ml-1.5 text-xs text-[var(--color-muted)]">to taste</span>
        </span>
      </li>
    );
  }

  const qMin = ing.qty_min === null ? null : ing.qty_min * scale;
  const qMax = ing.qty_max === null ? null : ing.qty_max * scale;
  const qtyText =
    qMin === null
      ? ""
      : qMax === null || qMax === qMin
        ? renderQty(qMin)
        : `${renderQty(qMin)}–${renderQty(qMax)}`;

  return (
    <li className="flex items-baseline gap-3 border-b border-[var(--color-line)]/60 py-2 text-sm">
      {showIndex && (
        <span className="w-6 shrink-0 text-right text-[var(--color-faint)] tabular-nums">
          {(index ?? 0) + 1}.
        </span>
      )}
      <span className="text-[var(--color-ink)]">
        <span className="font-display text-[var(--color-terra)] tabular-nums">{qtyText}</span>
        {ing.unit && <span className="ml-1 text-[var(--color-muted)]">{ing.unit}</span>}
        <span className="ml-2 text-[var(--color-ink)]">{ing.name}</span>
        {ing.modifier && (
          <span className="ml-1.5 italic text-[var(--color-muted)]">, {ing.modifier}</span>
        )}
        {ing.optional && (
          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
            optional
          </span>
        )}
      </span>
    </li>
  );
}
