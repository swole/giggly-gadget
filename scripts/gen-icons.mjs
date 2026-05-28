import sharp from "sharp";
import { writeFile } from "node:fs/promises";

// Maskable PWA icons want their main artwork inside the "safe zone" — a centered
// circle of diameter = 0.8 × the icon edge. We respect that.

function svg(size) {
  const bg = "#faf5ea";       // background_color from manifest
  const accent = "#1a1612";   // dark warm
  const fork = "#d97757";     // accent — warm terracotta
  const cx = size / 2;
  const cy = size / 2;
  // Safe area circle diameter (for reference): size * 0.8

  // Render a stylized chef's hat + steam wisp using primitives.
  // Hat band y, hat puff radius, etc. scale off size.
  const bandH = size * 0.10;
  const bandY = size * 0.62;
  const puffR = size * 0.13;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <!-- chef hat puff -->
  <circle cx="${cx - puffR * 1.2}" cy="${cy - puffR * 0.3}" r="${puffR * 1.05}" fill="${accent}"/>
  <circle cx="${cx + puffR * 1.2}" cy="${cy - puffR * 0.3}" r="${puffR * 1.05}" fill="${accent}"/>
  <circle cx="${cx}" cy="${cy - puffR * 1.1}" r="${puffR * 1.25}" fill="${accent}"/>
  <!-- chef hat band -->
  <rect x="${cx - puffR * 1.8}" y="${bandY}" width="${puffR * 3.6}" height="${bandH}" rx="${bandH * 0.15}" fill="${accent}"/>
  <!-- steam wisp -->
  <path d="M ${cx - puffR * 0.4} ${cy - puffR * 2.6}
           q ${puffR * 0.5} ${-puffR * 0.5} 0 ${-puffR}
           q ${-puffR * 0.5} ${-puffR * 0.5} 0 ${-puffR}"
        stroke="${fork}" stroke-width="${size * 0.022}" stroke-linecap="round" fill="none"/>
</svg>`;
}

async function gen(size, out) {
  const buf = Buffer.from(svg(size));
  await sharp(buf).png().toFile(out);
  console.log(`wrote ${out}`);
}

await gen(192, "public/icon-192.png");
await gen(512, "public/icon-512.png");
await gen(180, "public/apple-touch-icon.png");
await gen(32, "public/favicon-32.png");
await gen(16, "public/favicon-16.png");

// Write a 32x32 ICO-compatible PNG named favicon.ico (browsers accept PNG-in-ICO container, but PNG works for modern)
await gen(32, "public/favicon.ico");
