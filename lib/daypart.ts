// Which meal the clock is pointing at — the Discover headline follows it
// ("What's for breakfast?" over morning coffee, not dinner at 8 am).
// Buckets align with the page greeting: <5 up-late, <11 morning, <15 afternoon.
export function daypartWord(hour: number): "breakfast" | "lunch" | "dinner" {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  return "dinner"; // afternoon, evening, and the up-late hours
}
