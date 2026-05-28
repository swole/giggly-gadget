import { Client } from "@notionhq/client";

export function notionClient() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("Missing NOTION_TOKEN");
  return new Client({ auth: token });
}

export const NOTION_RECIPES_DATA_SOURCE_ID =
  process.env.NOTION_RECIPES_DATA_SOURCE_ID ?? "";
export const NOTION_RECIPES_DB_ID = process.env.NOTION_RECIPES_DB_ID ?? "";
