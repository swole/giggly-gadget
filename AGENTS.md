<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Giggly Gadget — project context

A personal recipe app (PWA). Recipes are authored in Notion, mirrored to Supabase for fast querying, and served by a Next.js frontend on Vercel. Notion is the source of truth; the app reads from Supabase and writes a couple of fields back to both.

## Stack

- **Next.js 16.2.6** (App Router) + **React 19** — see the warning above; read `node_modules/next/dist/docs/` before writing framework code.
- **Supabase** (Postgres) — read model + parsed ingredients. Project ref `gmmnitdrczsiqqaupxed`.
- **Notion** — master recipe store. Database `🍳 .Recipes`.
- **Vercel** — hosting + cron. Project `giggly-gadget`, aliased to https://giggly-gadget.vercel.app.
- **Pexels** — stock food photos (auto-enrichment at sync time).
- **Anthropic SDK** — V1.1 features (`/api/decide`, `/api/substitute`).

## Data flow

```
Notion (🍳 .Recipes)  ──sync──▶  Supabase (recipes + ingredients_parsed)  ──▶  Next.js UI
        ▲                                                                          │
        └───────────────  write-back (Want to Try, Rating)  ◀──────────────────────┘
```

- **Sync** (`lib/notion-sync.ts`): pulls every Notion page, skips unchanged ones by `last_edited_time` unless `force`, parses the markdown body into `instructions_md` + structured `ingredients_parsed`, and enriches `image_url` via Pexels when empty.
- **Triggers:** `POST/GET /api/sync-now?force=0|1` (manual, unauthenticated) and `GET /api/cron/notion-sync` (Vercel cron, guarded by `CRON_SECRET`).
- **Write-back:** the app writes `want_to_try` and `rating` to Supabase *and* Notion in parallel. Last write wins; the next sync reconciles from Notion.

## Notion `.Recipes` schema (the parts that matter)

- IDs (not secret): data source `ae6b7481-e375-4126-93b6-251fb895b4e2`, database `3d9b9e0e-89de-43a2-8df9-3bb66efcb2cd`.
- Properties → Supabase columns are mapped in `lib/notion-sync.ts`. Key ones:
  - **Rating** is a `select` whose option *names are star emoji* — `⭐`, `⭐⭐`, … `⭐⭐⭐⭐⭐`. Supabase stores an int 1–5. Convert with `"⭐".repeat(n)`; clear = `{ select: null }` / `null`.
  - **Want to Try** is a `checkbox`. (In Notion's SQLite layer it serializes as `"__YES__"` / `"__NO__"`.)
  - **Source** select is `Johnny | Claude | Reference`. **`Reference` rows are skipped *and deleted* from Supabase on sync** — never set a real recipe to `Reference`.
  - Other selects: Cuisine, Meal Type, Difficulty; Tags is multi-select; Prep/Cook Time + Servings are numbers; Last Made is a date.
- **Recipe body format** (the sync parser depends on this): an `## Ingredients` section as a **bullet list**, then an `## Instructions` (or Method/Steps/Directions) section as numbered steps. `lib/ingredients/parse.ts` only reads bullet lines (`- …`) that sit between the Ingredients header and the Instructions header.

## Adding a write-back field (the established pattern)

Mirror Want to Try / Rating:
1. `components/<Field>.tsx` — `"use client"`, optimistic state, `revert on failure`, `fetch('/api/recipes/<id>/<field>', {method:'POST'})`.
2. `app/api/recipes/[id]/<field>/route.ts` — `export const runtime = "nodejs"`, `params: Promise<{id}>` then `await params`, update Supabase + Notion via `Promise.allSettled`, surface either error as 500.
3. Mount the component (recipe detail lives in `components/RecipeDetail.tsx`).
Existing examples: `components/WantToTryStar.tsx` + `app/api/recipes/[id]/want-to-try/route.ts`; `components/RatingStars.tsx` + `app/api/recipes/[id]/rating/route.ts`.

## Commands

```bash
npm run dev        # local dev (http://localhost:3000)
npm run build      # production build (run before deploying if unsure)
npx tsc --noEmit   # typecheck
vercel --prod --yes        # deploy current working dir to production
curl -X POST https://giggly-gadget.vercel.app/api/sync-now?force=1   # re-sync from Notion
```

## Working across machines (laptop ⇄ desktop)

**Git is the source of truth, not OneDrive.** Remote: `github.com/swole/giggly-gadget`.

- On a new/other machine: `git clone` (or `git pull`), then `npm install`, then **`vercel env pull .env.local`** to fetch secrets (all 8 prod env vars live on Vercel — `.env*` is gitignored and never committed).
- Commit + push your work before switching machines; pull on the other side. Don't rely on OneDrive to carry code state.
- **OneDrive caveat:** this repo currently sits inside the OneDrive-synced workspace with `node_modules/` on disk. OneDrive will churn those thousands of files and can create `*-DESKTOP-xxxx` / `*-LAPTOP-xxxx` conflict copies — including inside `.git`, which can corrupt the repo if both machines sync concurrently. Prefer cloning this project to a **non-OneDrive path** (e.g. `~/code/giggly-gadget`) and let git do the syncing. If it must stay in OneDrive, only ever have one machine active at a time and never edit during an active sync.

## Env vars (names only — values via `vercel env pull`)

`NOTION_TOKEN`, `NOTION_RECIPES_DATA_SOURCE_ID`, `NOTION_RECIPES_DB_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PEXELS_API_KEY`, `CRON_SECRET`. (`APP_SECRET` / `NEXT_PUBLIC_APP_SECRET` gate the V1.1 `/api/decide` + `/api/substitute` endpoints and aren't set in prod yet.)

## Key files

| Path | Purpose |
|------|---------|
| `lib/notion-sync.ts` | Notion → Supabase sync engine + property mapping |
| `lib/notion.ts` | Notion client + IDs |
| `lib/recipes.ts` | Recipe type, queries, markdown helpers |
| `lib/ingredients/parse.ts` | Ingredient-line parser (depends on body format above) |
| `lib/image-search.ts` | Pexels enrichment (title → cuisine fallback → null; preserves existing image) |
| `components/RecipeDetail.tsx` | Recipe page; mounts write-back controls |
| `components/WantToTryStar.tsx`, `components/RatingStars.tsx` | Write-back UI examples |
| `app/api/recipes/[id]/{want-to-try,rating}/route.ts` | Write-back endpoints |
| `app/api/sync-now/route.ts`, `app/api/cron/notion-sync/route.ts` | Sync triggers |
| `supabase/migrations/` | DB schema (`0001_init.sql`, `0002_image_url.sql`) |
