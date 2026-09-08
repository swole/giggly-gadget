"use client";

import { useEffect } from "react";
import { hotkeyAction, isTypingTarget, type HotkeyAction } from "@/lib/nav/hotkeys";

/**
 * Listens for the tab-bar number keys and reports what was pressed; the caller decides
 * what to do with it. Deliberately narrow: bare digits only, never while typing, never
 * while a sheet is up (a sheet owns the keyboard — the one exception is our own
 * shortcuts card, marked data-hotkeys="passthrough" so you can read a digit off it and
 * press it), and never with a modifier, so Ctrl/Cmd+1 still switches browser tabs.
 */
export function useNavHotkeys({
  count,
  enabled,
  onAction,
}: {
  /** How many tabs the bar is showing; the person button is the next number after them. */
  count: number;
  enabled: boolean;
  onAction: (action: HotkeyAction) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      const modal = document.querySelector('[aria-modal="true"]');
      if (modal && modal.getAttribute("data-hotkeys") !== "passthrough") return;

      const action = hotkeyAction(e, count);
      if (!action) return;
      e.preventDefault();
      onAction(action);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, count, onAction]);
}
