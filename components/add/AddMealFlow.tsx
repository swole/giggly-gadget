"use client";

// Add a meal: paste a link (web page, YouTube, TikTok), paste text, or photograph a page →
// Claude structures it → edit → create in Notion → sync → open the recipe. Ingredient lines
// show the parser's verdict live, so what gets saved is what the grocery builder can read.
// Deep link: /add?url=… auto-runs (Android share sheet → manifest share_target lands here).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CUISINES, DIFFICULTIES, MEAL_TYPES, TAGS, type RecipeDraft, type ExtractSource } from "@/lib/recipe-draft";
import { parseIngredient } from "@/lib/ingredients/parse";
import { downscaleImage } from "@/lib/image-downscale";
import { detectVideo, firstUrlIn, platformLabel } from "@/lib/extract/video";
import { isPlanner, labelFor } from "@/lib/role";
import type { RecipeSource } from "@/lib/notion-writer";
import { useRole } from "@/components/role/RoleProvider";

type Tab = "url" | "text" | "photo";
type Stage = "input" | "extracting" | "edit" | "creating";

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

const input =
  "w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:border-[var(--color-terra)] focus:outline-none";
const label = "text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]";
const primary =
  "rounded-full bg-[var(--color-ink)] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-cream)] shadow-sm transition-all hover:bg-[var(--color-terra)] active:scale-[0.98] disabled:opacity-50";
const ghost =
  "rounded-full border border-[var(--color-line)] px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)] active:scale-[0.98]";

