// Recipes that live in videos: YouTube (incl. Shorts, youtu.be), TikTok (incl. vm./vt. short links).
// The watch page is useless to a text extractor (JS-rendered), so we pull what the platforms
// expose without a login — oEmbed (title/author/thumbnail), the video description or caption,
// and YouTube captions when they are available — and hand that to Claude with a video-aware prompt.
// Pure helpers (detectVideo, parsers) are unit-tested; the fetchers run on the server only.

export type VideoRef =
  | { platform: "youtube"; id: string; url: string }
  | { platform: "tiktok"; url: string; short: boolean }
  | { platform: "instagram"; url: string }
  | { platform: "facebook"; url: string };

import { fetchPageText, type RecipeJsonLd } from "./fetch-page";

export type VideoInfo = {
  platform: "youtube" | "tiktok";
  url: string; // canonical
  title: string | null;
  author: string | null;
  thumbnail_url: string | null; // stable (YouTube) or null (TikTok thumbnails expire)
  description: string | null; // YouTube description / TikTok caption
  transcript: string | null; // YouTube captions when available (YouTube gates these hard; best effort)
  duration_s: number | null;
  linked_recipe: { url: string; title: string | null; jsonld: RecipeJsonLd } | null; // "Get the recipe: …" link with schema.org data
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Recognise a video URL. Null for ordinary web pages. */
export function detectVideo(raw: string): VideoRef | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0] ?? "";
    return YT_ID.test(id) ? { platform: "youtube", id, url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    let id = u.searchParams.get("v") ?? "";
    if (!id) {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      id = m?.[1] ?? "";
    }
    return YT_ID.test(id) ? { platform: "youtube", id, url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host === "tiktok.com") {
    return { platform: "tiktok", url: u.toString(), short: /^\/t\//.test(u.pathname) };
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return { platform: "tiktok", url: u.toString(), short: true };
  }
  if (host === "instagram.com" && /^\/(p|reel|reels|tv)\//.test(u.pathname)) {
    return { platform: "instagram", url: u.toString() };
  }
  if ((host === "facebook.com" || host === "fb.watch") && /reel|watch|video/.test(u.toString())) {
    return { platform: "facebook", url: u.toString() };
  }
  return null;
}

/** First http(s) URL inside free text (share sheets often put the link in `text`). */
export function firstUrlIn(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  return m ? m[0].replace(/[.,;:!?]+$/, "") : null;
}

/** Human label for the Add screen. */
export function platformLabel(p: VideoRef["platform"]): string {
  return p === "youtube" ? "YouTube" : p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "Facebook";
}

// ───────────────────────── parsers (pure) ─────────────────────────

/** Pull the `ytInitialPlayerResponse = {...}` object out of a YouTube watch page. */
export function extractPlayerResponse(html: string): Record<string, unknown> | null {
  const marker = html.indexOf("ytInitialPlayerResponse");
  if (marker < 0) return null;
  const start = html.indexOf("{", marker);
  if (start < 0) return null;
  const json = balancedJson(html, start);
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Scan from `start` (an opening brace) to its matching close brace, string-aware. */
export function balancedJson(s: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string; name?: string };

export function captionTracksFrom(player: Record<string, unknown> | null): CaptionTrack[] {
  const captions = player?.captions as Record<string, unknown> | undefined;
  const renderer = captions?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
  const tracks = renderer?.captionTracks;
  if (!Array.isArray(tracks)) return [];
  return tracks
    .map((t) => {
      const o = t as Record<string, unknown>;
      const name = o.name as { simpleText?: string; runs?: { text: string }[] } | undefined;
      return {
        baseUrl: String(o.baseUrl ?? ""),
        languageCode: String(o.languageCode ?? ""),
        kind: typeof o.kind === "string" ? o.kind : undefined,
        name: name?.simpleText ?? name?.runs?.map((r) => r.text).join("") ?? undefined,
      };
    })
    .filter((t) => t.baseUrl);
}

/** Prefer a human English track, then auto English, then anything English-ish, then the first track. */
export function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const en = (t: CaptionTrack) => /^en\b/i.test(t.languageCode);
  return (
    tracks.find((t) => en(t) && t.kind !== "asr") ??
    tracks.find((t) => en(t)) ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0]
  );
}

