<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Giggly Gadget - project context

A household meal-planning PWA for Johnny, Lydia and their live-in helper (from 2026-08-23). Recipes are authored in Notion (or added in-app via Claude), mirrored to Supabase, and served by a Next.js frontend on Vercel. Notion is the recipe source of truth; the weekly plan and grocery list live in Supabase only.

## Stack

- **Next.js 16.2.6** (App Router) + **React 19** - see the warning above; `cookies()` is async and writable only in route handlers; `params`/`searchParams` are Promises.
- **Supabase** (Postgres + Realtime) - read model, parsed ingredients, planned meals, grocery list. Project ref `gmmnitdrczsiqqaupxed`.
- **Notion** - master recipe store. Database `🍳 .Recipes`.
- **Vercel** - hosting + cron. Project `giggly-gadget`, https://giggly-gadget.vercel.app. Functions run in **UTC** - never use `new Date().getDay()`/`toISOString().slice(0,10)` for "today"; use `lib/week.ts`.
- **Pexels** - stock food photos at sync time.
- **Anthropic SDK** - `/api/recipes/extract` (add-a-meal). Model `claude-sonnet-5` via `messages.parse` + `zodOutputFormat`.
- **Tailwind v4**, tokens in `app/globals.css` `@theme`, used as `text-[var(--color-ink)]`. Fonts Fraunces (display) + Inter Tight.

## Data flow

```
Notion (🍳 .Recipes) ──sync──▶ Supabase recipes + ingredients_parsed ──▶ UI
        ▲   ▲                          planned_meals ◀── /plan, /api/plan/*   (Realtime)
        │   └── /api/recipes/create    grocery_list  ◀── /api/grocery/build  (Realtime)
        └── write-back (Want to Try, Rating)            pantry_staples, cook_log
```

- **Sync** (`lib/notion-sync.ts`): `syncRecipesFromNotion({force})` walks every page; `syncRecipePage(id)` does one (used right after in-app create, retried by `POST /api/recipes/[id]/sync`). Body → `instructions_md` + `ingredients_parsed`; image = external page cover (set by video/web imports) > existing `image_url` > Pexels; `Source=Reference` rows are deleted; recipes that vanished from Notion are removed after a complete walk (capped at 20% of the set); an ingredients insert failure nulls `notion_updated_at` so the next sync retries.
- **Triggers:** `POST/GET /api/sync-now?force=0|1` (unauthenticated) and `GET /api/cron/notion-sync` (daily 16:00 UTC, `CRON_SECRET`). Maintenance routes (`clear-images`, `clear-want-to-try`, `enrich-images`, `recategorize`, `debug-parse`, `peek-md`) need `?secret=<CRON_SECRET>` (`secretGate`).
- **Grocery follows the plan automatically:** every plan mutation (`/api/plan/meals*`, `fill`, `copy`) calls `scheduleGroceryRebuild(week)` (`lib/grocery/auto-build.ts`, Next `after()`), which runs `buildWeekGroceries` once the response is out. "Rebuild from plan" on `/grocery` is only a manual refresh.
- **Write-back:** `want_to_try` / `rating` go to Supabase *and* Notion (`Promise.allSettled`).

## Roles (who is on this phone)

Open URL, no login. `POST /api/role {role}` sets an httpOnly cookie `gg_role` = `johnny | lydia | helper` (400 days). `lib/role.ts` (client-safe) + `lib/role.server.ts` (`getRole()` via `await cookies()`). The root layout reads it and mounts `RoleProvider` + `TabBar` + `RolePicker`. Planners (johnny/lydia) see Kitchen · Plan · Grocery · Recipes · Add; the helper sees Kitchen · Grocery · Recipes, never sees Rating/WantToTry (Notion write-back) and gets a read-only planner. The role stamps `added_by` / `checked_by` / `cooked_by`. It is hidden-not-locked by design, except for routes that spend money or write Notion / wipe data, which check `plannerGate(req)` (`/api/recipes/{extract,create}`, `[id]/{rating,want-to-try,sync}`, `/api/plan/{fill,copy}`, `/api/grocery/{build,clear}`). The cookie is mintable, so this stops accidents, not attackers; the URL is unlisted.

## Pages

