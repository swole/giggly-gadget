// Keyboard shortcuts for the tab bar. Pure and DOM-free so the mapping is testable.
//
// The rule is "the digit is the item's position in the bar": 1 is the leftmost tab and
// the person button is always the number after the last tab. The numbering therefore
// shifts with the role (the helper sees three tabs, not five), which is what you want
// when you are reading the digits off the bar rather than memorising a fixed table.
//
// Digits are bare, never shifted: Shift+1 is "!", so the shifted row stays free, and
// Ctrl/Cmd+1 is left to the browser for its own tab switching.

export type HotkeyAction =
  | { kind: "tab"; index: number }
  | { kind: "person" }
  | { kind: "help" };

/** Which bar control a keypress means, given how many tabs the role is showing. */
export function hotkeyAction(e: { key: string; shiftKey?: boolean }, tabCount: number): HotkeyAction | null {
  // "?" is shift+something on most layouts and browsers report the produced character,
  // but not every keyboard (or automation layer) resolves it — take the slash too.
  if (e.key === "?" || (e.key === "/" && e.shiftKey)) return { kind: "help" };
  const key = e.key;
  if (key.length === 1 && key >= "1" && key <= "9") {
    const index = key.charCodeAt(0) - 49; // "1" -> 0
    if (index < tabCount) return { kind: "tab", index };
    if (index === tabCount) return { kind: "person" };
  }
  return null;
}

/** The digit printed on the bar for the nth control (tabs first, then the person button). */
export function hotkeyDigit(index: number): string | null {
  return index >= 0 && index < 9 ? String(index + 1) : null;
}

// Duck-typed rather than `instanceof HTMLElement` so this runs under the node test env.
type MaybeElement = {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
};

/** True when the keystroke belongs to whatever the user is typing into. */
export function isTypingTarget(el: unknown): boolean {
  const e = el as MaybeElement | null;
  if (!e || typeof e !== "object") return false;
  if (e.isContentEditable) return true;
  const tag = typeof e.tagName === "string" ? e.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return e.getAttribute?.("role") === "textbox";
}
