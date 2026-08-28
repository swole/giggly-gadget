import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { RecipeDraftSchema, type ExtractSource, type RecipeDraft } from "@/lib/recipe-draft";
import { assertFetchableUrl, fetchPageText } from "@/lib/extract/fetch-page";
import { IMAGE_INSTRUCTION, SYSTEM_PROMPT, buildUserText, buildVideoText } from "@/lib/extract/prompt";
import { detectVideo, enrichWithLinkedRecipe, fetchTikTok, fetchYouTube, platformLabel, type VideoInfo } from "@/lib/extract/video";
import { parseIngredient, type ParsedIngredient } from "@/lib/ingredients/parse";
import { roleFromRequest } from "@/lib/role.server";
import { isPlanner } from "@/lib/role";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";
const MAX_IMAGE_B64 = 3_000_000; // ~2.2 MB binary; client downscales to ≤1600px JPEG first

export type ExtractMedia = {
  platform: "youtube" | "tiktok" | "web";
  url: string;
  title: string | null;
  author: string | null;
  thumbnail_url: string | null;
  has_description: boolean;
  has_transcript: boolean;
  linked_recipe_url: string | null;
};

type Ok = {
  draft: RecipeDraft;
  parsed: ParsedIngredient[];
  warnings: string[];
  media: ExtractMedia | null;
  usage: { input_tokens: number; output_tokens: number };
};

/** POST /api/recipes/extract { source: ExtractSource } → Ok | { error } */
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server" }, { status: 503 });
  }
  // This route spends money (Claude) — only the planners' devices may call it.
  if (!isPlanner(roleFromRequest(req))) {
    return NextResponse.json({ error: "Only Johnny and Lydia can add meals. Switch person from the bar below." }, { status: 403 });
  }
  let body: { source?: ExtractSource };
  try {
    body = (await req.json()) as { source?: ExtractSource };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const src = body.source;
  if (!src || !("kind" in src)) return NextResponse.json({ error: "source required" }, { status: 400 });

  const warnings: string[] = [];
  let media: ExtractMedia | null = null;
  let content: Anthropic.MessageCreateParams["messages"][number]["content"];

  try {
    if (src.kind === "url") {
      let url: URL;
      try {
        url = assertFetchableUrl(src.url.trim());
      } catch {
        return NextResponse.json({ error: "That does not look like a web address we can read" }, { status: 400 });
      }

      const video = detectVideo(url.toString());
      if (video?.platform === "instagram" || video?.platform === "facebook") {
        return NextResponse.json(
          {
            error: `${platformLabel(video.platform)} does not let apps read posts. Copy the caption (tap ··· → Copy) and use Paste text, or screenshot the recipe and use Photo.`,
          },
          { status: 422 },
        );
      }

      if (video?.platform === "youtube" || video?.platform === "tiktok") {
        const info: VideoInfo = await enrichWithLinkedRecipe(
          video.platform === "youtube" ? await fetchYouTube(video.id) : await fetchTikTok(video.url),
        );
        if (!info.description && !info.transcript && !info.title) {
          return NextResponse.json(
            { error: `Could not read that ${platformLabel(video.platform)} video. Paste the caption, or screenshot the recipe card.` },
            { status: 422 },
          );
        }
        if (info.linked_recipe) {
          warnings.push(`Used the written recipe the video links to (${new URL(info.linked_recipe.url).hostname.replace(/^www\./, "")}).`);
        } else if (!info.description && !info.transcript) {
          warnings.push("Only the video title was readable — quantities below are Claude's best reconstruction. Check them against the video.");
        } else if (!info.transcript && video.platform === "youtube") {
          warnings.push("Worked from the video description (YouTube does not hand out captions). Amounts it leaves out are estimates — check against the video.");
        } else if (video.platform === "tiktok") {
          warnings.push(
            /\d/.test(info.description ?? "")
              ? "From the TikTok caption — amounts the caption leaves out are estimates. Check against the video."
              : "The caption has no amounts, so this is Claude's typical version of the dish. For the creator's exact recipe, screenshot it from the video and use Photo.",
          );
        }
        media = {
          platform: info.platform,
          url: info.url,
          title: info.title,
          author: info.author,
          thumbnail_url: info.thumbnail_url,
          has_description: !!info.description,
          has_transcript: !!info.transcript,
          linked_recipe_url: info.linked_recipe?.url ?? null,
        };
        content = buildVideoText(info);
      } else {
        const page = await fetchPageText(url.toString());
        if (!page.jsonld && page.text.length < 200) {
          return NextResponse.json(
            { error: "Could not read that page (it may need a login). Paste the recipe text instead." },
            { status: 422 },
          );
        }
        if (!page.jsonld) warnings.push("No structured recipe data on the page; extracted from page text.");
        if (page.image_url) {
          media = {
            platform: "web",
            url: page.url,
            title: page.title,
            author: new URL(page.url).hostname.replace(/^www\./, ""),
            thumbnail_url: page.image_url,
            has_description: true,
            has_transcript: false,
            linked_recipe_url: null,
          };
        }
        content = buildUserText({ kind: "url", url: page.url, title: page.title, jsonld: page.jsonld, text: page.text });
      }
    } else if (src.kind === "text") {
      const text = (src.text ?? "").trim();
      if (text.length < 20) return NextResponse.json({ error: "Paste a bit more of the recipe" }, { status: 400 });
      content = buildUserText({ kind: "text", text: text.slice(0, 40_000) });
    } else if (src.kind === "image") {
      if (!src.data_base64 || src.data_base64.length > MAX_IMAGE_B64) {
        return NextResponse.json({ error: "Image too large — try a smaller photo" }, { status: 400 });
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(src.media_type)) {
        return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
      }
      content = [
        { type: "image", source: { type: "base64", media_type: src.media_type, data: src.data_base64 } },
        { type: "text", text: IMAGE_INSTRUCTION },
      ];
    } else {
      return NextResponse.json({ error: "unknown source kind" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Could not fetch that page (${msg}). Paste the text instead.` }, { status: 422 });
  }

  const client = new Anthropic({ timeout: 100_000, maxRetries: 1 });
  try {
    const msg = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: zodOutputFormat(RecipeDraftSchema) },
    });
    if (msg.stop_reason === "refusal") {
      return NextResponse.json({ error: "The model declined to process that input" }, { status: 422 });
    }
    const draft = msg.parsed_output;
    if (!draft) {
      return NextResponse.json({ error: "Could not structure that recipe — try pasting cleaner text" }, { status: 502 });
    }
    if (media && media.platform !== "web") draft.source_url = media.url;
    else if (src.kind === "url" && !draft.source_url) draft.source_url = src.url;

    const parsed = draft.ingredients.map((line) => parseIngredient(`- ${line}`));
    const unparsed = parsed.filter((p) => !p.scalable && !p.to_taste).length;
    if (unparsed > 0) warnings.push(`${unparsed} ingredient line${unparsed === 1 ? "" : "s"} will not scale — fix the quantity or mark "to taste".`);

    const out: Ok = {
      draft,
      parsed,
      warnings,
      media,
      usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens },
    };
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Extraction failed: ${msg}` }, { status: 502 });
  }
}
