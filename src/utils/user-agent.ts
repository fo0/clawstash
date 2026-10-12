// Short, human-readable client label for an Access Log row.
//
// The server records the `User-Agent` header of every REST / UI access, but a
// raw header is either a 150-character browser string that always starts with
// `Mozilla/5.0` or a bare product token (`curl/8.5.0`, `python-httpx/0.27.0`).
// Neither fits a list row: the first says nothing in its visible part, the
// second is fine as-is. Browsers are reduced to "<name> <major version>",
// everything else to its first product token. The full header stays available
// in the row's tooltip — this label is a hint, not an identification.
//
// Pure (no React) so it can be unit-tested directly.

/** Longest label shown for a non-browser client; longer tokens are cut with an ellipsis. */
export const MAX_CLIENT_LABEL = 40;

/** Checked in order — Edge and Opera also carry `Chrome/`, Chrome also carries `Safari/`. */
const BROWSERS: readonly [name: string, pattern: RegExp][] = [
  ['Edge', /\bEdg(?:e|A|iOS)?\/(\d+)/],
  ['Opera', /\bOPR\/(\d+)/],
  ['Firefox', /\b(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /\b(?:Chrome|CriOS)\/(\d+)/],
  ['Safari', /\bVersion\/(\d+).*\bSafari\//],
];

/**
 * Label for a `User-Agent` header, or `null` when there is none.
 *
 * `Mozilla/…` strings become "Firefox 131", "Chrome 129", … and "Browser" when
 * no known engine token is found; anything else is reduced to its first
 * whitespace-separated token, capped at {@link MAX_CLIENT_LABEL} characters.
 */
export function userAgentLabel(userAgent: string | null | undefined): string | null {
  const ua = userAgent?.trim();
  if (!ua) return null;
  if (ua.startsWith('Mozilla/')) {
    for (const [name, pattern] of BROWSERS) {
      const match = pattern.exec(ua);
      if (match) return `${name} ${match[1]}`;
    }
    return 'Browser';
  }
  const token = ua.split(/\s/, 1)[0];
  return token.length > MAX_CLIENT_LABEL ? `${token.slice(0, MAX_CLIENT_LABEL - 1)}…` : token;
}
