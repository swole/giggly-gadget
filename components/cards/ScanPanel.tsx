"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Barcode, QrCode } from "./CodeArt";
import { clearCardPhoto, fileToDataUrl, getCardPhoto, setCardPhoto } from "@/lib/cards/store";
import { requestWakeLock } from "@/lib/wake-lock";
import type { MemberCard } from "@/lib/cards/types";

/**
 * Full-screen "present the card" view. Deliberately inverts the app's warm
 * paper for espresso-dark: a scanner wants one bright white rectangle and no
 * competing light, and the dark surround stops auto-brightness washing it out.
 */
export function ScanPanel({ card, onClose }: { card: MemberCard; onClose: () => void }) {
  const [photo, setPhoto] = useState<string | undefined>();
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [showGenerated, setShowGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    getCardPhoto(card.id).then((p) => {
      if (!live) return;
      setPhoto(p);
      setPhotoLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [card.id]);

  // Keep the screen on — a phone that dims mid-queue is the whole failure mode.
  useEffect(() => {
    let sentinel: Awaited<ReturnType<typeof requestWakeLock>> = null;
    let dropped = false;
    const acquire = async () => {
      sentinel = await requestWakeLock();
      if (dropped) sentinel?.release().catch(() => {});
    };
    acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(card.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the number is on screen anyway */
    }
  }, [card.value]);

  const onPickPhoto = async (file?: File) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    await setCardPhoto(card.id, dataUrl);
    setPhoto(dataUrl);
    setShowGenerated(false);
  };

  const usingPhoto = Boolean(photo) && !showGenerated;
  const showQr = card.primary !== "number";
  const heroIsNumber = card.primary === "number" && !usingPhoto;

  // Portalled to <body>: the page's <main> is its own stacking context, so a
  // fixed panel inside it still renders *under* the tab bar.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[var(--color-ink)] text-[var(--color-cream)]">
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="min-w-0">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ background: card.accent, color: card.accentInk }}
          >
            {card.name}
          </span>
          {card.where && <p className="mt-2 truncate text-xs text-[var(--color-sand)]">{card.where}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-muted)]/60 text-xl leading-none text-[var(--color-sand)] transition-colors hover:border-[var(--color-sand)] hover:text-[var(--color-cream)]"
        >
          ×
        </button>
      </header>

      <div className="animate-scan-in mx-auto w-full max-w-md flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-2">
        <div className="rounded-[28px] bg-white p-5 text-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
          {usingPhoto ? (
            <div className="relative overflow-hidden rounded-2xl bg-white">
              {/* A local data URL — next/image would only add a loader round-trip. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`${card.name} membership code`} className="mx-auto max-h-[52vh] w-auto" />
            </div>
          ) : heroIsNumber ? (
            <div className="py-6 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-black/45">{card.label}</p>
              <p className="mt-3 font-mono text-[clamp(2.4rem,13vw,3.6rem)] font-semibold leading-none tracking-[0.06em] tabular-nums">
                {card.display}
              </p>
            </div>
          ) : (
            showQr && <QrCode value={card.value} className="mx-auto block w-full max-w-[19rem]" />
          )}

          {!usingPhoto && (
            <>
              <div className={heroIsNumber || showQr ? "mt-5 border-t border-black/10 pt-5" : ""}>
                <Barcode value={card.value} height={heroIsNumber ? 84 : 70} className="mx-auto block h-auto w-full" />
              </div>
              {!heroIsNumber && (
                <p className="mt-4 text-center font-mono text-2xl font-semibold tracking-[0.14em] tabular-nums">
                  {card.display}
                </p>
              )}
            </>
          )}

          {usingPhoto && (
            <p className="mt-4 text-center font-mono text-lg font-semibold tracking-[0.12em] tabular-nums text-black/70">
              {card.display}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button onClick={copy} className={pill}>
            {copied ? "Copied ✓" : "Copy number"}
          </button>
          {photoLoaded && (
            <>
              <button onClick={() => fileRef.current?.click()} className={pill}>
                {photo ? "Replace photo" : "Use a photo"}
              </button>
              {photo && (
                <button onClick={() => setShowGenerated((v) => !v)} className={pill}>
                  {showGenerated ? "Show photo" : "Show generated"}
                </button>
              )}
              {photo && (
                <button
                  onClick={async () => {
                    await clearCardPhoto(card.id);
                    setPhoto(undefined);
                    setShowGenerated(false);
                  }}
                  className={pill}
                >
                  Remove photo
                </button>
              )}
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onPickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {card.note && !usingPhoto && (
          <p className="mx-auto mt-4 max-w-sm text-center text-xs leading-relaxed text-[var(--color-sand)]/80">{card.note}</p>
        )}
        <p className="mt-5 text-center text-[10px] uppercase tracking-[0.2em] text-[var(--color-muted)]">
          Screen stays awake · turn brightness up
        </p>
      </div>
    </div>,
    document.body,
  );
}

const pill =
  "min-h-9 rounded-full border border-[var(--color-muted)]/60 px-3.5 text-[11px] uppercase tracking-[0.14em] text-[var(--color-sand)] transition-colors hover:border-[var(--color-sand)] hover:text-[var(--color-cream)]";
