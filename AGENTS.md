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

- **Sync** (`lib/notion-sync.ts`): `syncRecipesFromNotion({force})` walks every page; `syncRecipePage(id)` does one (used right after in-app create, retried by `POST /api/recipes/[id]/sync`). Body → `instructions_md` + `ingredients_parsed`; image = external page cover (set by video/web imports) > existing `image_url` > Pexels; `Source=Reference` rows are deleted; every upserted page runs through `lib/tag-lint.ts` and the findings come back as `lint: [...]` in the sync JSON; recipes that vanished from Notion are removed after a complete walk (capped at 20% of the set); an ingredients insert failure nulls `notion_updated_at` so the next sync retries.
- **Triggers:** `POST/GET /api/sync-now?force=0|1` (unauthenticated) and `GET /api/cron/notion-sync` (daily 16:00 UTC, `CRON_SECRET`). Maintenance routes (`clear-images`, `clear-want-to-try`, `enrich-images`, `recategorize`, `debug-parse`, `peek-md`) need `?secret=<CRON_SECRET>` (`secretGate`).
- **Grocery follows the plan automatically:** every plan mutation (`/api/plan/meals*`, `fill`, `copy`, `randomize`, `clear`) calls `scheduleGroceryRebuild(week)` (`lib/grocery/auto-build.ts`, Next `after()`), which runs `buildWeekGroceries` once the response is out. "Rebuild from plan" on `/grocery` is only a manual refresh.
- **Randomizer** (`lib/plan/randomize.ts`, pure + tested): `POST /api/plan/randomize` fills empty day+slot cells from a themed pool (`filters`: source / healthy / cuisines / quick / wantToTry / favourites / fiveStar), one main per cell (`ROLL_SLOT_MEAL_TYPES` - no Sides/Desserts), never repeats a recipe in the week while alternatives exist, keeps chicken ≤ 1 and prawn/seafood ≤ 2, boosts oily fish until ≥ 3, nudges away from `last_made` ≤ 10 days. `mode:"replace"` clears un-cooked meals in scope first; `replace_ids` deletes exactly those rows and refills their cells (powers "Roll again" / "Pick another"). Cooked meals are never touched. `POST /api/plan/clear` blanks the week (cooked kept). Both `plannerGate`d.
- **Write-back:** `want_to_try` / `rating` go to Supabase *and* Notion (`Promise.allSettled`). Ratings are 1-5 in HALF-star steps (0005: `recipes.rating numeric(3,1)`); Notion's Rating select names carry a trailing half symbol for halves - `lib/rating.ts` owns the conversions and the sync round-trips them. RatingStars taps cycle full > half > clear; a compact copy sits on the Kitchen card once a dish is cooked.
- **Pairing** (`lib/plan/pairing.ts`, pure + tested): sides and soups suggest themselves next to mains by cuisine family (same cuisine > east-asian/western family > adjacent > universal), driven by Cuisine + Meal Type + the "Side Dish" tag (a main that can also sit beside another main, e.g. Mapo Tofu) so new recipes pair automatically; soups (incl. minestrone / chowder) are detected by title whatever their meal type. The picker opens on a "Pairs with {main}" chip when the slot already holds a main.

## Recipe tagging rules (every recipe, whichever door it comes in)

The taxonomy is small on purpose. `lib/tag-lint.ts` is the executable version; this is the readable one. Enforcement: (1) `/add` → `lib/extract/prompt.ts` words the same rules for Claude, (2) the Notion route → the `recipe-ingest` skill's tagging checklist, (3) every sync returns `lint: [...]` for the pages it upserted (a sync is clean only when `errors` AND `lint` are empty), (4) `node --env-file=.env.local scripts/tag-lint.mjs [--fix] [--only <code>] [--add-tag T --titles f]` audits the whole database and applies the mechanical fixes.

