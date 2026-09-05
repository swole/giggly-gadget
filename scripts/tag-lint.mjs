// Audit recipe tagging straight against Notion, and apply the mechanical fixes.
//   node --env-file=.env.local scripts/tag-lint.mjs                          report
//   node --env-file=.env.local scripts/tag-lint.mjs --fix                    apply every mechanical fix
//   node --env-file=.env.local scripts/tag-lint.mjs --fix --only side-without-tag
//   node --env-file=.env.local scripts/tag-lint.mjs --add-tag "Side Dish" --titles list.txt   (one title per line: the judgment calls)
// The rules live in lib/tag-lint.ts (node strips the types); the sync runs the same ones.
// After any change run a sync (GET /api/sync-now?force=0) so Supabase picks it up.
import { Client } from "@notionhq/client";
import { readFileSync } from "node:fs";
import { lintRecipe } from "../lib/tag-lint.ts";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const token = process.env.NOTION_TOKEN;
const ds = process.env.NOTION_RECIPES_DATA_SOURCE_ID;
if (!token || !ds) { console.error("NOTION_TOKEN / NOTION_RECIPES_DATA_SOURCE_ID missing (run with --env-file=.env.local)"); process.exit(1); }
const notion = new Client({ auth: token });

const sel = (p, k) => p?.[k]?.select?.name ?? null;
const multi = (p, k) => (p?.[k]?.multi_select ?? []).map((o) => o.name);
const num = (p, k) => p?.[k]?.number ?? null;
const titleOf = (p) => (p?.Title?.title ?? []).map((t) => t.plain_text).join("").trim();

async function loadAll() {
  const out = [];
  let cursor;
  do {
    const res = await notion.dataSources.query({ data_source_id: ds, page_size: 100, start_cursor: cursor });
    for (const page of res.results) {
      const p = page.properties ?? {};
      out.push({ id: page.id, input: { title: titleOf(p), meal_type: sel(p, "Meal Type"), cuisine: sel(p, "Cuisine"), tags: multi(p, "Tags"), prep_min: num(p, "Prep Time"), cook_min: num(p, "Cook Time"), source: sel(p, "Source") } });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

async function setTags(page, tags) {
  await notion.pages.update({ page_id: page.id, properties: { Tags: { multi_select: tags.map((name) => ({ name })) } } });
  await new Promise((r) => setTimeout(r, 350)); // stay under Notion's 3 requests per second
}

const pages = await loadAll();
const only = opt("--only");
const addTag = opt("--add-tag");

if (addTag) {
  const file = opt("--titles");
  if (!file) { console.error("--add-tag needs --titles <file>"); process.exit(1); }
  const wanted = readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const byTitle = new Map(pages.map((p) => [p.input.title.toLowerCase(), p]));
  let done = 0;
  for (const t of wanted) {
    const page = byTitle.get(t.toLowerCase());
    if (!page) { console.log(`  ? not found: ${t}`); continue; }
    const tags = page.input.tags ?? [];
    if (tags.includes(addTag)) { console.log(`  = already: ${t}`); continue; }
    await setTags(page, [...tags, addTag]);
    console.log(`  + ${addTag}: ${t}`);
    done++;
  }
  console.log(`tagged ${done} of ${wanted.length}`);
  process.exit(0);
}

let findings = 0, fixed = 0;
const byCode = {};
for (const page of pages) {
  const fs = lintRecipe(page.input);
  if (fs.length === 0) continue;
  for (const f of fs) byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  findings += fs.length;
  console.log(page.input.title);
  for (const f of fs) console.log(`   - [${f.code}] ${f.message}`);
  if (!flag("--fix")) continue;
  const applicable = fs.filter((f) => f.fix && (!only || f.code === only));
  if (applicable.length === 0) continue;
  let tags = page.input.tags ?? [];
  for (const f of applicable) {
    for (const t of f.fix.removeTags ?? []) tags = tags.filter((x) => x !== t);
    for (const t of f.fix.addTags ?? []) if (!tags.includes(t)) tags = [...tags, t];
  }
  await setTags(page, tags);
  console.log(`   fixed: [${tags.join(", ")}]`);
  fixed++;
}
console.log(`\n${pages.length} pages · ${findings} findings · ${fixed} pages fixed`);
console.log(Object.entries(byCode).map(([k, v]) => `${k}: ${v}`).join(" · "));
