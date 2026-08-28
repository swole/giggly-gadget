// The heart-healthy three-week rotation from the kitchen manual (Aug 2026).
// Each entry is a Notion page id plus the title at the time of writing; resolution
// matches by id first (titles can be edited in Notion) and falls back to a
// case/space-insensitive title match.

import type { Slot } from "./types";
import type { PlannerRecipe } from "./types";

export type RotationDish = { id: string; title: string };
export type RotationDay = Partial<Record<Slot, RotationDish[]>>;
export type RotationWeek = RotationDay[]; // Mon..Sun, index 0..6

const D = (id: string, title: string): RotationDish => ({ id, title });

// Breakfast
const B1 = D("3c5198fd-3b9c-8170-8acd-c65c2c6cbd52", "Chilli Omelette with Tofu");
const B2 = D("3c5198fd-3b9c-8159-936b-fc13899c5b47", "Sweet Potato, Black Bean and Tempeh Hash");
const B3 = D("3c5198fd-3b9c-817a-a0d1-f23a8105accc", "Chocolate and Peanut Butter Overnight Oats");
const B4 = D("3c5198fd-3b9c-813c-a9f1-fc24fe198564", "Black Sesame Chia Pudding");
const B5 = D("3c5198fd-3b9c-812f-a9e2-d4fc080cb8ee", "Baked Apple, Cinnamon and Walnut Oats");
const B6 = D("3c5198fd-3b9c-819a-9dd3-ce0a8a88ba84", "Fish-Slice Congee");
const B7 = D("3c5198fd-3b9c-8132-89b6-fdd759926f2d", "Steamed Egg Custard with Prawn");
const B8 = D("3c5198fd-3b9c-8132-885b-cca77fef14f1", "Prawn Wonton Noodle Soup");
const B9 = D("3c5198fd-3b9c-8189-8af8-d6fc0a996628", "Chickpea Shakshuka with Harissa");
const B10 = D("3c5198fd-3b9c-81cb-98e9-cd75a5e5da38", "Grilled Saba Breakfast Set");
// Lunch
const L1 = D("3c5198fd-3b9c-811a-864b-c591ced36f6d", "Masoor Dahl with Brown Rice");
const L2 = D("3c5198fd-3b9c-81a2-9029-e38c1cf3c869", "Black Bean, Sweet Potato and Tempeh Burrito Bowl");
const L3 = D("3c5198fd-3b9c-81ad-82e9-e747d543cfe5", "Soba, Edamame and Pressed Tofu Salad");
const L4 = D("3c5198fd-3b9c-8192-b07b-d4c56bc3e347", "Kidney Bean and Barley Minestrone");
const L5 = D("3c5198fd-3b9c-8146-ab42-c8855e75ddbd", "Tofu Bibimbap");
const L6 = D("3c5198fd-3b9c-817e-94f8-c307e8c2c95d", "Sichuan Cold Sesame-Chilli Noodles");
const L7 = D("3c5198fd-3b9c-81d4-9b92-e97f2ae3c564", "Thai Larb Tempeh");
const L8 = D("3c5198fd-3b9c-81ae-84ea-d1e4ee079799", "Sichuan Dry-Fried Green Beans with Tempeh");
const L9 = D("3c5198fd-3b9c-8140-bfba-eef72f9aaef7", "Baked Salmon and Quinoa Bowl");
const L10 = D("3c5198fd-3b9c-8115-a51a-e0858227e8ab", "Salmon and Hijiki Brown Rice Bento");
const L11 = D("3c5198fd-3b9c-81c7-95da-d19844a0bcb3", "Steamed Prawn-and-Fish Patty over Brown Rice");
const L12 = D("3c5198fd-3b9c-814c-aff7-e60f9a529b75", "Sundubu Jjigae with Prawns");
const L13 = D("3c5198fd-3b9c-81b2-bb66-d6b1a64ee225", "Grilled Chicken and Freekeh Tabbouleh");
// Dinner
const D1 = D("3c5198fd-3b9c-8131-bbcc-e2eb854b49c5", "Mapo Tofu, Rebuilt Low-Sodium");
const D2 = D("3c5198fd-3b9c-8110-969d-e44f06b8856a", "Miso-Ginger Baked Salmon");
const D3 = D("3c5198fd-3b9c-8131-91d7-cef9963ba45b", "Whole Steamed Seabass, Teochew Style");
const D4 = D("3c5198fd-3b9c-8181-a05b-d77989ae2728", "Chana Masala with Tofu Tikka and Aloo Gobi");
const D5 = D("3c5198fd-3b9c-81c0-9aee-d143ebf579f9", "Braised Tofu Claypot");
const D6 = D("3c5198fd-3b9c-81cd-b9f8-ca52c45f6473", "Chicken Traybake with Chimichurri");
const D7 = D("3c5198fd-3b9c-81d7-bd0d-ece08bae8a89", "Prawn and Vegetable Low-Oil Stir-Fry");
const D8 = D("3c5198fd-3b9c-81ef-90f6-d271543cbfd0", "Steamed Tofu with Prawns, Garlic and Chilli");
const D9 = D("3c5198fd-3b9c-8144-91d6-f33419e081e2", "Assam Pedas");
const D10 = D("3c5198fd-3b9c-815a-af07-c80e3d655398", "Sichuan Shui Zhu Yu, Low-Oil");
const D11 = D("3c5198fd-3b9c-81d8-b431-ce5ccbae1607", "Yong Tau Foo, Homemade");
const D12 = D("3c5198fd-3b9c-8104-b13c-fae4e522f8ca", "Yosenabe Hot Pot");
const D13 = D("3c5198fd-3b9c-81d7-af79-db5e7f1488cd", "Sri Lankan Dhal with Brinjal Moju");
const D14 = D("3c5198fd-3b9c-81d0-b266-cfcc137417c0", "Grilled Saba with Grated Daikon");

