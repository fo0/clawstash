// CSV export for the stash viewer's Access Log tab.
//
// The tab answers "who read this stash, and when?" on screen only; an audit
// question usually ends in a spreadsheet or a ticket. These helpers turn the
// entries currently on screen (the loaded page, after the source chips) into
// an RFC 4180 CSV document.
//
// `ip` and `user_agent` come straight from request headers, i.e. from whoever
// called the API. A value starting with `=`, `+`, `-`, `@`, a tab or a carriage
// return is executed as a formula by spreadsheet apps, so such cells get a
// leading apostrophe (OWASP "CSV injection"). The other columns are
// server-written but go through the same guard.
//
// Pure (no React) so they can be unit-tested directly.

import type { AccessLogEntry } from '../types';

/** Column order of the exported file. */
export const ACCESS_LOG_CSV_COLUMNS = [
  'timestamp',
  'source',
  'action',
  'ip',
  'user_agent',
] as const;

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** One CSV cell: formula-guarded, quoted when it holds a delimiter, quote or line break. */
export function csvCell(value: string | null | undefined): string {
  let text = value ?? '';
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Serialize access-log entries as CSV: a header row, then one row per entry in
 * the given order, CRLF line endings (RFC 4180). An empty list yields the
 * header row only.
 */
export function buildAccessLogCsv(entries: readonly AccessLogEntry[]): string {
  const rows = [ACCESS_LOG_CSV_COLUMNS.join(',')];
  for (const entry of entries) {
    rows.push(ACCESS_LOG_CSV_COLUMNS.map((column) => csvCell(entry[column])).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}

/**
 * Filename for an exported log: `clawstash-access-log-<id>-2026-10-12.csv`.
 * The stash id rather than its name: it is filesystem-safe as-is and matches
 * the `stash_id` the API and MCP tools speak. Local date, so it matches the day
 * the user clicked.
 */
export function accessLogCsvFilename(stashId: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `clawstash-access-log-${stashId}-${day}.csv`;
}
