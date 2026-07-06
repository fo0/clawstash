/**
 * Build a shareable deep-link URL for a stash from a page origin + stash id.
 *
 * Mirrors the App router's `/stash/:id` route (see `getInitialRoute` in
 * `App.tsx`) so a copied link opens the stash directly. A trailing slash on
 * `origin` is trimmed so we never emit `…//stash/…`. When `origin` is empty
 * (SSR / unknown origin) the value degrades to the relative `/stash/:id`
 * path, which is still a valid, clickable link rather than `undefined/stash/…`.
 */
export function buildStashUrl(origin: string, id: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/stash/${id}`;
}