export function AddMealFlow({ initialUrl = null, initialText = null }: { initialUrl?: string | null; initialText?: string | null }) {
  const role = useRole();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialText && !initialUrl ? "text" : "url");
  const [stage, setStage] = useState<Stage>("input");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [text, setText] = useState(initialText ?? "");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ media_type: "image/jpeg"; data_base64: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [media, setMedia] = useState<ExtractMedia | null>(null);
  const [source, setSource] = useState<RecipeSource>("Claude");
  const [wantToTry, setWantToTry] = useState(true);
  const [canPaste, setCanPaste] = useState(false);
  const autoRan = useRef(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const video = useMemo(() => (url.trim() ? detectVideo(url.trim()) : null), [url]);
  const planner = isPlanner(role);

  async function runExtract(src: ExtractSource) {
    setError(null);
    setWarnings([]);
    setMedia(null);
    setStage("extracting");
    try {
      const res = await fetch("/api/recipes/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: src }),
      });
      const j = (await res.json()) as { draft?: RecipeDraft; warnings?: string[]; media?: ExtractMedia | null; error?: string };
      if (!res.ok || !j.draft) {
        setError(j.error ?? `Extraction failed (${res.status})`);
        setStage("input");
        return;
      }
      setDraft(j.draft);
      setMedia(j.media ?? null);
      setWarnings(j.warnings ?? []);
      setStage("edit");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? `Network problem: ${e.message}` : "Network problem");
      setStage("input");
    }
  }

  // Clipboard read needs a user gesture on iOS/Android; only show the button where the API exists.
  useEffect(() => {
    const t = setTimeout(() => setCanPaste(typeof navigator !== "undefined" && !!navigator.clipboard?.readText), 0);
    return () => clearTimeout(t);
  }, []);

  // Deep link / share target: start immediately, once.
  useEffect(() => {
    if (!planner || !initialUrl || autoRan.current) return;
    autoRan.current = true;
    // Consume the deep link so Back / re-open does not re-run the extraction (it costs money).
    window.history.replaceState(null, "", "/add");
    const t = setTimeout(() => void runExtract({ kind: "url", url: initialUrl }), 50);
    return () => clearTimeout(t);
  }, [initialUrl, planner]);

  if (!planner) {
    return (
      <main className="relative z-10 mx-auto max-w-2xl px-4 pt-10 sm:px-6">
        <span className={label}>Add a meal</span>
        <p className="font-display-italic mt-3 text-2xl text-[var(--color-body)]">Johnny and Lydia add meals.</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">Switch person from the bar below if that&rsquo;s you.</p>
      </main>
    );
  }

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      const d = await downscaleImage(f);
      setPhoto({ media_type: d.media_type, data_base64: d.data_base64 });
      setPhotoName(`${f.name} · ${d.width}×${d.height}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pasteLink() {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      const u = firstUrlIn(t);
      if (u) {
        setUrl(u);
        setTab("url");
        await runExtract({ kind: "url", url: u });
      } else if (t.length >= 20) {
        setText(t);
        setTab("text");
      } else {
        setError("Nothing that looks like a link on the clipboard. Copy the link first, then tap Paste.");
        urlRef.current?.focus();
      }
    } catch {
      setError("Could not read the clipboard — paste into the box instead.");
      urlRef.current?.focus();
    }
  }

  function extract() {
    setError(null);
    if (tab === "url") {
      const u = url.trim();
      if (!u) {
        setError("Paste a link first");
        urlRef.current?.focus();
        return;
      }
      const v = detectVideo(u);
      if (v?.platform === "instagram" || v?.platform === "facebook") {
        setError(
          `${platformLabel(v.platform)} does not let apps read posts. Copy the caption (tap ··· → Copy) and use Paste text, or screenshot the recipe and use Photo.`,
        );
        return;
      }
      void runExtract({ kind: "url", url: u });
    } else if (tab === "text") {
      if (text.trim().length < 20) return setError("Paste the recipe text first");
      void runExtract({ kind: "text", text });
    } else {
      if (!photo) return setError("Take or choose a photo first");
      void runExtract({ kind: "image", ...photo });
    }
  }

  async function create() {
    if (!draft) return;
    setError(null);
    setStage("creating");
    try {
      const res = await fetch("/api/recipes/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft, source, want_to_try: wantToTry, cover_url: media?.thumbnail_url ?? null }),
      });
      const j = (await res.json()) as { id?: string; error?: string; synced?: boolean; issues?: unknown[] };
      if (!res.ok || !j.id) {
        setError(j.error ?? `Create failed (${res.status})`);
        setStage("edit");
        return;
      }
      // The page exists in Notion. If the inline sync hiccupped, retry a few times before opening it
      // (otherwise the recipe page would 404 until the nightly sync).
      let synced = j.synced !== false;
      for (let i = 0; i < 3 && !synced; i++) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        try {
          const rs = await fetch(`/api/recipes/${j.id}/sync`, { method: "POST" });
          synced = rs.ok;
        } catch {}
      }
      if (!synced) {
        setError("Created in Notion, but the app could not sync it yet. It will appear after the nightly sync, or open Recipes and pull to refresh later.");
        setStage("edit");
        return;
      }
      router.push(`/recipes/${j.id}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? `Network problem: ${e.message}` : "Network problem");
      setStage("edit");
    }
  }

  const extracting = stage === "extracting";
  const extractingCopy = video?.platform === "youtube"
    ? "Watching the video for you — reading the description and captions…"
    : video?.platform === "tiktok"
      ? "Reading the TikTok caption…"
      : tab === "photo"
        ? "Reading the photo…"
        : "Reading the recipe…";

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-6">
        <span className={label}>Add a meal</span>
        <h1 className="font-display-italic mt-3 text-4xl leading-none text-[var(--color-ink)] sm:text-5xl">
          {stage === "edit" || stage === "creating" ? "Check it over" : "Bring a recipe in"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {stage === "edit" || stage === "creating"
            ? "Fix anything Claude got wrong. Ingredient lines need a quantity first so the grocery list can read them."
            : "A link (recipe site, YouTube, TikTok), pasted text, or a photo of a cookbook page. Claude turns it into the house format and you confirm."}
        </p>
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-[var(--color-terra)]/40 bg-[var(--color-terra)]/10 px-4 py-3 text-sm text-[var(--color-terra-dark)]">
          {error}
        </div>
      )}

      {(stage === "input" || stage === "extracting") && (
        <section aria-busy={extracting}>
          <div role="tablist" className="flex overflow-hidden rounded-full border border-[var(--color-line)] text-[10px] uppercase tracking-[0.16em]">
            {(["url", "text", "photo"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                disabled={extracting}
                className={`flex-1 px-3 py-2.5 transition-colors ${tab === t ? "bg-[var(--color-terra)] text-[var(--color-cream)]" : "text-[var(--color-muted)]"}`}
              >
                {t === "url" ? "Link" : t === "text" ? "Paste text" : "Photo"}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "url" && (
              <div>
                <div className="flex gap-2">
                  <input
                    ref={urlRef}
                    className={input}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") extract();
                    }}
                    placeholder="https://… (recipe site, YouTube, TikTok)"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Recipe link"
                    disabled={extracting}
                  />
                  {canPaste && !url && (
                    <button type="button" onClick={pasteLink} disabled={extracting} className={`${ghost} shrink-0 px-4`} aria-label="Paste link from clipboard">
                      Paste
                    </button>
                  )}
                  {url && !extracting && (
                    <button type="button" onClick={() => { setUrl(""); urlRef.current?.focus(); }} className={`${ghost} shrink-0 px-3`} aria-label="Clear link">
                      ×
                    </button>
                  )}
                </div>
                <div className="mt-2 min-h-[1.25rem] text-xs text-[var(--color-faint)]">
                  {video?.platform === "youtube" && <span>▶ YouTube — we read the description (and the recipe page it links to), then write the recipe.</span>}
                  {video?.platform === "tiktok" && <span>♪ TikTok — we read the caption; amounts it leaves out are estimated.</span>}
                  {(video?.platform === "instagram" || video?.platform === "facebook") && (
                    <span className="text-[var(--color-terra-dark)]">{platformLabel(video.platform)} blocks apps — copy the caption into Paste text, or screenshot it for Photo.</span>
                  )}
                  {!video && !url && <span>Tip: on a phone, copy the link in YouTube / TikTok, come back and tap Paste.</span>}
                </div>
              </div>
            )}
            {tab === "text" && (
              <textarea
                className={`${input} min-h-[14rem]`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the whole recipe — title, ingredients, method. A video caption works too."
                aria-label="Recipe text"
                disabled={extracting}
              />
            )}
            {tab === "photo" && (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-line)] px-4 py-10 text-center">
                <span className="text-3xl">📷</span>
                <span className="mt-2 text-sm text-[var(--color-ink)]">{photoName ?? "Take a photo or choose one"}</span>
                <span className="mt-1 text-xs text-[var(--color-faint)]">Cookbook page, screenshot of a recipe card, handwriting. Shrunk on your phone before upload.</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} disabled={extracting} />
              </label>
            )}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button onClick={extract} disabled={extracting} className={primary}>
              {extracting ? "Working…" : "Extract"}
            </button>
            {extracting && (
              <span className="text-xs text-[var(--color-faint)]" aria-live="polite">
                {extractingCopy} <span className="opacity-70">(15–40 s)</span>
              </span>
            )}
          </div>
        </section>
      )}

      {(stage === "edit" || stage === "creating") && draft && (
        <DraftForm
          draft={draft}
          media={media}
          onChange={setDraft}
          warnings={warnings}
          source={source}
          onSource={setSource}
          me={(labelFor(role) === "Lydia" ? "Lydia" : "Johnny") as RecipeSource}
          wantToTry={wantToTry}
          onWantToTry={setWantToTry}
          busy={stage === "creating"}
          onCreate={create}
          onBack={() => setStage("input")}
        />
      )}
    </main>
  );
}

