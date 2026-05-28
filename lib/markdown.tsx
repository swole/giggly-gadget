import React from "react";

// Inline markdown renderer: **bold**, _italic_, [text](url).
// Used by both the detail Method section and the cook-mode step view.
const INLINE_RE = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;

export function renderInlineMd(s: string): React.ReactNode[] {
  const parts = s.split(INLINE_RE);
  return parts
    .filter((p) => p !== "")
    .map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-[var(--color-ink)]">
            {p.slice(2, -2)}
          </strong>
        );
      }
      if (p.startsWith("_") && p.endsWith("_") && p.length > 2) {
        return (
          <em key={i} className="text-[var(--color-body)]">
            {p.slice(1, -1)}
          </em>
        );
      }
      const linkMatch = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={i}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-terra)] underline-offset-4 hover:underline"
          >
            {linkMatch[1]}
          </a>
        );
      }
      return <React.Fragment key={i}>{p}</React.Fragment>;
    });
}
