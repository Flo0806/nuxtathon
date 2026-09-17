import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import type { EventConfig } from "#shared/types/event";

const W = 1200;
const H = 630;
const MAX_TEXT_W = 1040;

const NUXT_MARK =
  "M281.44 397.667H438.32C443.326 397.667 448.118 395.908 452.453 393.427C456.789 390.946 461.258 387.831 463.76 383.533C466.262 379.236 468.002 374.36 468 369.399C467.998 364.437 466.266 359.563 463.76 355.268L357.76 172.947C355.258 168.65 352.201 165.534 347.867 163.053C343.532 160.573 337.325 158.813 332.32 158.813C327.315 158.813 322.521 160.573 318.187 163.053C313.852 165.534 310.795 168.65 308.293 172.947L281.44 219.587L227.733 129.13C225.229 124.834 222.176 120.307 217.84 117.827C213.504 115.346 208.713 115 203.707 115C198.701 115 193.909 115.346 189.573 117.827C185.238 120.307 180.771 124.834 178.267 129.13L46.8267 355.268C44.3208 359.563 44.0022 364.437 44 369.399C43.9978 374.36 44.3246 379.235 46.8267 383.533C49.3288 387.83 53.7979 390.946 58.1333 393.427C62.4688 395.908 67.2603 397.667 72.2667 397.667H171.2C210.401 397.667 238.934 380.082 258.827 346.787L306.88 263.4L332.32 219.587L410.053 352.44H306.88L281.44 397.667ZM169.787 352.44H100.533L203.707 174.36L256 263.4L221.361 323.784C208.151 345.387 193.089 352.44 169.787 352.44Z";

// Paths to the TTFs. resvg-js (native) only loads fonts from disk.
export type OgFonts = string[];

export interface OgText {
  eyebrow: string;
  title: string;
  footer: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fontOpts = (fonts: OgFonts) => ({ fontFiles: fonts, loadSystemFonts: false });

// Width of a single text run at the given size, measured by resvg itself, so
// the fit logic uses the same shaping as the final render.
function measure(fonts: OgFonts, text: string, family: string, size: number, spacing: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="400"><text x="0" y="200" font-family="${family}" font-size="${size}" letter-spacing="${spacing}">${esc(text)}</text></svg>`;
  return new Resvg(svg, { font: fontOpts(fonts) }).getBBox()?.width ?? 0;
}

// Largest size in [min, max] whose run fits MAX_TEXT_W. Letter spacing scales
// with the size so the tracking looks the same at every step.
function fit(
  fonts: OgFonts,
  text: string,
  family: string,
  max: number,
  min: number,
  trackingEm: number,
) {
  let size = max;
  while (size > min && measure(fonts, text, family, size, size * trackingEm) > MAX_TEXT_W) {
    size -= 2;
  }
  return { size, spacing: size * trackingEm };
}

export function buildOgSvg(fonts: OgFonts, input: OgText): string {
  // Fit and render the same string; case changes the width.
  const t = {
    eyebrow: input.eyebrow.toUpperCase(),
    title: input.title.toUpperCase(),
    footer: input.footer.toUpperCase(),
  };
  const eyebrow = fit(fonts, t.eyebrow, "JetBrains Mono", 30, 18, 0.32);
  const title = fit(fonts, t.title, "Chakra Petch", 150, 60, 0.02);
  const footer = fit(fonts, t.footer, "JetBrains Mono", 26, 16, 0.18);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="#1C4A38" stroke-opacity="0.35" stroke-width="1"/>
    </pattern>
    <radialGradient id="vignette" cx="50%" cy="45%" r="70%">
      <stop offset="0" stop-color="#04100B" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.85"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feComponentTransfer in="b" result="soft"><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
      <feMerge><feMergeNode in="soft"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-sm" x="-20%" y="-50%" width="140%" height="200%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feComponentTransfer in="b" result="soft"><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
      <feMerge><feMergeNode in="soft"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="#04100B"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <g transform="translate(560 108) scale(0.16)" filter="url(#glow-sm)">
    <path d="${NUXT_MARK}" fill="#00DC82"/>
  </g>
  <text x="600" y="276" text-anchor="middle" font-family="JetBrains Mono" font-weight="500" font-size="${eyebrow.size}" letter-spacing="${eyebrow.spacing}" fill="#FFB020">${esc(t.eyebrow)}</text>
  <text x="600" y="412" text-anchor="middle" font-family="Chakra Petch" font-weight="700" font-size="${title.size}" letter-spacing="${title.spacing}" fill="#80EEC0" filter="url(#glow)">${esc(t.title)}</text>
  <text x="600" y="497" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="${footer.size}" letter-spacing="${footer.spacing}" fill="#6FA891" fill-opacity="0.85">${esc(t.footer)}</text>
</svg>`;
}

export function renderOgPng(fonts: OgFonts, t: OgText): Buffer {
  const svg = buildOgSvg(fonts, t);
  return new Resvg(svg, { font: fontOpts(fonts), fitTo: { mode: "width", value: W } })
    .render()
    .asPng();
}

// "Jul 18-19, 2026" / "Jul 30 - Aug 1, 2026" / "Dec 31, 2026 - Jan 1, 2027".
export function formatWindow(config: Pick<EventConfig, "startsAt" | "endsAt">): string {
  const a = new Date(config.startsAt);
  const b = new Date(config.endsAt);
  const mon = (d: Date) => d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = (d: Date) => d.getUTCDate();
  const yr = (d: Date) => d.getUTCFullYear();
  if (yr(a) !== yr(b)) return `${mon(a)} ${day(a)}, ${yr(a)} - ${mon(b)} ${day(b)}, ${yr(b)}`;
  if (mon(a) !== mon(b)) return `${mon(a)} ${day(a)} - ${mon(b)} ${day(b)}, ${yr(a)}`;
  if (day(a) !== day(b)) return `${mon(a)} ${day(a)}-${day(b)}, ${yr(a)}`;
  return `${mon(a)} ${day(a)}, ${yr(a)}`;
}

export function ogTextFor(config: EventConfig, phase: string): OgText {
  const label =
    phase === "results" ? "Final results" : phase === "upcoming" ? "Coming up" : "Live leaderboard";
  return {
    eyebrow: config.eyebrow,
    title: config.title,
    footer: `${label} · ${formatWindow(config)}`,
  };
}

// Bump when the SVG layout changes, so cached PNGs and unfurler caches roll.
const RENDER_VERSION = 2;

// Cache key and `?v=` for the social preview.
export const ogHash = (t: OgText) =>
  createHash("sha256")
    .update(JSON.stringify([RENDER_VERSION, t.eyebrow, t.title, t.footer]))
    .digest("hex")
    .slice(0, 10);
