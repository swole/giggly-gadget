"use client";

import { useEffect, useRef } from "react";
import qrcode from "qrcode-generator";
import JsBarcode from "jsbarcode";

/** Narrow-bar width in the barcode's own units; the SVG scales from there. */
const BAR_WIDTH = 2.4;

/**
 * QR rendered as one <path> of 1×1 module squares. Pure — no refs, no effects —
 * so it paints in the first frame at the till instead of after hydration.
 * Error correction M: survives a smudged screen without bloating the grid.
 * The default quiet zone is the 4 modules the spec asks for.
 */
export function QrCode({ value, quiet = 4, className }: { value: string; quiet?: number; className?: string }) {
  let modules = 0;
  let d = "";
  try {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    modules = qr.getModuleCount();
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
      }
    }
  } catch {
    return <CodeFallback label="QR code" />;
  }

  const side = modules + quiet * 2;
  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      className={className}
      role="img"
      aria-label={`QR code for ${value}`}
      shapeRendering="crispEdges"
    >
      <rect width={side} height={side} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}

/**
 * Code 128 via JsBarcode, which owns the symbology tables. It writes into the
 * <svg> imperatively and sets a viewBox, so CSS width:100% keeps it responsive.
 */
export function Barcode({ value, height = 90, className }: { value: string; height?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  // Code 128 covers ASCII only. Deciding this during render rather than in the
  // effect keeps the fallback a render decision instead of a cascading setState.
  const encodable = value.length > 0 && [...value].every((ch) => ch.charCodeAt(0) < 128);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !encodable) return;
    JsBarcode(svg, value, {
      format: "CODE128",
      displayValue: false,
      height,
      width: BAR_WIDTH,
      marginTop: 0,
      marginBottom: 0,
      // Code 128 wants a quiet zone of at least 10 narrow bars each side, or the
      // scanner never locks onto the start pattern.
      marginLeft: BAR_WIDTH * 11,
      marginRight: BAR_WIDTH * 11,
      background: "#ffffff",
      lineColor: "#000000",
      valid: () => {},
    });
  }, [value, height, encodable]);

  if (!encodable) return <CodeFallback label="barcode" />;
  return <svg ref={ref} className={className} role="img" aria-label={`Barcode for ${value}`} />;
}

const FALLBACK_CLASS = "rounded-xl border border-dashed border-black/20 px-4 py-6 text-center text-xs text-black/60";

function CodeFallback({ label }: { label: string }) {
  return <div className={FALLBACK_CLASS}>Could not draw a {label} for this value — read the number out instead.</div>;
}