| Route | What |
|---|---|
| `/` | **Kitchen** - today's meals (big cards: Cook ▸ → cook mode, Recipe, Mark cooked with an 8 s Undo / tap-to-un-mark, notes for the cook, progress ring), tomorrow (+ "Tonight" prep hints), the rest of the week. Refreshes itself when the SG date rolls over. `/kitchen` redirects here. |
| `/plan?week=YYYY-MM-DD` | Week planner Mon–Sat (+Sun collapsed as rest day). Slot → picker (search, chips, Leftovers tab). Tap J+L to cycle eaters; ⋯ on a chip = note for the cook / open / remove (Undo toast). Constraint chips (oily fish ≥3, chicken ≤1, prawn/seafood ≤2), per-day protein J/L, ⋯ Actions (fill from rotation, copy last week - "replace" asks first), Print. |
| `/plan/print?week=` | One A4: week table + shopping list by shop. |
| `/grocery?week=` | Shopping list. By shop (wet market / supermarket / either) or by aisle; progress bar + all-bought state; pantry staples hidden; free-text add (anyone); rebuild / clear / staple edits (planners). Refetches on reconnect and when the phone wakes. |
| `/recipes`, `/recipes/[id]`, `/recipes/[id]/cook` | Discover (paginated cards, was `/`), detail (household Both/Johnny/Lydia scale mode; `?eaters=&pm=` from the planner; **Plan this** sheet → day/slot/eaters; `?new=1` opens it as a nudge after create; "Watch the video" when `source_url` is a video), cook mode (posts `planned_meal_id`; timer tray stacks above the footer; audio context created on the timer tap). |
| `/add` | Claude-assisted add-a-meal: link (recipe site, **YouTube, TikTok**, short links), pasted text, or photo → draft → edit → create in Notion → sync → recipe page (+ Plan-this nudge). Planners only. `/add?url=` auto-runs (Android share sheet via `manifest.json` `share_target`; iOS = copy link → Paste button). Videos: oEmbed + description/caption (+ the recipe page the description links to, when it has schema.org data; YouTube captions are gated by YouTube and rarely available); the thumbnail becomes the Notion cover → `image_url`. Instagram/Facebook cannot be read: the UI says to paste the caption or screenshot it. |

## Tables (see `supabase/migrations/`)

- `recipes`, `ingredients_parsed` (unchanged) - `ingredients_parsed.category ∈ produce|protein|dairy|pantry|spice|grain|other`.
- `planned_meals`: `planned_for date`, `slot` (breakfast|lunch|dinner|snack), `eaters` (both|johnny|lydia), `position`, `note`, `cooked_at/by`, `leftover_of` (self FK, no shopping), **`week_of` generated** = Monday of `planned_for` (never insert it). Unique `(planned_for, slot, recipe_id)`. Realtime filter `week_of=eq.<monday>`.
- `grocery_list`: + `source` (`plan` only written by the builder; default `manual`), `shop` (wet_market|supermarket|either), `staple`, `added_by`. Unique `(week_of, name, unit)` - NULL units are distinct, so the builder reconciles in JS (upsert would mis-match them).
- `pantry_staples(name pk)` - seeded from the kitchen manual; `/api/staples` edits it.
- `REPLICA IDENTITY FULL` on planned_meals + grocery_list (needed for filtered DELETE events).
- Migrations are applied by hand in the Supabase SQL editor; verify the live schema before DDL (`recipes.source` existed in prod before any migration).

## Video / web import (lib/extract/)

`detectVideo(url)` → youtube | tiktok | instagram | facebook | null. `fetchYouTube(id)` (oEmbed → watch-page `ytInitialPlayerResponse` description → innertube fallback → captions best effort), `fetchTikTok(url)` (resolve vm./vt. short links → oEmbed caption → page JSON), `enrichWithLinkedRecipe(info)` fetches "Get the recipe: …" links for JSON-LD. `fetchPageText` refuses private hosts (`isPrivateHost`), follows redirects by hand, checks content-type / size, returns `image_url` (schema.org image / og:image). `buildVideoText` is the video prompt (estimates go in `notes`). Right-sized thumbnails via `lib/images.ts#thumb` (Pexels params, YouTube sizes).

## Portions (lib/portions.ts)

Recipes are written for Johnny + Lydia together (`Servings = 2`). Plate split 3:2 on protein and grains, equal otherwise. `eatersFactor(eaters, category)`: both→1; johnny→0.6 protein/grain, 0.5 else; lydia→0.4 / 0.5. Never divide by servings. The heart-healthy recipes carry the split per line in the modifier (`J 250 / L 165`) and `Protein 42 g / 28 g` in Notes (read by `lib/plan/hints.ts`).

## Ingredient line grammar (the sync parser is strict)

