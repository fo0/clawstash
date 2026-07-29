/**
 * Contrast helpers for text painted onto canvas-drawn shapes.
 *
 * The graph canvases label nodes with a count badge drawn *inside* the node.
 * That text was always white, which works on the dark cluster colours but
 * collapses to ~1.9:1 on the light ones (`#79c0ff`, `#ffa657`) — unreadable,
 * and far below the 3:1 floor. CSS can't help here: the badge is a
 * `fillText` on a `<canvas>`, so the colour has to be picked in JS.
 */

/** App surface behind the (transparent) graph canvases — `--bg-primary`. */
const CANVAS_BG: [number, number, number] = [13, 17, 23];

/** Text colours the badges pick between. */
const LIGHT_TEXT = 'rgba(255, 255, 255, 0.9)';
const DARK_TEXT = 'rgba(13, 17, 23, 0.92)';

/**
 * Relative luminance above which white text drops below 3:1 and the dark
 * variant must be used instead. White on L=0.3 is exactly 1.05/0.35 = 3:1.
 */
const WHITE_TEXT_MAX_LUMINANCE = 0.3;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ];
}

/** WCAG relative luminance of an opaque sRGB colour. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Pick a badge text colour for a node filled with `hex` at `alpha` over the
 * canvas background. Semi-transparent fills are composited first — a cluster
 * colour at 0.2 alpha is nearly the dark page background, so it still wants
 * white text even though the raw hex is light.
 */
export function badgeTextColor(hex: string, alpha = 1): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, alpha));
  const composited: [number, number, number] = [
    r * a + CANVAS_BG[0] * (1 - a),
    g * a + CANVAS_BG[1] * (1 - a),
    b * a + CANVAS_BG[2] * (1 - a),
  ];
  return relativeLuminance(composited) > WHITE_TEXT_MAX_LUMINANCE ? DARK_TEXT : LIGHT_TEXT;
}
