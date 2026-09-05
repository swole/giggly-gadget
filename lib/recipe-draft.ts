// The shape Claude returns for an extracted recipe, and what the add-a-meal form edits.
// Enums mirror the live Notion `.Recipes` select options exactly, so a draft can be
// written to Notion without creating stray options.

import { z } from "zod";

export const CUISINES = [
  "Japanese", "Korean", "Italian", "American", "Thai", "Mexican", "Chinese", "Indian", "French", "Mediterranean", "Other",
] as const;
export const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Side"] as const;
export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export const TAGS = [
  "Quick", "Comfort Food", "Healthy", "Vegetarian", "Vegan", "Date Night", "Meal Prep Friendly",
  "Guest Worthy", "Kid Friendly", "Spicy", "Heart Healthy", "Side Dish",
] as const;

export const RecipeDraftSchema = z.object({
  title: z.string().min(2).max(120).describe("Short dish name in Title Case, no trailing punctuation"),
  emoji: z.string().max(4).nullable().describe("One emoji that suits the dish, or null"),
  cuisine: z.enum(CUISINES),
  meal_type: z.enum(MEAL_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  prep_min: z.number().int().min(0).max(600).nullable().describe("Hands-on prep minutes, null if unknown"),
  cook_min: z.number().int().min(0).max(1440).nullable().describe("Cooking minutes, null if unknown"),
  servings: z.number().int().min(1).max(24).nullable().describe("Servings the quantities make, null if unknown"),
  tags: z.array(z.enum(TAGS)).max(5),
  intro: z.string().max(400).nullable().describe("One or two sentences on what the dish is, or null"),
  ingredients: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(60)
    .describe('One line per ingredient in the form "<qty> [<unit>] <name>[, <modifier>]"'),
  steps: z.array(z.string().min(3).max(800)).min(1).max(40).describe("Numbered method, one imperative step per entry"),
  notes: z.string().max(800).nullable().describe("Storage, substitutions or tips, or null"),
  source_url: z.string().url().nullable(),
});

export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

export type ExtractSource =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string }
  | { kind: "image"; media_type: "image/jpeg" | "image/png" | "image/webp"; data_base64: string };
