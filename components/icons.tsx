// The house icon family. One stroke weight (1.75), 24px grid, currentColor —
// drawn to sit beside the Die (components/plan/Die.tsx), which started this set
// when the ⚄ glyph rendered as a tofu box. Platform emoji rendered in Segoe's
// palette and fought the warm palette everywhere; these inherit ink/terra/muted.

type IconProps = { size?: number; className?: string };

function Svg({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

/** Kitchen: a skillet with its fried egg. */
export function SkilletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10" cy="12" r="6.25" />
      <path d="M16.25 12H22" />
      <circle cx="9.25" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Plan: a calendar. */
export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </Svg>
  );
}

/** Grocery: the market basket. */
export function BasketIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 10h16l-1.6 8.6a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6z" />
      <path d="M8.5 10a3.5 3.5 0 0 1 7 0" />
      <path d="M9.5 13.5v3.5M14.5 13.5v3.5" />
    </Svg>
  );
}

/** Recipes: the open book. */
export function BookIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 6.5C10 5 7.4 4.25 4 4.25V18.5c3.4 0 6 .75 8 2.25 2-1.5 4.6-2.25 8-2.25V4.25c-3.4 0-6 .75-8 2.25z" />
      <path d="M12 6.5v14.25" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** Wet market. */
export function FishIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5.5 12c2.6-3.6 6-5.25 10.5-5.25 1.1 1.6 1.65 3.35 1.65 5.25s-.55 3.65-1.65 5.25C11.5 17.25 8.1 15.6 5.5 12z" />
      <path d="M5.5 12 2.5 14.5v-5z" />
      <circle cx="14.5" cy="10.75" r="0.9" fill="currentColor" stroke="none" />
      <path d="M17.65 9.5c1.5.5 2.8 1.35 3.85 2.5-1.05 1.15-2.35 2-3.85 2.5" />
    </Svg>
  );
}

/** Supermarket. */
export function CartIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 4.5h2.2L7.5 15h10.4l1.9-7.5H6" />
      <circle cx="8.75" cy="19" r="1.5" />
      <circle cx="16.75" cy="19" r="1.5" />
    </Svg>
  );
}

/** "Either" shop, misc categories. */
export function SpoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="7" rx="3.1" ry="4.25" />
      <path d="M12 11.25V21" />
    </Svg>
  );
}

/** Produce. */
export function LeafIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 19C5 9.5 11.5 4.5 20 4.5c0 8.5-5 14.5-15 14.5z" />
      <path d="M5 19c3.2-5.6 7.2-9.6 11.5-11.5" />
    </Svg>
  );
}

/** Dairy: the milk bottle. */
export function MilkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.25 3h5.5v3l1.75 3.5V19a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V9.5L9.25 6z" />
      <path d="M7.5 13.5h9" />
    </Svg>
  );
}

/** Grain & noodles: the rice bowl. */
export function RiceBowlIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 11.5h16a8 8 0 0 1-16 0z" />
      <path d="M8.5 19.5h7" />
      <path d="M7 8.25c1.5-1 3.2-1.5 5-1.5s3.5.5 5 1.5" />
    </Svg>
  );
}

/** Pantry: the jar. */
export function JarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 8h8v11.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 19.5z" />
      <rect x="7.25" y="4" width="9.5" height="2.75" rx="0.75" />
      <path d="M8 13h8" />
    </Svg>
  );
}

/** Spices: the shaker. */
export function ShakerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 9h5l1.25 11a1 1 0 0 1-1 1h-5.5a1 1 0 0 1-1-1z" />
      <path d="M10 5.5h4V9h-4z" />
      <path d="M11 3.25h2" />
      <circle cx="11" cy="13" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="15.5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="18" r="0.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Empty plate — nothing planned. */
export function PlateIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.25" />
    </Svg>
  );
}

/** A steaming one-off bowl. */
export function BowlIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 13h16a8 8 0 0 1-16 0z" />
      <path d="M9.5 4.5c0 1.5 1 1.75 1 3.25M14 4.5c0 1.5 1 1.75 1 3.25" />
    </Svg>
  );
}

/** Rest day. */
export function SunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </Svg>
  );
}

/** Swap / substitute. */
export function SwapIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8h13l-3.25-3.25M20 16H7l3.25 3.25" />
    </Svg>
  );
}

const CATEGORY_ICON: Record<string, (p: IconProps) => React.ReactNode> = {
  produce: LeafIcon,
  protein: FishIcon,
  dairy: MilkIcon,
  grain: RiceBowlIcon,
  pantry: JarIcon,
  spice: ShakerIcon,
  other: SpoonIcon,
};

export function CategoryIcon({ category, ...p }: IconProps & { category: string }) {
  const C = CATEGORY_ICON[category] ?? SpoonIcon;
  return <>{C(p)}</>;
}

const SHOP_ICON: Record<string, (p: IconProps) => React.ReactNode> = {
  wet_market: FishIcon,
  supermarket: CartIcon,
  either: BasketIcon,
};

export function ShopIcon({ shop, ...p }: IconProps & { shop: string }) {
  const S = SHOP_ICON[shop] ?? BasketIcon;
  return <>{S(p)}</>;
}
