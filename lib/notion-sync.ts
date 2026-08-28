import { notionClient, NOTION_RECIPES_DATA_SOURCE_ID } from "./notion";
import { supabaseAdmin } from "./supabase/server";
import { blocksToMarkdown } from "./notion-blocks";
import { parseIngredients } from "./ingredients/parse";
import { findRecipeImage } from "./image-search";

type AnyProp = Record<string, unknown>;

function getTitle(p: AnyProp): string {
  // @ts-expect-error Notion property types are a wide union; we read by key
  const rt = p?.Title?.title ?? p?.Name?.title;
  if (!rt || !Array.isArray(rt)) return "";
  return rt.map((r: { plain_text?: string }) => r.plain_text ?? "").join("").trim();
}

function getSelect(p: AnyProp, key: string): string | null {
  // @ts-expect-error Notion property types are a wide union; we read by key
  return p?.[key]?.select?.name ?? null;
}

function getMultiSelect(p: AnyProp, key: string): string[] {
  // @ts-expect-error Notion property types are a wide union; we read by key
  const arr = p?.[key]?.multi_select;
  if (!Array.isArray(arr)) return [];
  return arr.map((s: { name: string }) => s.name);
}

function getNumber(p: AnyProp, key: string): number | null {
  // @ts-expect-error Notion property types are a wide union; we read by key
  const n = p?.[key]?.number;
  return typeof n === "number" ? n : null;
}

function getUrl(p: AnyProp, key: string): string | null {
  // @ts-expect-error Notion property types are a wide union; we read by key
  return p?.[key]?.url ?? null;
}

function getDate(p: AnyProp, key: string): string | null {
  // @ts-expect-error Notion property types are a wide union; we read by key
  return p?.[key]?.date?.start ?? null;
}

function getCheckbox(p: AnyProp, key: string): boolean {
  // @ts-expect-error Notion property types are a wide union; we read by key
  return Boolean(p?.[key]?.checkbox);
}

function getRichText(p: AnyProp, key: string): string {
  // @ts-expect-error Notion property types are a wide union; we read by key
  const rt = p?.[key]?.rich_text;
  if (!rt || !Array.isArray(rt)) return "";
  return rt.map((r: { plain_text?: string }) => r.plain_text ?? "").join("").trim();
}

function parseRating(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d)/);
  if (m) return parseInt(m[1], 10);
  // count stars
  const stars = (raw.match(/[★⭐]/g) || []).length;
  return stars > 0 ? stars : null;
}

// Containers whose children are part of the recipe text (a toggle "Ingredients", columns, synced blocks,
// nested bullets). Children are spliced in after their parent so the markdown reads top to bottom.
const CONTAINER_TYPES = new Set(["toggle", "column_list", "column", "synced_block", "bulleted_list_item", "numbered_list_item", "callout", "quote", "to_do", "paragraph"]);

