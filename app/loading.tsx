// Route-level skeleton: every tab is force-dynamic, so this is what a tap shows while the server answers.
export default function Loading() {
  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 pt-8 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--color-paper-2)]" />
      <div className="mt-4 h-9 w-2/3 animate-pulse rounded-xl bg-[var(--color-paper-2)]" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-[var(--color-line-soft)] bg-[var(--color-card)]/60 p-3">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-[var(--color-paper-2)]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded-full bg-[var(--color-paper-2)]" />
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-[var(--color-paper-2)]" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
