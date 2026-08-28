import { NextRequest, NextResponse } from "next/server";
import { notionClient, NOTION_RECIPES_DATA_SOURCE_ID } from "@/lib/notion";
import { RecipeDraftSchema } from "@/lib/recipe-draft";
import { RECIPE_SOURCES, chunk, draftToBlocks, draftToProperties, type RecipeSource } from "@/lib/notion-writer";
import { syncRecipePage } from "@/lib/notion-sync";
import { roleFromRequest } from "@/lib/role.server";
import { isPlanner } from "@/lib/role";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { draft?: unknown; source?: RecipeSource; want_to_try?: boolean; cover_url?: string | null };

/**
 * POST /api/recipes/create { draft, source?, want_to_try?, cover_url? } → { id, title, synced }
 * cover_url (stable, https) becomes the Notion page cover; the sync turns an external cover into image_url.
 * Creates the page in Notion `.Recipes` (source of truth), then syncs that one page
 * into Supabase so it is visible immediately. If the sync step fails the nightly cron heals it.
 */
export async function POST(req: NextRequest) {
  if (!isPlanner(roleFromRequest(req))) {
    return NextResponse.json({ error: "Only Johnny and Lydia can add meals." }, { status: 403 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = RecipeDraftSchema.safeParse(body.draft);
  if (!parsed.success) {
    return NextResponse.json({ error: "draft is invalid", issues: parsed.error.issues.slice(0, 10) }, { status: 400 });
  }
  const draft = parsed.data;
  const source: RecipeSource = RECIPE_SOURCES.includes(body.source as RecipeSource) ? (body.source as RecipeSource) : "Claude";
  const wantToTry = body.want_to_try !== false;
  const coverUrl = typeof body.cover_url === "string" && /^https:\/\/[^\s]+$/.test(body.cover_url) ? body.cover_url : null;

  if (!NOTION_RECIPES_DATA_SOURCE_ID) {
    return NextResponse.json({ error: "NOTION_RECIPES_DATA_SOURCE_ID is not set" }, { status: 503 });
  }

  const notion = notionClient();
  const blocks = draftToBlocks(draft);
  const [first, ...rest] = chunk(blocks, 100);

  let pageId: string;
  try {
    const page = await notion.pages.create({
      parent: { type: "data_source_id", data_source_id: NOTION_RECIPES_DATA_SOURCE_ID },
      icon: draft.emoji ? { type: "emoji", emoji: draft.emoji as never } : undefined,
      cover: coverUrl ? { type: "external", external: { url: coverUrl } } : undefined,
      properties: draftToProperties(draft, { source, wantToTry }) as never,
      children: (first ?? []) as never,
    });
    pageId = page.id;
    for (const more of rest) {
      await notion.blocks.children.append({ block_id: pageId, children: more as never });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Notion rejected the page: ${msg}` }, { status: 502 });
  }

  const sync = await syncRecipePage(pageId);
  return NextResponse.json({ id: pageId, title: draft.title, synced: sync.ok, sync_error: sync.error ?? null });
}
