// Client-side source filtering for the stash viewer's Access Log tab.
//
// The log mixes three channels (REST API, MCP, the web UI) in one reverse
// chronological list, and the tab pages up to 1000 entries. Answering "did an
// agent read this, or was that just me opening the tab?" meant scanning every
// row by badge. These helpers back a small filter chip row above the list.
//
// Filtering is deliberately client-side over the already-fetched page: the
// server endpoint takes no source parameter, and a server-side filter would
// change what "the 100 most recent entries" means mid-list. The chips
// therefore describe exactly the rows currently on screen.
//
// Pure (no React) so they can be unit-tested directly.

import type { AccessLogEntry } from '../types';

/** The channels the access log records, in the order the chips render. */
export const ACCESS_SOURCES = ['api', 'mcp', 'ui'] as const;

export type AccessSource = (typeof ACCESS_SOURCES)[number];

/** Chip selection: a single channel, or every channel at once. */
export type AccessSourceFilter = AccessSource | 'all';

/**
 * Count the loaded entries per source. Sources the current page contains none
 * of are still present with a count of `0` so the chip row keeps a stable
 * width while "Show more" pages in new rows.
 *
 * An entry whose source is not one of {@link ACCESS_SOURCES} (a newer server
 * writing a channel this build does not know) is counted nowhere but is never
 * hidden — see {@link filterBySource}.
 */
export function countBySource(entries: readonly AccessLogEntry[]): Record<AccessSource, number> {
  const counts = { api: 0, mcp: 0, ui: 0 } satisfies Record<AccessSource, number>;
  for (const entry of entries) {
    // Own-property check, not `in`: `in` walks the prototype chain, so an
    // unknown source literally named `toString` / `constructor` / `valueOf`
    // would pass the guard and then `counts[source] += 1` would turn an
    // inherited function into `NaN` on a new own property. `source` is typed
    // as a union, but these entries arrive as unvalidated JSON from the API,
    // so the guard has to hold at runtime — the same idiom `languages.ts`
    // already uses for its lookup maps.
    if (Object.prototype.hasOwnProperty.call(counts, entry.source)) counts[entry.source] += 1;
  }
  return counts;
}

/**
 * Narrow the entries to a single source. `'all'` returns the input unchanged
 * (same reference, so React can skip re-rendering the list).
 */
export function filterBySource(
  entries: readonly AccessLogEntry[],
  filter: AccessSourceFilter,
): readonly AccessLogEntry[] {
  if (filter === 'all') return entries;
  return entries.filter((entry) => entry.source === filter);
}

/**
 * Whether a filter chip should be offered at all. Only shown once the loaded
 * page actually mixes channels — with a single-source log the chips would be
 * three buttons where two do nothing but empty the list.
 */
export function hasMixedSources(counts: Record<AccessSource, number>): boolean {
  return ACCESS_SOURCES.filter((source) => counts[source] > 0).length > 1;
}