async function fetchAllBlocks(notion: ReturnType<typeof notionClient>, pageId: string, depth = 0) {
  const blocks: Record<string, unknown>[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const b of res.results as unknown as Record<string, unknown>[]) {
      blocks.push(b);
      if (depth < 3 && b.has_children === true && CONTAINER_TYPES.has(String(b.type))) {
        try {
          const kids = await fetchAllBlocks(notion, String(b.id), depth + 1);
          blocks.push(...(kids as unknown as Record<string, unknown>[]));
        } catch {
          // a container we cannot read (permissions / synced from elsewhere) is skipped, not fatal
        }
      }
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return blocks as unknown as { id: string; type: string }[];
}

export type SyncResult = {
  total: number;
  upserted: number;
  skipped: number;
  removed?: number;
  errors: { recipe: string; error: string }[];
};

export async function syncRecipesFromNotion(options: { force?: boolean } = {}): Promise<SyncResult> {
  const notion = notionClient();
  const supa = supabaseAdmin();
  const result: SyncResult = { total: 0, upserted: 0, skipped: 0, errors: [] };
  const force = options.force === true;
  const seen = new Set<string>();

  // 1. Load current sync state from Supabase (notion_updated_at + image_url per recipe)
  const { data: existing } = await supa
    .from("recipes")
    .select("id, notion_updated_at, image_url");
  const existingMap = new Map(
    (existing ?? []).map((r) => [
      r.id as string,
      {
        notion_updated_at: r.notion_updated_at as string | null,
        image_url: r.image_url as string | null,
      },
    ])
  );

  // 2. Iterate Notion pages
  let cursor: string | undefined = undefined;
  do {
    const res = await notion.dataSources.query({
      data_source_id: NOTION_RECIPES_DATA_SOURCE_ID,
      page_size: 100,
      start_cursor: cursor,
    });

    for (const page of res.results as unknown as Array<{
      id: string;
      last_edited_time: string;
      properties: AnyProp;
      cover?: NotionCover;
    }>) {
      result.total++;
      const pageId = page.id;
      seen.add(pageId);
      const lastEdited = page.last_edited_time;
      const props = page.properties ?? {};
      const title = getTitle(props);
      const source = getSelect(props, "Source");

      // Skip Reference pages — they're placeholder index pages, not real recipes
      if (source === "Reference") {
        result.skipped++;
        // Also delete from Supabase if it was previously synced
        await supa.from("recipes").delete().eq("id", pageId);
        continue;
      }

      try {
        const prior = existingMap.get(pageId);
        if (
          !force &&
          prior &&
          prior.notion_updated_at &&
          new Date(prior.notion_updated_at).getTime() >= new Date(lastEdited).getTime()
        ) {
          result.skipped++;
          continue;
        }

        await upsertNotionPage(notion, supa, { id: pageId, last_edited_time: lastEdited, properties: props, cover: page.cover ?? null }, prior);
        result.upserted++;
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null
              ? JSON.stringify(e)
              : String(e);
        result.errors.push({ recipe: title || pageId, error: msg });
      }
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  // 3. Pages archived, moved out of .Recipes or deleted in Notion are gone from the walk above;
  // drop their rows so the picker and Discover stop showing them. Only after a complete, sane walk.
  if (result.total >= 20) {
    const stale = Array.from(existingMap.keys()).filter((id) => !seen.has(id));
    if (stale.length > 0 && stale.length <= Math.max(10, Math.floor(result.total * 0.2))) {
      const { error } = await supa.from("recipes").delete().in("id", stale);
      if (error) result.errors.push({ recipe: `stale cleanup (${stale.length})`, error: error.message });
      else result.removed = stale.length;
    } else if (stale.length > 0) {
      result.errors.push({ recipe: "stale cleanup", error: `${stale.length} rows missing from Notion — too many to auto-delete, check the data source` });
    }
  }

  return result;
}

type NotionCover = { type?: string; external?: { url?: string } } | null;
type NotionPageLite = { id: string; last_edited_time: string; properties: AnyProp; cover?: NotionCover };

/** An external page cover is the most deliberate image signal (set by the app for video imports, or by hand in Notion). Notion-hosted `file` covers expire hourly, so they are ignored. */
function externalCoverUrl(cover: NotionCover | undefined): string | null {
  const u = cover?.type === "external" ? cover.external?.url : null;
  return u && /^https:\/\//.test(u) ? u : null;
}
type PriorState = { notion_updated_at: string | null; image_url: string | null } | undefined;

/** Upsert ONE Notion page into recipes + ingredients_parsed. Shared by the full sync and syncRecipePage(). */
async function upsertNotionPage(
  notion: ReturnType<typeof notionClient>,
  supa: ReturnType<typeof supabaseAdmin>,
  page: NotionPageLite,
  prior: PriorState,
): Promise<void> {
  const pageId = page.id;
  const lastEdited = page.last_edited_time;
  const props = page.properties ?? {};
  const title = getTitle(props);
  const source = getSelect(props, "Source");
  const blocks = await fetchAllBlocks(notion, pageId);
  const instructionsMd = blocksToMarkdown(blocks);
  const parsed = parseIngredients(instructionsMd);
  const cuisine = getSelect(props, "Cuisine");

  // Auto-enrich with a stock food photo for new recipes (or those still
  // missing an image). Don't overwrite an existing image_url — Johnny may
  // have hand-picked one or improved a placeholder.
  let imageUrl: string | null = externalCoverUrl(page.cover) ?? prior?.image_url ?? null;
  if (!imageUrl) {
    imageUrl = await findRecipeImage(title, cuisine);
  }

  const row = {
    id: pageId,
    title,
    cuisine,
    meal_type: getSelect(props, "Meal Type"),
    difficulty: getSelect(props, "Difficulty"),
    prep_min: getNumber(props, "Prep Time"),
    cook_min: getNumber(props, "Cook Time"),
    servings: getNumber(props, "Servings"),
    rating: parseRating(getSelect(props, "Rating")),
    tags: getMultiSelect(props, "Tags"),
    source_url: getUrl(props, "Source URL"),
    notes: getRichText(props, "Notes"),
    last_made: getDate(props, "Last Made"),
    want_to_try: getCheckbox(props, "Want to Try"),
    image_url: imageUrl,
    source,
    instructions_md: instructionsMd,
    notion_updated_at: lastEdited,
    synced_at: new Date().toISOString(),
  };

  const { error: upErr } = await supa.from("recipes").upsert(row);
  if (upErr) throw upErr;

  await supa.from("ingredients_parsed").delete().eq("recipe_id", pageId);
  if (parsed.length > 0) {
    const ingRows = parsed.map((p, i) => ({
      recipe_id: pageId,
      line_index: i,
      raw: p.raw,
      qty_min: p.qty_min,
      qty_max: p.qty_max,
      unit: p.unit,
      name: p.name,
      modifier: p.modifier,
      optional: p.optional,
      to_taste: p.to_taste,
      scalable: p.scalable,
      category: p.category,
    }));
    const { error: ingErr } = await supa.from("ingredients_parsed").insert(ingRows);
    if (ingErr) {
      // The recipe row already carries the new notion_updated_at; null it so the next sync retries
      // instead of leaving a recipe with zero ingredients until someone forces a full sync.
      await supa.from("recipes").update({ notion_updated_at: null }).eq("id", pageId);
      throw ingErr;
    }
  }
}

/**
 * Sync a single page by id (used right after the app creates a recipe in Notion).
 * Reference pages are removed from Supabase, matching the full sync.
 */
export async function syncRecipePage(pageId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const notion = notionClient();
    const supa = supabaseAdmin();
    const page = (await notion.pages.retrieve({ page_id: pageId })) as unknown as NotionPageLite;
    if (getSelect(page.properties ?? {}, "Source") === "Reference") {
      await supa.from("recipes").delete().eq("id", pageId);
      return { ok: true };
    }
    const { data: existing } = await supa.from("recipes").select("notion_updated_at, image_url").eq("id", pageId).maybeSingle();
    await upsertNotionPage(
      notion,
      supa,
      page,
      existing
        ? { notion_updated_at: existing.notion_updated_at as string | null, image_url: existing.image_url as string | null }
        : undefined,
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
