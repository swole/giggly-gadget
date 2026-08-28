import { AddMealFlow } from "@/components/add/AddMealFlow";
import { firstUrlIn } from "@/lib/extract/video";

export const dynamic = "force-dynamic";

/**
 * /add?url=…  — deep link / Android share target (manifest share_target). Share sheets put the
 * link in `url` or inside `text`; whatever is left over that is not a link becomes pasted text.
 */
export default async function AddPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const rawUrl = one("url")?.trim() || null;
  const text = one("text")?.trim() || null;
  const title = one("title")?.trim() || null;
  const url = (rawUrl && firstUrlIn(rawUrl)) || firstUrlIn(text) || null;
  // Text that is more than just the link (e.g. a recipe shared from Notes) pre-fills the paste tab.
  const leftover = !url && text && text.length >= 20 ? [title, text].filter(Boolean).join("\n\n") : null;
  return <AddMealFlow initialUrl={url} initialText={leftover} />;
}
