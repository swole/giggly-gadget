// Screen Wake Lock: keep the phone screen on while in cook mode.
// Uses the Wake Lock API (iOS 16.4+ Safari, Chrome, Edge, Firefox) with no
// fallback for older browsers — the user can keep tapping the screen.

type Sentinel = {
  release: () => Promise<void>;
  released: boolean;
  addEventListener: (event: "release", cb: () => void) => void;
};

export async function requestWakeLock(): Promise<Sentinel | null> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return null;
  try {
    const wakeLock = (navigator as unknown as { wakeLock: { request: (t: string) => Promise<Sentinel> } }).wakeLock;
    const sentinel = await wakeLock.request("screen");
    return sentinel;
  } catch {
    return null;
  }
}
