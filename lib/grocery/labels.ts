// Shared display labels for grocery categories (used by the list, planner and kitchen).

export const CATEGORY_ORDER = ["produce", "protein", "dairy", "grain", "pantry", "spice", "other"] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  produce: "Produce",
  protein: "Protein",
  dairy: "Dairy",
  grain: "Grain & noodles",
  pantry: "Pantry",
  spice: "Spices",
  other: "Other",
};

export const CATEGORY_GLYPH: Record<string, string> = {
  produce: "🌿",
  protein: "🐟",
  dairy: "🧈",
  grain: "🍚",
  pantry: "🫙",
  spice: "🧂",
  other: "🥄",
};