function MediaCard({ media }: { media: ExtractMedia }) {
  const read = [
    media.linked_recipe_url ? "linked recipe page" : null,
    media.has_description ? (media.platform === "tiktok" ? "caption" : "description") : null,
    media.has_transcript ? "captions" : null,
  ].filter(Boolean);
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-2 pr-4 transition-colors hover:border-[var(--color-terra)]"
    >
      {media.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.thumbnail_url} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" loading="lazy" />
      ) : (
        <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-[var(--color-ink)] text-2xl text-[var(--color-cream)]">{media.platform === "tiktok" ? "♪" : media.platform === "web" ? "⌘" : "▶"}</span>
      )}
      <span className="min-w-0">
        <span className={label}>{media.platform === "youtube" ? "▶ YouTube" : media.platform === "tiktok" ? "♪ TikTok" : "⌘ Web"}{media.author ? ` · ${media.author}` : ""}</span>
        <span className="mt-0.5 block truncate text-sm text-[var(--color-ink)]">{media.title ?? media.url}</span>
        <span className="block text-[11px] text-[var(--color-faint)]">
          {media.platform === "web" ? "Photo from the page becomes the recipe image · opens the page" : `${read.length ? `Read the ${read.join(" + ")}` : "Only the title was readable"} · opens the video`}
        </span>
      </span>
    </a>
  );
}

