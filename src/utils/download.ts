// Client-side file download.
//
// Lifted out of `StashViewer` so the version history can offer the same
// affordance: a version's files could be copied to the clipboard but not
// saved, while the current version offered both.
//
// No server round-trip — the content is already in memory, so a temporary
// object URL is cheaper (and works for an archived or deleted-from-disk
// version, which has no raw endpoint of its own).

/**
 * Trigger a browser download of `content` under `filename`.
 *
 * The anchor is appended to the document because Firefox ignores a click on a
 * detached one, and the object URL is revoked on a delay so the download has
 * started before the blob goes away. No-op outside a browser (SSR).
 */
export function downloadTextFile(filename: string, content: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Release the object URL after a short delay so the download initiates.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Last-resort background for a canvas export: the literal value of
 * `--bg-secondary`, the CSS variable the graph container paints itself with.
 * Only used when the computed style is unreadable (no `getComputedStyle`
 * result, a detached canvas), so the exported PNG is never transparent.
 */
const CANVAS_EXPORT_FALLBACK_BG = '#151b23';

/**
 * The background the given canvas visually sits on: its container's computed
 * background, falling back to the `--bg-secondary` custom property and finally
 * to the literal above.
 *
 * The graph canvases `clearRect()` each frame instead of filling, so their own
 * pixels are transparent and only the element behind them supplies the colour.
 */
function resolveCanvasBackground(canvas: HTMLCanvasElement): string {
  if (typeof getComputedStyle !== 'function') return CANVAS_EXPORT_FALLBACK_BG;
  const host = canvas.parentElement ?? canvas;
  const background = getComputedStyle(host).backgroundColor;
  // `transparent` and any fully transparent rgba() would export as
  // transparency again. Anchored to the rgba() form on purpose: a bare
  // `rgb(21, 27, 0)` also ends in ", 0)" and is perfectly opaque.
  const invisible =
    !background || background === 'transparent' || /^rgba\(.*,\s*0(\.0+)?\s*\)$/.test(background);
  if (!invisible) return background;
  const variable = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-secondary')
    .trim();
  return variable || CANVAS_EXPORT_FALLBACK_BG;
}

/**
 * Save the pixels of `canvas` as a PNG download.
 *
 * Composites onto an opaque background first: exporting the graph canvas as-is
 * yields light nodes and labels on transparency, which is unreadable in every
 * viewer that puts white behind a PNG.
 *
 * Returns `false` when the environment cannot produce the image at all (SSR,
 * an empty canvas, no 2D context, no `toBlob`) so the caller can report the
 * failure instead of appearing to do nothing. A `true` only means the encode
 * was started — it happens off the main thread from there.
 */
export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  if (canvas.width === 0 || canvas.height === 0) return false;
  const target = document.createElement('canvas');
  target.width = canvas.width;
  target.height = canvas.height;
  const ctx = target.getContext('2d');
  if (!ctx || typeof target.toBlob !== 'function') return false;
  ctx.fillStyle = resolveCanvasBackground(canvas);
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.drawImage(canvas, 0, 0);
  target.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, 'image/png');
  return true;
}

/**
 * Filename for an exported graph image: `clawstash-tag-graph-2026-09-07.png`.
 * Dated so several exports of the same graph land side by side in the download
 * folder instead of overwriting each other, and local-time so the date matches
 * the day the user actually clicked the button.
 */
export function graphImageFilename(kind: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `clawstash-${kind}-${day}.png`;
}

/**
 * Filename for a file saved out of an older version: `name.v3.ext`, so several
 * versions of the same file land side by side in the download folder instead
 * of overwriting each other (or the current version already saved from the
 * viewer). A dotfile or an extensionless name gets the suffix appended.
 */
export function versionedFilename(filename: string, version: number): string {
  const dot = filename.lastIndexOf('.');
  // `dot > 0` on purpose: a leading dot is part of a dotfile's name, not an
  // extension separator, so `.env` becomes `.env.v3` rather than `.v3env`.
  if (dot > 0) return `${filename.slice(0, dot)}.v${version}${filename.slice(dot)}`;
  return `${filename}.v${version}`;
}