/** YouTube timedtext XML (`<text start=".." dur="..">..</text>`) → plain text. */
export function captionsXmlToText(xml: string): string {
  const out: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const t = decodeEntities(m[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out.join(" ");
}

/** YouTube json3 captions (`{events:[{segs:[{utf8}]}]}`) → plain text. */
export function captionsJson3ToText(json: string): string {
  try {
    const o = JSON.parse(json) as { events?: { segs?: { utf8?: string }[] }[] };
    const parts: string[] = [];
    for (const e of o.events ?? []) {
      for (const s of e.segs ?? []) if (s.utf8 && s.utf8 !== "\n") parts.push(s.utf8);
    }
    return parts.join("").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** TikTok page JSON (`__UNIVERSAL_DATA_FOR_REHYDRATION__`) → caption + author, best effort. */
export function tiktokDetailFrom(html: string): { desc: string | null; author: string | null; id: string | null } | null {
  const m = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]) as Record<string, unknown>;
    const scope = o.__DEFAULT_SCOPE__ as Record<string, unknown> | undefined;
    const detail = scope?.["webapp.video-detail"] as Record<string, unknown> | undefined;
    const info = detail?.itemInfo as Record<string, unknown> | undefined;
    const item = info?.itemStruct as Record<string, unknown> | undefined;
    if (!item) return null;
    const author = item.author as Record<string, unknown> | undefined;
    return {
      desc: typeof item.desc === "string" ? item.desc : null,
      author: typeof author?.nickname === "string" ? (author.nickname as string) : null,
      id: typeof item.id === "string" ? (item.id as string) : null,
    };
  } catch {
    return null;
  }
}

const NOT_RECIPE_HOSTS =
  /(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com|fb\.com|twitter\.com|x\.com|threads\.net|patreon\.com|amazon\.[a-z.]+|amzn\.to|spotify\.com|apple\.com|discord\.(gg|com)|twitch\.tv|pinterest\.com|linktr\.ee|paypal\.com|ko-fi\.com|buymeacoffee\.com|shopee\.[a-z.]+|lazada\.[a-z.]+|shop\.app|teespring\.com|spreadshirt\.com|t\.me|wa\.me|snapchat\.com|reddit\.com|google\.com|goo\.gl|play\.google\.com|apps\.apple\.com|bit\.ly)$/i;

/** Links in a video description that might be the written recipe ("Get the recipe: …"). Ordered, deduped, max 3. */
export function linkedRecipeCandidates(description: string | null | undefined): string[] {
  if (!description) return [];
  const seen = new Set<string>();
  const scored: { url: string; score: number; idx: number }[] = [];
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  description.split(/\r?\n/).forEach((line, idx) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const raw = m[0].replace(/[.,;:!?)]+$/, "");
      let host = "";
      try {
        host = new URL(raw).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (!host || NOT_RECIPE_HOSTS.test(host)) continue;
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const score = (/recipe|ingredients|method|full/i.test(line) ? 2 : 0) + (/recipe/i.test(raw) ? 1 : 0);
      scored.push({ url: raw, score, idx });
    }
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, 3).map((s) => s.url);
}

/** Fetch the first linked page that carries schema.org/Recipe data. Mutates and returns info. */
export async function enrichWithLinkedRecipe(info: VideoInfo): Promise<VideoInfo> {
  for (const url of linkedRecipeCandidates(info.description)) {
    try {
      const page = await fetchPageText(url);
      if (page.jsonld && (page.jsonld.recipeIngredient?.length ?? 0) > 0) {
        info.linked_recipe = { url: page.url, title: page.title, jsonld: page.jsonld };
        return info;
      }
    } catch {
      // try the next candidate
    }
  }
  return info;
}

// ───────────────────────── fetchers (server) ─────────────────────────

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MAX_TRANSCRIPT = 24_000;