const day = (b?: RotationDish, l?: RotationDish, d?: RotationDish): RotationDay => ({
  ...(b ? { breakfast: [b] } : {}),
  ...(l ? { lunch: [l] } : {}),
  ...(d ? { dinner: [d] } : {}),
});

/** Mon..Sun. Sunday is the helper's rest day: breakfast only, no cooked dinner. */
export const ROTATION: Record<1 | 2 | 3, RotationWeek> = {
  1: [day(B7, L5, D1), day(B3, L6, D9), day(B10, L1, D5), day(B4, L9, D8), day(B1, L7, D3), day(B9, L2), day(B2, L4)],
  2: [day(B6, L3, D4), day(B5, L11, D2), day(B7, L12, D13), day(B3, L8, D11), day(B10, L10, D12), day(B8, L13), day(B2)],
  3: [day(B4, L5, D10), day(B1, L1, D14), day(B5, L2, D6), day(B3, L6, D7), day(B10, L10, D1), day(B9, L7), day(B2)],
};

export type RotationWeekNo = 1 | 2 | 3;

/** Which rotation week a calendar week falls on: ISO week number mod 3, starting from week 1 on 2026-08-24. */
export function rotationWeekFor(weekMonday: string, anchorMonday = "2026-08-24"): RotationWeekNo {
  const a = Date.UTC(...ymd(anchorMonday));
  const b = Date.UTC(...ymd(weekMonday));
  const weeks = Math.round((b - a) / (7 * 86_400_000));
  const idx = ((weeks % 3) + 3) % 3;
  return (idx + 1) as RotationWeekNo;
}

function ymd(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m - 1, d];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type ResolvedItem = { planned_for: string; slot: Slot; recipe_id: string };

/** Turn a rotation week into concrete (date, slot, recipe_id) items against the live recipe list. */
export function resolveRotation(
  weekNo: RotationWeekNo,
  weekDates: string[], // Mon..Sun
  recipes: Pick<PlannerRecipe, "id" | "title">[],
): { items: ResolvedItem[]; unmatched: string[] } {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const byTitle = new Map(recipes.map((r) => [norm(r.title), r]));
  const items: ResolvedItem[] = [];
  const unmatched: string[] = [];
  const week = ROTATION[weekNo];
  week.forEach((dayPlan, i) => {
    const date = weekDates[i];
    if (!date) return;
    for (const slot of Object.keys(dayPlan) as Slot[]) {
      for (const dish of dayPlan[slot] ?? []) {
        const hit = byId.get(dish.id) ?? byTitle.get(norm(dish.title));
        if (hit) items.push({ planned_for: date, slot, recipe_id: hit.id });
        else unmatched.push(dish.title);
      }
    }
  });
  return { items, unmatched: Array.from(new Set(unmatched)) };
}
