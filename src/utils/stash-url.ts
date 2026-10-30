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

/**
 * A ready-to-run `curl` call for one of the stash's REST endpoints: absolute
 * URL plus the `Authorization` header with the same `YOUR_TOKEN` placeholder
 * the API settings' examples use. `path` must already be URL-encoded (the
 * viewer encodes filenames), so it carries no `"`, `$` or backtick and the
 * double quotes are safe in POSIX shells, PowerShell and cmd alike. An empty
 * `origin` degrades to the relative path, like `buildStashUrl`.
 */
export function buildCurlCommand(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, '');
  return `curl -H "Authorization: Bearer YOUR_TOKEN" "${base}${path}"`;
}
