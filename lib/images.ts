// Right-sized thumbnails for hotlinked images. Pexels serves any width via query params;
// YouTube thumbnails come in fixed sizes. Anything else is returned untouched.
export function thumb(url: string | null | undefined, width: number): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "images.pexels.com") {
      u.searchParams.set("auto", "compress");
      u.searchParams.set("cs", "tinysrgb");
      u.searchParams.set("w", String(width));
      return u.toString();
    }
    if (u.hostname === "i.ytimg.com") {
      const size = width <= 320 ? "mqdefault" : width <= 480 ? "hqdefault" : width <= 640 ? "sddefault" : "maxresdefault";
      return u.toString().replace(/\/(maxresdefault|sddefault|hqdefault|mqdefault|default)\.jpg$/, `/${size}.jpg`);
    }
    return url;
  } catch {
    return url;
  }
}
