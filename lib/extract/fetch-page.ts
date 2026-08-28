// Fetch a recipe web page and reduce it to what Claude needs: the schema.org/Recipe
// JSON-LD block when the site has one (most recipe sites do) plus the readable text.

export type RecipeJsonLd = {
  name?: string;
  description?: string;
  recipeIngredient?: string[];
  recipeInstructions?: unknown;
  recipeYield?: unknown;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeCuisine?: unknown;
  recipeCategory?: unknown;
  keywords?: unknown;
  image?: unknown;
};

export type FetchedPage = {
  url: string;
  title: string | null;
  jsonld: RecipeJsonLd | null;
  text: string;
  image_url: string | null; // schema.org image or og:image (https only) — becomes the recipe's cover
};

const MAX_BYTES = 1_500_000;
const MAX_TEXT = 40_000;

/** Hosts we must never fetch from a server: loopback, link-local, RFC1918, IPv6 private, internal names. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (h.includes(":")) {
    const v6 = h.replace(/^\[|\]$/g, "");
    return v6 === "::1" || v6 === "::" || /^f[cd][0-9a-f]{2}:/i.test(v6) || /^fe[89ab][0-9a-f]:/i.test(v6) || /^::ffff:/i.test(v6);
  }
  return false;
}

/** http(s) only, public host only. Throws a user-facing message otherwise. */
export function assertFetchableUrl(raw: string): URL {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("only http(s) links can be read");
  if (isPrivateHost(u.hostname)) throw new Error("that address is not reachable from here");
  return u;
}

export async function fetchPageText(url: string): Promise<FetchedPage> {
  let current = assertFetchableUrl(url).toString();
  let html = "";
  const headers = {
    "user-agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-SG,en;q=0.9",
  };
  // Follow redirects by hand so every hop is re-validated (no bouncing into a private address).
  for (let hop = 0; hop < 5; hop++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(current, { signal: controller.signal, redirect: "manual", headers });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error(`HTTP ${res.status}`);
        current = assertFetchableUrl(new URL(loc, current).toString()).toString();
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
      if (ctype && !/text\/html|application\/xhtml|application\/xml|text\/plain|application\/json/.test(ctype)) {
        throw new Error(`that link is a ${ctype.split(";")[0]} file, not a web page`);
      }
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > 8_000_000) throw new Error("page too large");
      html = await readCapped(res, MAX_BYTES);
      break;
    } finally {
      clearTimeout(t);
    }
  }

  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim() || null;
  const jsonld = extractRecipeJsonLd(html);
  const text = htmlToText(html).slice(0, MAX_TEXT);
  const image_url = jsonld ? jsonLdImage(jsonld.image) : null;
  const og = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ?? null;
  return { url: current, title, jsonld, text, image_url: image_url ?? (og && /^https:\/\//.test(og) ? og : null) };
}

/** Read at most `cap` bytes of the body, then stop (no buffering a 200 MB file). */
async function readCapped(res: Response, cap: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  try {
    await reader.cancel();
  } catch {}
  const buf = new Uint8Array(Math.min(total, cap));
  let off = 0;
  for (const c of chunks) {
    const n = Math.min(c.byteLength, buf.length - off);
    buf.set(c.subarray(0, n), off);
    off += n;
    if (off >= buf.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/** schema.org image can be a string, an array, or an ImageObject. Only keep https URLs. */
export function jsonLdImage(img: unknown): string | null {
  const pick = (n: unknown): string | null => {
    if (!n) return null;
    if (typeof n === "string") return /^https:\/\//.test(n) ? n : null;
    if (Array.isArray(n)) {
      for (const x of n) {
        const r = pick(x);
        if (r) return r;
      }
      return null;
    }
    if (typeof n === "object") {
      const o = n as Record<string, unknown>;
      return pick(o.url) ?? pick(o.contentUrl);
    }
    return null;
  };
  return pick(img);
}

export function extractRecipeJsonLd(html: string): RecipeJsonLd | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const found = findRecipe(parsed);
    if (found) return found;
  }
  return null;
}

function findRecipe(node: unknown, depth = 0): RecipeJsonLd | null {
  if (!node || depth > 4) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    const type = o["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === "string" && /recipe/i.test(t))) return o as RecipeJsonLd;
    if (Array.isArray(o["@graph"])) return findRecipe(o["@graph"], depth + 1);
    for (const k of ["mainEntity", "mainEntityOfPage", "itemListElement"]) {
      if (o[k]) {
        const r = findRecipe(o[k], depth + 1);
        if (r) return r;
      }
    }
  }
  return null;
}

/** Crude but serviceable: strip scripts/styles/nav, collapse whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|footer|header|aside|form|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&frac12;/g, "½")
    .replace(/&frac14;/g, "¼")
    .replace(/&frac34;/g, "¾")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** "PT1H30M" → 90 */
export function isoDurationToMinutes(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const d = Number(m[1] ?? 0), h = Number(m[2] ?? 0), min = Number(m[3] ?? 0);
  const total = d * 1440 + h * 60 + min;
  return total > 0 ? total : null;
}

/** Flatten schema.org recipeInstructions (strings, HowToStep, HowToSection) into step strings. */
export function flattenInstructions(ins: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!n) return;
    if (typeof n === "string") {
      out.push(n.trim());
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n === "object") {
      const o = n as Record<string, unknown>;
      if (typeof o.text === "string") out.push(o.text.trim());
      else if (Array.isArray(o.itemListElement)) walk(o.itemListElement);
    }
  };
  walk(ins);
  return out.filter(Boolean);
}
