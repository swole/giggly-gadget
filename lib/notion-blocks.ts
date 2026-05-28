// Minimal Notion blocks → markdown converter. Covers the block types Johnny's
// recipes actually use: headings, paragraphs, bulleted/numbered lists, callouts, quotes.
// Skips images and complex embeds (they're not load-bearing for ingredient parsing).

type AnyBlock = Record<string, unknown> & { type: string; id: string };

type RichText = {
  plain_text?: string;
  annotations?: { bold?: boolean; italic?: boolean; code?: boolean; strikethrough?: boolean };
  href?: string | null;
};

function rtToMd(rt: RichText[] | undefined): string {
  if (!rt) return "";
  return rt
    .map((r) => {
      let s = r.plain_text ?? "";
      const a = r.annotations ?? {};
      if (a.code) s = `\`${s}\``;
      if (a.bold) s = `**${s}**`;
      if (a.italic) s = `_${s}_`;
      if (a.strikethrough) s = `~~${s}~~`;
      if (r.href) s = `[${s}](${r.href})`;
      return s;
    })
    .join("");
}

export function blocksToMarkdown(blocks: AnyBlock[]): string {
  const out: string[] = [];
  for (const block of blocks) {
    const t = block.type;
    const data = (block as Record<string, unknown>)[t] as
      | { rich_text?: RichText[]; icon?: { emoji?: string } }
      | undefined;
    const text = rtToMd(data?.rich_text);

    switch (t) {
      case "heading_1":
        out.push(`# ${text}`); break;
      case "heading_2":
        out.push(`## ${text}`); break;
      case "heading_3":
        out.push(`### ${text}`); break;
      case "paragraph":
        out.push(text); break;
      case "bulleted_list_item":
        out.push(`- ${text}`); break;
      case "numbered_list_item":
        out.push(`1. ${text}`); break;
      case "quote":
        out.push(`> ${text}`); break;
      case "callout": {
        const emoji = data?.icon?.emoji ? `${data.icon.emoji} ` : "";
        out.push(`> ${emoji}${text}`);
        break;
      }
      case "to_do":
        out.push(`- [ ] ${text}`); break;
      case "code": {
        const lang =
          ((block as Record<string, unknown>).code as { language?: string } | undefined)
            ?.language ?? "";
        out.push(`\`\`\`${lang}\n${text}\n\`\`\``);
        break;
      }
      case "divider":
        out.push("---"); break;
      default:
        if (text) out.push(text);
    }
  }
  return out.join("\n");
}
