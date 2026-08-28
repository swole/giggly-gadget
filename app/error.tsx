"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pt-14 text-center sm:px-6">
      <div className="text-4xl">🫕</div>
      <h1 className="font-display-italic mt-3 text-3xl text-[var(--color-ink)]">That boiled over.</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Something went wrong loading this screen. Usually a retry fixes it.</p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-[var(--color-ink)] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-cream)] active:scale-[0.98]"
        >
          Try again
        </button>
        <Link href="/" className="rounded-full border border-[var(--color-line)] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Kitchen
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-[10px] text-[var(--color-faint)]">ref {error.digest}</p>}
    </main>
  );
}