- **Meal Type** is single-select by design (the sync, the picker defaults, the randomizer and pairing all read one value). It is the ONE primary occasion: Breakfast / Lunch / Dinner for anything that can headline a meal; **Side** only for an accompaniment that is not a meal on its own (greens, salads, dips, breads, banchan); Snack; Dessert. The picker's lunch and dinner defaults include Sides; the randomizer rolls mains only.
- **"Side Dish" tag** = "can sit beside a main". Every Side carries it (lint adds it mechanically), and so do mains that double as sides: vegetable-, tofu- or egg-led dishes, dal-type curries, salads, breads and dips. `pairRole` treats the tag like Meal Type = Side, so a Dinner main tagged Side Dish still rolls as a dinner but also shows under "Pairs with". Soups never need it (title detection, incl. minestrone and chowder).
- **Heart Healthy** only when plant- or fish-forward, low in saturated fat, not deep-fried. **Quick** only when prep + cook ≤ 30 (lint flags Quick over 30). **Vegan / Vegetarian** strictly true; Vegan implies Vegetarian (lint flags the gap). **Lydia** tag marks her saved-video picks (Source stays whoever imported it). Tag cap: 5.
- **Cuisine** always set (Other when nothing fits). **Source** = who added it (Johnny / Lydia / Claude); Reference rows are not recipes and the sync drops them.

## Roles (who is on this phone)

