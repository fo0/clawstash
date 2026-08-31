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