`<qty>[-<qty>] [<unit>] <name>[, <modifier>]` - qty first; units only from `lib/ingredients/parse.ts` UNIT_MAP; name = everything before the first comma; **parentheticals are stripped** (put notes after a comma); `, to taste` marks unscalable; a line with no leading number is kept for display but never shopped for. `lib/extract/prompt.ts` teaches Claude this grammar; `lib/notion-writer.ts` round-trips it (tested).

## Grocery builder (lib/grocery/build.ts)

planned_meals (week, non-leftover) × ingredients_parsed × `eatersFactor` → `buildGroceryList()` (unit-converting merge, `lib/ingredients/normalize.ts`) → `isStaple` + `shopFor` → `reconcileGrocery()` (keeps ids, checked state, manual rows; un-checks when qty rises) → apply. Reports `recipes_without_ingredients` so a thin list is never silent.

## Rotation (lib/plan/rotation.ts)

The three-week heart-healthy rotation keyed by Notion page id (title fallback). `rotationWeekFor(monday)` cycles from anchor 2026-08-24 = week 1. `POST /api/plan/fill {week_of, rotation_week, mode}`.

## Commands

```bash
npm run dev                # http://localhost:3000 (dev server for the Browser pane: .claude/launch.json "giggly-gadget" → :3010)
npm run build              # production build
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/jest   # use the local binary - a stray global jest cannot find @swc/jest
vercel --prod --yes        # deploy
```
`WebFetch`/curl `https://giggly-gadget.vercel.app/api/sync-now?force=0&cb=<n>` - WebFetch caches a URL for 15 min, cache-bust when re-running.

## Working across machines

**Git is the source of truth.** Remote `github.com/swole/giggly-gadget`. The working clone lives at **`C:\Users\johnn\code\giggly-gadget`** (non-OneDrive; jest cannot load `@swc/jest` from the `Yum! Brands, Inc` OneDrive path and OneDrive churns `node_modules`). The copy under `9. Claude/projects/giggly-gadget` is kept clean with no `node_modules`; `git pull` it if you need it there. New machine: clone → `npm install` → `vercel env pull .env.local` → copy `.vercel/` if missing.

## Env vars (names only - values via `vercel env pull`)

`NOTION_TOKEN`, `NOTION_RECIPES_DATA_SOURCE_ID`, `NOTION_RECIPES_DB_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PEXELS_API_KEY`, `CRON_SECRET`, **`ANTHROPIC_API_KEY`** (required by `/api/recipes/extract`; optional `CLAUDE_MODEL`). `APP_SECRET` / `NEXT_PUBLIC_APP_SECRET` are unused.

## Key files

| Path | Purpose |
|------|---------|
| `lib/week.ts` | APP_TZ date helpers - every "today"/"this week" decision |
| `lib/role.ts`, `lib/role.server.ts`, `app/api/role/route.ts` | Role cookie |
| `lib/plan/{types,queries,usePlannedMeals,analysis,constraints,hints,rotation}.ts` | Planner data, realtime hook, per-recipe analysis, rotation |
| `app/api/plan/meals/…`, `app/api/plan/{fill,copy}/route.ts` | Plan mutations |
| `lib/grocery/{build,reconcile,shop,staples,labels}.ts`, `app/api/grocery/{build,manual,add,clear}/route.ts`, `app/api/staples/route.ts` | Grocery |
| `lib/portions.ts`, `lib/scale.ts` | Household scaling |
| `lib/recipe-draft.ts`, `lib/extract/{fetch-page,video,prompt}.ts`, `lib/notion-writer.ts`, `app/api/recipes/{extract,create}/route.ts`, `app/api/recipes/[id]/sync/route.ts`, `components/add/AddMealFlow.tsx` | Add-a-meal (web + video) |
| `lib/grocery/auto-build.ts` | Grocery list follows the plan (after()) |
| `components/plan/PlanThisSheet.tsx`, `components/kitchen/MarkCookedButton.tsx`, `app/api/cook-log/route.ts` | Plan-this from a recipe; cook / un-cook |
| `app/loading.tsx`, `app/error.tsx` | Route skeleton + error screen (note: content reveals on requestAnimationFrame - a hidden/background tab shows the skeleton until visible) |
| `components/plan/*`, `components/kitchen/*`, `components/nav/TabBar.tsx`, `components/role/*` | UI |
| `lib/notion-sync.ts`, `lib/notion.ts`, `lib/recipes.ts`, `lib/ingredients/*` | Sync + parsing |
| `supabase/migrations/0001…0003` | Schema |
