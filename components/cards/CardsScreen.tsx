"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ScanPanel } from "./ScanPanel";
import { groupDigits } from "@/lib/cards/catalog";
import {
  cardsSnapshot,
  hiddenBuiltinsSnapshot,
  hideBuiltin,
  newCard,
  noHiddenBuiltins,
  restoreBuiltin,
  saveCustomCards,
  serverCardsSnapshot,
  subscribeCards,
} from "@/lib/cards/store";
import type { MemberCard } from "@/lib/cards/types";

export function CardsScreen() {
  const cards = useSyncExternalStore(
    subscribeCards,
    cardsSnapshot,
    serverCardsSnapshot,
  );
  const hidden = useSyncExternalStore(
    subscribeCards,
    hiddenBuiltinsSnapshot,
    noHiddenBuiltins,
  );
  const [open, setOpen] = useState<MemberCard | null>(null);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);

  function addCard(input: Parameters<typeof newCard>[0]) {
    const card = newCard(input);
    card.display = groupDigits(card.value);
    saveCustomCards([...cards, card]);
    setAdding(false);
    setOpen(card);
  }

  function removeCard(card: MemberCard) {
    if (card.builtin) hideBuiltin(card.id);
    else saveCustomCards(cards.filter((c) => c.id !== card.id));
  }

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <header className="border-b border-[var(--color-line)] pb-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.32em] text-[var(--color-muted)]">
            Wallet
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setManaging((v) => !v)}
              aria-pressed={managing}
              className={`text-[10px] uppercase tracking-[0.18em] ${managing ? "text-[var(--color-terra)]" : "text-[var(--color-muted)] hover:text-[var(--color-terra)]"}`}
            >
              {managing ? "Done" : "Manage"}
            </button>
            <Link
              href="/grocery"
              className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)] hover:text-[var(--color-terra)]"
            >
              Shopping list →
            </Link>
          </div>
        </div>
        <h1 className="mt-3 font-display-italic text-4xl leading-none text-[var(--color-ink)]">
          Membership cards
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-muted)]">
          Tap a card at the till. The screen goes dark and the code goes big, so
          the scanner has one bright rectangle to find.
        </p>
      </header>

      <ul className="mt-6 space-y-3">
        {cards.map((card, i) => (
          <li
            key={card.id}
            className="animate-slide-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <CardRow
              card={card}
              managing={managing}
              onOpen={() => setOpen(card)}
              onRemove={() => removeCard(card)}
            />
          </li>
        ))}
      </ul>

      {cards.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-[var(--color-line)] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
          No cards on this phone yet.
        </p>
      )}

      <div className="mt-6">
        {adding ? (
          <AddCardForm onCancel={() => setAdding(false)} onAdd={addCard} />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="min-h-11 w-full rounded-full border border-dashed border-[var(--color-line)] px-4 text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)] transition-colors hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
          >
            ＋ Add a card
          </button>
        )}
      </div>

      {hidden.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--color-line-soft)]/60 pt-4">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-faint)]">
            Hidden
          </span>
          {hidden.map((card) => (
            <button
              key={card.id}
              onClick={() => restoreBuiltin(card.id)}
              className="min-h-9 rounded-full border border-[var(--color-line)] px-3 text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)] hover:border-[var(--color-terra)] hover:text-[var(--color-terra)]"
            >
              Restore {card.name}
            </button>
          ))}
        </div>
      )}

      <p className="mt-5 text-center text-[10px] leading-relaxed tracking-[0.1em] text-[var(--color-faint)]">
        Cards you add live on this phone only — there is no account to sync them
        to.
      </p>

      {open && <ScanPanel card={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function CardRow({
  card,
  managing,
  onOpen,
  onRemove,
}: {
  card: MemberCard;
  managing: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] shadow-[0_1px_0_rgba(255,255,255,0.6)_inset]">
      {/* brand spine */}
      <span
        className="absolute inset-y-0 left-0 w-[6px]"
        style={{ background: card.accent }}
        aria-hidden
      />
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-4 py-4 pl-6 pr-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-xl leading-tight text-[var(--color-ink)]">
            {card.name}
          </span>
          {card.where && (
            <span className="mt-1 block truncate text-[11px] text-[var(--color-faint)]">
              {card.where}
            </span>
          )}
          <span className="mt-2 flex items-baseline gap-2">
            <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--color-muted)]">
              {card.label}
            </span>
            <span className="font-mono text-sm font-semibold tracking-[0.12em] tabular-nums text-[var(--color-body)]">
              {card.display}
            </span>
          </span>
        </span>
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition-transform group-hover:scale-105"
          style={{ background: card.accent, color: card.accentInk }}
          aria-hidden
        >
          {card.primary === "number" ? "＃" : card.primary === "qr" ? "▣" : "▥"}
        </span>
      </button>
      {managing && (
        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-line-soft)]/60 px-4 py-1.5">
          {confirming ? (
            <>
              <span className="mr-auto text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
                {card.builtin ? "Hide this card?" : "Delete this card?"}
              </span>
              <button
                onClick={onRemove}
                className="min-h-8 text-[10px] uppercase tracking-[0.16em] text-[var(--color-terra)]"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="min-h-8 text-[10px] uppercase tracking-[0.16em] text-[var(--color-faint)]"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="min-h-8 text-[10px] uppercase tracking-[0.16em] text-[var(--color-faint)] hover:text-[var(--color-terra)]"
            >
              {card.builtin ? "Hide" : "Remove"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ACCENTS = [
  "#b1402a",
  "#3f7a4a",
  "#2b6fe0",
  "#be8520",
  "#6a3838",
  "#4f6a3b",
];

function AddCardForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: Parameters<typeof newCard>[0]) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("Member number");
  const [primary, setPrimary] = useState<MemberCard["primary"]>("barcode");
  const [accent, setAccent] = useState(ACCENTS[0]);

  const field =
    "min-h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:border-[var(--color-terra)] focus:outline-none";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !value.trim()) return;
        onAdd({ name, value, label, primary, accent });
      }}
      className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">
        New card
      </p>
      <div className="mt-3 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Shop or programme"
          className={field}
          autoFocus
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Member number or phone"
          inputMode="text"
          className={`${field} font-mono tracking-[0.1em]`}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What it is called"
          className={field}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-[var(--color-line)] text-[10px] uppercase tracking-[0.16em]">
          {(["qr", "barcode", "number"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrimary(p)}
              aria-pressed={primary === p}
              className={`min-h-9 px-3 ${primary === p ? "bg-[var(--color-terra)] text-[var(--color-cream)]" : "text-[var(--color-muted)]"}`}
            >
              {p === "qr" ? "QR" : p === "barcode" ? "Barcode" : "Number"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              aria-label={`Colour ${a}`}
              aria-pressed={accent === a}
              onClick={() => setAccent(a)}
              className={`h-7 w-7 rounded-full transition-transform ${accent === a ? "scale-110 ring-2 ring-[var(--color-ink)] ring-offset-2 ring-offset-[var(--color-card)]" : ""}`}
              style={{ background: a }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim() || !value.trim()}
          className="min-h-10 rounded-full bg-[var(--color-terra)] px-5 text-[11px] uppercase tracking-[0.18em] text-[var(--color-cream)] disabled:opacity-50"
        >
          Add card
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-10 px-3 text-[11px] uppercase tracking-[0.18em] text-[var(--color-faint)] hover:text-[var(--color-terra)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