function DraftForm({
  draft,
  media,
  onChange,
  warnings,
  source,
  onSource,
  me,
  wantToTry,
  onWantToTry,
  busy,
  onCreate,
  onBack,
}: {
  draft: RecipeDraft;
  media: ExtractMedia | null;
  onChange: (d: RecipeDraft) => void;
  warnings: string[];
  source: RecipeSource;
  onSource: (s: RecipeSource) => void;
  me: RecipeSource;
  wantToTry: boolean;
  onWantToTry: (v: boolean) => void;
  busy: boolean;
  onCreate: () => void;
  onBack: () => void;
}) {
  const set = <K extends keyof RecipeDraft>(k: K, v: RecipeDraft[K]) => onChange({ ...draft, [k]: v });
  const verdicts = useMemo(() => draft.ingredients.map((l) => parseIngredient(`- ${l}`)), [draft.ingredients]);
  const unparsed = verdicts.filter((v) => !v.scalable && !v.to_taste).length;

  return (
    <section className="space-y-6">
      {media && <MediaCard media={media} />}

      {warnings.length > 0 && (
        <ul className="rounded-xl bg-[var(--color-mustard)]/15 px-4 py-3 text-xs text-[var(--color-ink)]">
          {warnings.map((w, i) => (
            <li key={i}>· {w}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <div className={label}>Title</div>
          <input className={`${input} mt-1 font-display text-lg`} value={draft.title} onChange={(e) => set("title", e.target.value)} aria-label="Title" />
        </div>
        <div>
          <div className={label}>Emoji</div>
          <input className={`${input} mt-1 w-20 text-center text-xl`} value={draft.emoji ?? ""} onChange={(e) => set("emoji", e.target.value || null)} maxLength={4} aria-label="Emoji" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Select label="Cuisine" value={draft.cuisine} options={CUISINES} onChange={(v) => set("cuisine", v as RecipeDraft["cuisine"])} />
        <Select label="Meal type" value={draft.meal_type} options={MEAL_TYPES} onChange={(v) => set("meal_type", v as RecipeDraft["meal_type"])} />
        <Select label="Difficulty" value={draft.difficulty} options={DIFFICULTIES} onChange={(v) => set("difficulty", v as RecipeDraft["difficulty"])} />
        <Num label="Prep min" value={draft.prep_min} onChange={(v) => set("prep_min", v)} />
        <Num label="Cook min" value={draft.cook_min} onChange={(v) => set("cook_min", v)} />
        <Num label="Servings" value={draft.servings} onChange={(v) => set("servings", v)} />
      </div>

      <div>
        <div className={label}>Tags</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAGS.map((t) => {
            const on = draft.tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => set("tags", on ? draft.tags.filter((x) => x !== t) : [...draft.tags, t].slice(0, 4))}
                className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                  on ? "border-[var(--color-terra)] bg-[var(--color-terra)] text-[var(--color-cream)]" : "border-[var(--color-line)] text-[var(--color-muted)]"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <div className={label}>Ingredients</div>
          <span className={`text-[10px] ${unparsed ? "text-[var(--color-terra-dark)]" : "text-[var(--color-sage)]"}`}>
            {unparsed ? `${unparsed} won't scale` : "all lines parse"}
          </span>
        </div>
        <ul className="mt-2 space-y-1.5">
          {draft.ingredients.map((line, i) => {
            const v = verdicts[i];
            const ok = v.scalable || v.to_taste;
            const verdict = v.scalable ? `${v.qty_min ?? ""}${v.qty_max ? `–${v.qty_max}` : ""} ${v.unit ?? ""} ${v.name}` : v.to_taste ? "to taste" : "⚠ no quantity";
            return (
              <li key={i} className="flex items-start gap-2">
                <input
                  className={`${input} py-2 ${ok ? "" : "border-[var(--color-terra)]"}`}
                  value={line}
                  aria-label={`Ingredient ${i + 1}`}
                  onChange={(e) => {
                    const next = draft.ingredients.slice();
                    next[i] = e.target.value;
                    set("ingredients", next);
                  }}
                />
                <span className="mt-2 w-28 shrink-0 truncate text-[10px] text-[var(--color-faint)]" title={verdict}>
                  {verdict}
                </span>
                <button
                  type="button"
                  onClick={() => set("ingredients", draft.ingredients.filter((_, j) => j !== i))}
                  className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-faint)] hover:text-[var(--color-terra)]"
                  aria-label="Remove line"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => set("ingredients", [...draft.ingredients, ""])} className={`${ghost} mt-2`}>
          + Line
        </button>
      </div>

      <div>
        <div className={label}>Method</div>
        <ol className="mt-2 space-y-1.5">
          {draft.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="font-display mt-2 w-6 shrink-0 text-right text-[var(--color-terra)]">{i + 1}</span>
              <textarea
                className={`${input} min-h-[3.5rem] py-2`}
                value={s}
                aria-label={`Step ${i + 1}`}
                onChange={(e) => {
                  const next = draft.steps.slice();
                  next[i] = e.target.value;
                  set("steps", next);
                }}
              />
              <button
                type="button"
                onClick={() => set("steps", draft.steps.filter((_, j) => j !== i))}
                className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-faint)] hover:text-[var(--color-terra)]"
                aria-label="Remove step"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => set("steps", [...draft.steps, ""])} className={`${ghost} mt-2`}>
          + Step
        </button>
      </div>

      <div>
        <div className={label}>Notes</div>
        <textarea className={`${input} mt-1 min-h-[4rem]`} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} aria-label="Notes" />
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-line)] pt-5">
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <input type="checkbox" checked={wantToTry} onChange={(e) => onWantToTry(e.target.checked)} />
          Want to try
        </label>
        <div className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
          Source
          {(["Claude", me] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              onClick={() => onSource(s)}
              className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${
                source === s ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "border border-[var(--color-line)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onBack} className={ghost} disabled={busy}>
            Back
          </button>
          <button type="button" onClick={onCreate} className={primary} disabled={busy || !draft.title.trim() || draft.ingredients.length === 0}>
            {busy ? "Creating in Notion…" : "Create in Notion"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Select({ label: l, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <div className={label}>{l}</div>
      <select className={`${input} mt-1`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={l}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Num({ label: l, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <div className={label}>{l}</div>
      <input
        className={`${input} mt-1`}
        inputMode="numeric"
        value={value ?? ""}
        aria-label={l}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? n : null);
        }}
        placeholder="—"
      />
    </div>
  );
}
