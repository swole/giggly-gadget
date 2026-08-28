// Shrink a phone photo before sending it to the server. Vercel caps request bodies at
// ~4.5 MB and a raw iPhone photo is 3-6 MB; 1600px JPEG at 0.82 is ~300-600 KB and
// plenty for reading a cookbook page. Also converts HEIC/PNG to JPEG via the canvas.

export async function downscaleImage(
  file: File,
  maxEdge = 1600,
  quality = 0.82,
): Promise<{ media_type: "image/jpeg"; data_base64: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Could not read that image (HEIC? try taking a screenshot of it)");
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const data_base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { media_type: "image/jpeg", data_base64, width: w, height: h };
}
