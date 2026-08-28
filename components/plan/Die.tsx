// Five-pip die, drawn inline so it renders identically everywhere.
// (The ⚄ character comes out as a tofu box on Windows Chrome.)
export function Die({ className = "", size = 14 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="8.2" cy="8.2" r="2" fill="currentColor" />
      <circle cx="15.8" cy="8.2" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="8.2" cy="15.8" r="2" fill="currentColor" />
      <circle cx="15.8" cy="15.8" r="2" fill="currentColor" />
    </svg>
  );
}
