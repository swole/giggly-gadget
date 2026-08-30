import Link from "next/link";
import { thumb } from "@/lib/images";
import type { Recipe } from "@/lib/recipes";
import { totalMinutes } from "@/lib/recipes";
import { WantToTryStar } from "./WantToTryStar";

export function RecipeCard({
  recipe,
  onPreview,
}: {
  recipe: Recipe;
  onPreview?: (r: Recipe) => void;
}) {
  const total = totalMinutes(recipe);
  const visibleTags = recipe.tags.slice(0, 2);
  const cuisineMeal = [recipe.cuisine, recipe.meal_type].filter(Boolean).join(" · ");

  // The star is a button, so it lives beside the link (a button inside an <a> is invalid and
  // confuses screen readers); the link still covers the whole card visually.
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] shadow-[0_2px_8px_rgba(60,30,10,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-terra)] hover:shadow-[0_6px_16px_rgba(60,30,10,0.14)]">
    <div className="absolute right-0 top-0 z-10 h-14 w-14">
      <div className="relative h-full w-full">
        <WantToTryStar recipeId={recipe.id} initial={recipe.want_to_try} variant="overlay" />
      </div>
    </div>
    <Link
      href={`/recipes/${recipe.id}`}
      prefetch={false}
      onClick={(e) => {
        if (onPreview) {
          e.preventDefault();
          onPreview(recipe);
        }
      }}
      className="block"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-paper-2)]">
        {recipe.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb(recipe.image_url, 640)!}
            alt={recipe.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <PlaceholderArt cuisine={recipe.cuisine} mealType={recipe.meal_type} />
        )}
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
            {cuisineMeal || "Uncategorized"}
          </div>
          {recipe.source && <SourceBadge source={recipe.source} />}
        </div>

        <h2 className="font-display mt-2 text-[1.6rem] leading-[1.05] text-[var(--color-ink)]">
          {recipe.title}
        </h2>

        <div className="mt-4 flex items-center gap-4 text-xs text-[var(--color-muted)]">
          {total ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[var(--color-clay)]">◷</span>
              {total} min
            </span>
          ) : null}
          {recipe.difficulty ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[var(--color-sage)]">◆</span>
              {recipe.difficulty}
            </span>
          ) : null}
          {recipe.rating ? (
            // Half-star ratings (4.5) exist now — a repeat() of stars truncated them.
            <span className="inline-flex items-center gap-1 text-[var(--color-mustard)]">
              ★ {String(recipe.rating).replace(/\.0$/, "")}
            </span>
          ) : null}
        </div>

        {visibleTags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {visibleTags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-[var(--color-line-soft)] bg-[var(--color-paper-2)]/70 px-2 py-0.5 text-[10px] tracking-wide text-[var(--color-body)]"
              >
                {t.toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const isClaude = source === "Claude";
  const cls = isClaude
    ? "bg-[var(--color-sage)] text-[var(--color-cream)]"
    : "bg-[var(--color-clay)] text-[var(--color-cream)]";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.18em] ${cls}`}
    >
      {source}
    </span>
  );
}

// Charming placeholder when no image_url — soft warm gradient with a cuisine glyph
function PlaceholderArt({
  cuisine,
  mealType,
}: {
  cuisine: string | null;
  mealType: string | null;
}) {
  const { from, to, glyph } = cuisineStyle(cuisine, mealType);
  return (
    <div
      className="relative flex h-full w-full items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
    >
      <span
        className="font-display select-none text-6xl opacity-50"
        style={{ color: "#fff", filter: "drop-shadow(0 1px 2px rgba(43,24,16,0.18))" }}
      >
        {glyph}
      </span>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.25),transparent_60%)]" />
    </div>
  );
}

function cuisineStyle(cuisine: string | null, mealType: string | null) {
  const c = (cuisine ?? "").toLowerCase();
  const m = (mealType ?? "").toLowerCase();
  if (m === "dessert") return { from: "#e8b86e", to: "#c8553d", glyph: "🍰" };
  if (m === "breakfast") return { from: "#f4cb6a", to: "#e08560", glyph: "🥣" };
  if (m === "snack") return { from: "#d4a24a", to: "#7c4f4f", glyph: "🥨" };
  if (c === "italian") return { from: "#c8553d", to: "#7c4f4f", glyph: "🍝" };
  if (c === "japanese") return { from: "#e08560", to: "#7c4f4f", glyph: "🍜" };
  if (c === "korean") return { from: "#c8553d", to: "#4a2e2e", glyph: "🌶️" };
  if (c === "chinese") return { from: "#d4a24a", to: "#c8553d", glyph: "🥢" };
  if (c === "thai") return { from: "#e8b86e", to: "#7b8b5e", glyph: "🌿" };
  if (c === "mexican") return { from: "#e08560", to: "#7c4f4f", glyph: "🌮" };
  if (c === "indian") return { from: "#d4a24a", to: "#7c4f4f", glyph: "🍛" };
  if (c === "french") return { from: "#b8a48a", to: "#7c4f4f", glyph: "🥐" };
  if (c === "american") return { from: "#e8b86e", to: "#c8553d", glyph: "🍳" };
  if (c === "mediterranean") return { from: "#7b8b5e", to: "#c8553d", glyph: "🫒" };
  return { from: "#d4a24a", to: "#c8553d", glyph: "🥄" };
}