Open URL, no login. A `?as=helper` query on any page auto-picks the helper role for a browser with NO role cookie yet (shared-link onboarding, e.g. WhatsApp's in-app browser; never overrides an existing pick). `POST /api/role {role}` sets an httpOnly cookie `gg_role` = `johnny | lydia | helper` (400 days). `lib/role.ts` (client-safe) + `lib/role.server.ts` (`getRole()` via `await cookies()`). The root layout reads it and mounts `RoleProvider` + `TabBar` + `RolePicker`. Planners (johnny/lydia) see Kitchen · Plan · Grocery · Recipes · Add; the helper sees Kitchen · Grocery · Recipes, never sees Rating/WantToTry (Notion write-back) and gets a read-only planner. The role stamps `added_by` / `checked_by` / `cooked_by`. It is hidden-not-locked by design, except for routes that spend money or write Notion / wipe data, which check `plannerGate(req)` (`/api/recipes/{extract,create}`, `[id]/{rating,want-to-try,sync}`, `/api/plan/{fill,copy,randomize,clear}`, `/api/grocery/{build,clear}`). The cookie is mintable, so this stops accidents, not attackers; the URL is unlisted.

## Pages

| Route | What |
|---|---|
| `/` | **Kitchen** - today's meals (big cards: Cook ▸ → cook mode, Recipe, Mark cooked with an 8 s Undo / tap-to-un-mark, notes for the cook, progress ring), tomorrow (+ "Tonight" prep hints INSIDE the card; future cards carry no Mark cooked), the rest of the week. An empty today knows the calendar: Saturday surfaces next week’s list with counts (`shopAhead` from the page), other empty days name the next planned day. Refreshes itself when the SG date rolls over. `/kitchen` redirects here. |
| `/plan?week=YYYY-MM-DD` | Week planner Mon–Sat (+Sun collapsed as rest day). Weeks start blank; the header **Randomize** die (and the die on each day card) opens the themed RandomizeSheet - theme chips (added by / heart healthy / cuisine / ≤30 min / want to try / ★4+ / 5★ only, remembered in `localStorage` `gg-roll-theme-v1`), live match counts, fill-empty vs re-roll, "Roll those again". A die on every *empty* slot opens the same sheet pre-scoped to that slot — no instant rolls (one glyph, one contract); the header die hides on a blank week (the hero CTA covers it); ⋯ on a chip = note / **Pick another** (themed swap, "Put back") / open / remove (Undo). Slot → picker (search: word-based over title/cuisine/tags, hyphen- and accent-blind, and it overrides the slot/pairs defaults while typing so "salmon" finds Crisp-Skin Salmon, `lib/plan/search.ts`; chips Heart healthy / Want to try / ★ 4+ / Recent (the ≤ 30 min chip went 2026-09-05) + "Filters ▾" for cuisine and Lydia's picks, Leftovers tab, and one-offs: type anything → 'Add "white rice" as a one-off', recent one-off chips removed 2026-08-30 — type-to-create stays; inline **Filters** chip expands cuisine + Lydia's picks + 4-star rows in the sheet). **Share** builds a WhatsApp-ready week digest + `?as=helper` link (Web Share API, clipboard fallback). Tap J+L to cycle eaters. **Lunch pills** on every lunch row (`J · home` / `L · office`; `lib/plan/lunch.ts`, table `lunch_locations`, 0007): who takes lunch to the office. The Kitchen shows "Pack Johnny's lunch for the office" on today and tomorrow, the Share digest and the print sheet append `pack lunch: Johnny`, copy-week carries the locations across. Constraint chips speak in words with three postures (met sage tick / pending "2 more oily fish" / violated filled terra "Chicken ×3 — cap is 1") from `lib/plan/constraints.ts`, per-day protein J/L, **Week actions** bottom sheet (fill from rotation, copy last week - "replace" asks first; **Clear the week**, cooked kept), Print. From Friday (isoDow ≥ 4) the default week pivots forward with an escape link (`autoForward`), same rule as the grocery banner. First-run gesture hint (localStorage `gg-gesture-tip-v1`) replaces the old footer caption. |
| `/plan/print?week=` | One A4: week table + shopping list by shop. |
| `/grocery?week=` | Shopping list. By shop (wet market / supermarket / either) or by aisle; progress bar + all-bought state; pantry staples hidden; free-text add (anyone); rebuild / clear / staple edits (planners). Refetches on reconnect and when the phone wakes. From Friday (isoDow ≥ 4) the current week shows a banner to next week's list with item/meal counts (Shallaine shops Saturday for the coming week); any future week shows a 'Shopping ahead' marker + back link. |
| `/recipes`, `/recipes/[id]`, `/recipes/[id]/cook` | Discover (paginated cards, was `/`), detail (household Both/Johnny/Lydia scale mode; `?eaters=&pm=` from the planner; **Plan this** sheet → day/slot/eaters; `?new=1` opens it as a nudge after create; a video recipe’s hero image is the play button (thumbnail + badge); the "Learn how to make it" CTA card after the Method links the source; interactive rating sits below the Method, want-to-try is a PIN; Start cooking owns the solid-terra slot; Discover has a cards/list density toggle (localStorage `gg-discover-density`) and a Filters sheet with counts — promoted chips: Pinned to try / ≤ 30 min / Heart healthy / Lydia’s picks), cook mode (posts `planned_meal_id`; step index persists in sessionStorage `gg-cook-<id>:<pm>` and clears on Cooked it; steps annotate ingredient amounts via `lib/cook/annotate.ts`; an Ingredients peek sheet opens from the footer; left third of the step area pages back, right two-thirds forward; timer tray stacks above the footer; audio context created on the timer tap). |
| `/add` | Claude-assisted add-a-meal: link (recipe site, **YouTube, TikTok**, short links), pasted text, or photo → draft → edit → create in Notion → sync → recipe page (+ Plan-this nudge). Planners only. `/add?url=` auto-runs (Android share sheet via `manifest.json` `share_target`; iOS = copy link → Paste button). Videos: oEmbed + description/caption (+ the recipe page the description links to, when it has schema.org data; YouTube captions are gated by YouTube and rarely available); the thumbnail becomes the Notion cover → `image_url`. Instagram/Facebook cannot be read: the UI says to paste the caption or screenshot it. |

## Tables (see `supabase/migrations/`)

- `recipes`, `ingredients_parsed` (unchanged) - `ingredients_parsed.category ∈ produce|protein|dairy|pantry|spice|grain|other`.
- `planned_meals`: `recipe_id` (nullable since 0004) OR `custom_text` (one-off items like "White rice" - XOR check constraint), `planned_for date`, `slot` (breakfast|lunch|dinner|snack), `eaters` (both|johnny|lydia), `position`, `note`, `cooked_at/by`, `leftover_of` (self FK, no shopping; forbidden on one-offs), **`week_of` generated** = Monday of `planned_for` (never insert it). Unique `(planned_for, slot, recipe_id)` (NULLs distinct). Realtime filter `week_of=eq.<monday>`. One-offs: no grocery contribution, no protein/constraint counting, no cook_log/last_made (cooked stamp only), randomizer treats their cells as occupied; `mealTitle()` in `lib/plan/types.ts` is the display helper.
- `grocery_list`: + `source` (`plan` only written by the builder; default `manual`), `shop` (wet_market|supermarket|either), `staple`, `added_by`. Unique `(week_of, name, unit)` - NULL units are distinct, so the builder reconciles in JS (upsert would mis-match them).
- `pantry_staples(name pk)` - seeded from the kitchen manual; `/api/staples` edits it.
- `lunch_locations` (0007): pk `(planned_for, person johnny|lydia)`, `location home|office`, `updated_by/at`. No row = home. `PUT /api/plan/lunch` upserts (planners); `GET /api/plan/meals` returns the week's rows as `lunch`; realtime-published, replica identity full. Server reads tolerate the table missing (returns []) so the app deploys before the migration runs.
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
npm run check              # tsc --noEmit + eslint + jest - run before every commit
npm run test               # jest alone (local binary; a stray global jest cannot find @swc/jest)
npm run build              # production build
vercel --prod --yes        # deploy - Vercel's build command is `npm run lint && npm run test && next build` (vercel.json), so red lint or tests FAIL the deploy; next build type-checks, which is why tsc is local-only
```
`evals/recipe-ingest-golden.test.ts` is skipped unless `GOLDEN_ACTUAL` is set (the recipe-ingest skill's golden run; see the skill's `evals/README.md`).
`WebFetch`/curl `https://giggly-gadget.vercel.app/api/sync-now?force=0&cb=<n>` - WebFetch caches a URL for 15 min, cache-bust when re-running.

## Verification (after any UI change) - see FEATURES.md

Green `npm run check` proves the code; it does not prove the page. Before reporting a UI change done: start the dev server in the Browser pane, set the role through `/api/role`, size to 390 px, and walk the affected route per [FEATURES.md](FEATURES.md) (what must show, which labels to find, what writes to prod). Use the sandbox week for anything that plans, rolls or clears; never mark real meals cooked or rate/pin as a test. Report what you looked for and whether it was there, with one screenshot as proof - not a request for Johnny to check on his phone. When a page, tab, chip or role rule changes, update its FEATURES.md row in the same commit.

## Working across machines

**This file is UTF-8**: write it with an explicit UTF-8 encoding (PowerShell `Set-Content`/`Out-File` default to ANSI on Windows and double-encode every arrow and star; the whole file was garbled that way in 38a02a9 and repaired 2026-09-05). **Git is the source of truth.** Remote `github.com/swole/giggly-gadget`. The working clone lives at **`C:\Users\johnn\code\giggly-gadget`** (non-OneDrive; jest cannot load `@swc/jest` from the `Yum! Brands, Inc` OneDrive path and OneDrive churns `node_modules`). The copy under `9. Claude/projects/giggly-gadget` is kept clean with no `node_modules`; `git pull` it if you need it there. New machine: clone → `npm install` → `vercel env pull .env.local` → copy `.vercel/` if missing.

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
| `lib/grocery/display.ts` | Buyable-units display layer: vulgar fractions, discrete round-ups, cloves→heads, bunches, grated-produce notes, either-or names. Used by GroceryList and the print sheet |
| `lib/cook/annotate.ts` | Inline ingredient amounts in cook-mode steps (overlap-safe, skips author-quantified spots) |
| `components/icons.tsx` | The house stroke-icon family (skillet, basket, fish, leaf, jar…) — tab bar, grocery sections, empty states. No platform emoji in UI chrome |
| `components/plan/PlanThisSheet.tsx`, `components/kitchen/MarkCookedButton.tsx`, `app/api/cook-log/route.ts` | Plan-this from a recipe; cook / un-cook |
| `app/loading.tsx`, `app/error.tsx` | Route skeleton + error screen (note: content reveals on requestAnimationFrame - a hidden/background tab shows the skeleton until visible) |
| `components/plan/*`, `components/kitchen/*`, `components/nav/TabBar.tsx`, `components/role/*` | UI |
| `lib/notion-sync.ts`, `lib/notion.ts`, `lib/recipes.ts`, `lib/ingredients/*` | Sync + parsing |
| `lib/tag-lint.ts`, `scripts/tag-lint.mjs` | Tagging rules (shared by the sync) + Notion audit / fix script |
| `lib/plan/lunch.ts`, `lib/plan/search.ts`, `app/api/plan/lunch/route.ts` | Lunch at home vs packed for the office; picker search |
| `supabase/migrations/0001…0007` | Schema |