async function fetchText(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 8_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T | null> {
  const txt = await fetchText(url, init);
  if (!txt) return null;
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

type OEmbed = { title?: string; author_name?: string; thumbnail_url?: string };

export async function fetchYouTube(id: string): Promise<VideoInfo> {
  const url = `https://www.youtube.com/watch?v=${id}`;
  const info: VideoInfo = {
    platform: "youtube",
    url,
    title: null,
    author: null,
    thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    description: null,
    transcript: null,
    duration_s: null,
    linked_recipe: null,
  };

  // 1. oEmbed — reliable, no key: title, channel, thumbnail.
  const oe = await fetchJson<OEmbed>(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  if (oe) {
    info.title = oe.title ?? null;
    info.author = oe.author_name ?? null;
  }

  // 2. Watch page → ytInitialPlayerResponse: full description + caption tracks.
  let player: Record<string, unknown> | null = null;
  const html = await fetchText(`${url}&hl=en&bpctr=9999999999&has_verified=1`, {
    headers: {
      "user-agent": DESKTOP_UA,
      "accept-language": "en-US,en;q=0.9",
      cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAI",
    },
    timeoutMs: 9_000,
  });
  if (html) player = extractPlayerResponse(html);

  // 3. Innertube (ANDROID client) as a fallback — often works when the web page is gated.
  if (!player || !(player.videoDetails as Record<string, unknown> | undefined)?.shortDescription) {
    const alt = await fetchJson<Record<string, unknown>>(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
          "x-youtube-client-name": "3",
          "x-youtube-client-version": "19.09.37",
        },
        body: JSON.stringify({
          videoId: id,
          contentCheckOk: true,
          racyCheckOk: true,
          context: { client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30, hl: "en", gl: "SG" } },
        }),
        timeoutMs: 9_000,
      },
    );
    if (alt && (alt.videoDetails as Record<string, unknown> | undefined)?.shortDescription) player = alt;
    else if (!player && alt) player = alt;
  }

  const vd = (player?.videoDetails ?? {}) as Record<string, unknown>;
  if (typeof vd.title === "string" && !info.title) info.title = vd.title;
  if (typeof vd.author === "string" && !info.author) info.author = vd.author;
  if (typeof vd.shortDescription === "string" && vd.shortDescription.trim()) info.description = vd.shortDescription.trim();
  if (typeof vd.lengthSeconds === "string" || typeof vd.lengthSeconds === "number") info.duration_s = Number(vd.lengthSeconds) || null;

  // Prefer the big thumbnail when YouTube has one (HEAD is cheap; 404 means it does not exist).
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3_000);
    const head = await fetch(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, { method: "HEAD", signal: controller.signal });
    clearTimeout(t);
    if (head.ok) info.thumbnail_url = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  } catch {}

  // 4. Captions — best effort. Datacenter IPs are sometimes refused; the description alone is still useful.
  const track = pickCaptionTrack(captionTracksFrom(player));
  if (track) {
    const sep = track.baseUrl.includes("?") ? "&" : "?";
    const xml = await fetchText(track.baseUrl, { headers: { "user-agent": DESKTOP_UA }, timeoutMs: 8_000 });
    let text = xml ? captionsXmlToText(xml) : "";
    if (!text) {
      const j3 = await fetchText(`${track.baseUrl}${sep}fmt=json3`, { headers: { "user-agent": DESKTOP_UA }, timeoutMs: 8_000 });
      text = j3 ? captionsJson3ToText(j3) : "";
    }
    if (text) info.transcript = text.length > MAX_TRANSCRIPT ? text.slice(0, MAX_TRANSCRIPT) + " …" : text;
  }

  return info;
}

/** Follow vm./vt. short links to the canonical /@user/video/<id> URL (max 4 hops, TikTok hosts only). */
export async function resolveTikTokUrl(url: string): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current);
    if (/(^|\.)tiktok\.com$/.test(u.hostname) && /\/video\/\d+/.test(u.pathname)) return stripTracking(current);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": DESKTOP_UA, accept: "text/html" },
      });
      const loc = res.headers.get("location");
      if (!loc) return stripTracking(current);
      current = new URL(loc, current).toString();
    } catch {
      return stripTracking(current);
    } finally {
      clearTimeout(t);
    }
  }
  return stripTracking(current);
}

function stripTracking(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

export async function fetchTikTok(inputUrl: string): Promise<VideoInfo> {
  const url = await resolveTikTokUrl(inputUrl);
  const info: VideoInfo = {
    platform: "tiktok",
    url,
    title: null,
    author: null,
    thumbnail_url: null, // TikTok CDN thumbnails carry x-expires; do not persist them
    description: null,
    transcript: null,
    duration_s: null,
    linked_recipe: null,
  };

  const oe = await fetchJson<OEmbed>(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
    headers: { "user-agent": DESKTOP_UA },
  });
  if (oe) {
    info.title = oe.title ?? null; // oEmbed title is the caption
    info.author = oe.author_name ?? null;
    info.description = oe.title ?? null;
  }

  // Best effort: the page JSON carries the untruncated caption.
  const html = await fetchText(url, {
    headers: { "user-agent": DESKTOP_UA, accept: "text/html", "accept-language": "en-US,en;q=0.9" },
    timeoutMs: 8_000,
  });
  const detail = html ? tiktokDetailFrom(html) : null;
  if (detail?.desc && detail.desc.length >= (info.description?.length ?? 0)) info.description = detail.desc;
  if (detail?.author && !info.author) info.author = detail.author;

  return info;
}
