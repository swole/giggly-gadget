import { del, get, set } from "idb-keyval";
import { BUILTIN_CARDS, normaliseValue } from "./catalog";
import type { MemberCard } from "./types";

/** Cards added on this phone. There is no login, so they stay on this phone. */
const LS_KEY = "gg.cards.v1";
/** Built-in ids the owner of this phone has hidden. */
const LS_HIDDEN = "gg.cards.hidden.v1";
/** Photo of the real code, when a generated one will not scan. */
const photoKey = (id: string) => `gg.card-photo.${id}`;

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — the built-ins still work */
  }
}

function loadCards(): MemberCard[] {
  const hidden = new Set(readLocal<string[]>(LS_HIDDEN, []));
  const custom = readLocal<MemberCard[]>(LS_KEY, []);
  return [...BUILTIN_CARDS.filter((c) => !hidden.has(c.id)), ...custom];
}

/* ---- external store -------------------------------------------------- */
/* localStorage is the source of truth, so the screen reads it through
   useSyncExternalStore. The snapshot is cached because getSnapshot must return
   a stable reference, and cleared on every write. */

let snapshot: MemberCard[] | null = null;
const listeners = new Set<() => void>();

export function subscribeCards(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab (or the other person's window on a shared phone) editing cards.
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY || e.key === LS_HIDDEN) invalidate();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function cardsSnapshot(): MemberCard[] {
  if (snapshot === null) snapshot = loadCards();
  return snapshot;
}

/** Pre-hydration the built-ins are all we can know, and they are the common case. */
export function serverCardsSnapshot(): MemberCard[] {
  return BUILTIN_CARDS;
}

function invalidate() {
  snapshot = null;
  hiddenSnapshot = null;
  for (const l of listeners) l();
}

export function saveCustomCards(cards: MemberCard[]) {
  writeLocal(
    LS_KEY,
    cards.filter((c) => !c.builtin),
  );
  invalidate();
}

export function hideBuiltin(id: string) {
  const hidden = new Set(readLocal<string[]>(LS_HIDDEN, []));
  hidden.add(id);
  writeLocal(LS_HIDDEN, [...hidden]);
  invalidate();
}

export function restoreBuiltin(id: string) {
  const hidden = readLocal<string[]>(LS_HIDDEN, []).filter((h) => h !== id);
  writeLocal(LS_HIDDEN, hidden);
  invalidate();
}

/** Built-ins this phone has hidden — offered back so "Hide" is never one-way. */
let hiddenSnapshot: MemberCard[] | null = null;

export function hiddenBuiltinsSnapshot(): MemberCard[] {
  if (hiddenSnapshot === null) {
    const hidden = new Set(readLocal<string[]>(LS_HIDDEN, []));
    hiddenSnapshot = BUILTIN_CARDS.filter((c) => hidden.has(c.id));
  }
  return hiddenSnapshot;
}

export function noHiddenBuiltins(): MemberCard[] {
  return EMPTY;
}

const EMPTY: MemberCard[] = [];

export function newCard(input: {
  name: string;
  value: string;
  label?: string;
  where?: string;
  primary?: MemberCard["primary"];
  accent?: string;
}): MemberCard {
  const value = normaliseValue(input.value);
  return {
    id: `c${Date.now().toString(36)}`,
    name: input.name.trim() || "Membership",
    where: input.where?.trim() || "",
    label: input.label?.trim() || "Member number",
    value,
    display: value,
    primary: input.primary ?? "barcode",
    accent: input.accent ?? "#b1402a",
    accentInk: "#ffffff",
  };
}

/* ---- photo override -------------------------------------------------- */

export async function getCardPhoto(id: string): Promise<string | undefined> {
  try {
    return await get<string>(photoKey(id));
  } catch {
    return undefined;
  }
}

export async function setCardPhoto(id: string, dataUrl: string) {
  await set(photoKey(id), dataUrl);
}

export async function clearCardPhoto(id: string) {
  try {
    await del(photoKey(id));
  } catch {
    /* nothing stored */
  }
}

/**
 * Downscale a camera photo so IndexedDB holds something sane. A code needs
 * detail, so keep the long edge generous and the JPEG quality high.
 */
export function fileToDataUrl(file: File, maxEdge = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onerror = () => resolve(src); // give up on resizing, store as-is
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        if (scale === 1 && src.length < 900_000) return resolve(src);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
