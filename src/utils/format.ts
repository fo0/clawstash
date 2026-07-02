/**
 * Format a byte count as a compact human-readable size ("0 B", "512 B",
 * "1.5 KB", "3.2 MB", ...). Uses 1024-based units. Bytes show no decimals;
 * larger units show one decimal unless the value is a whole number. Negative
 * or NaN inputs are clamped to "0 B".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  // Bytes are always whole; higher units get one decimal unless already whole.
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${units[unit]}`;
}

/**
 * Format a date string as "MM/DD/YYYY, HH:MM" (used in token lists, etc.)
 */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a date string as "M/D/YYYY" (used in sidebar, cards)
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date string as relative time ("just now", "5m ago", "3d ago")
 * Falls back to date-only format for dates older than 30 days.
 */
export function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return 'just now'; // future date (clock skew)
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return formatDate(dateStr);
}

/**
 * Format an ISO date string as a vYYYYMMDD-HHMM build-version label (UTC).
 *
 * Returns null on Invalid Date so callers can fall back to a default UI
 * instead of rendering "vNaNNaNNaN-NaNNaN" (`new Date('garbage')` →
 * Invalid Date → all `getUTC*()` return NaN).
 */
export function formatBuildVersion(isoDate: string): string | null {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `v${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

/**
 * Filesystem-safe ISO timestamp for export filenames (`YYYY-MM-DDTHH-MM-SS`).
 *
 * The previous inline `toISOString().replace(/[:.]/g, '-').slice(0, 19)`
 * pattern left a trailing `-` artifact (e.g. `2026-05-16T10-30-12-`) because
 * the `.` in `.456Z` got replaced before the slice. Slicing first guarantees
 * a clean separator-replaced label and DRYs the helper across export
 * callsites (UI download name + Content-Disposition header).
 */
export function formatExportTimestamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19).replace(/[:.]/g, '-');
}

/**
 * Format a count with its noun, choosing singular/plural by the count
 * ("1 stash", "2 stashes", "0 files"). English-only; irregular plurals pass
 * an explicit `plural` (the default appends "s"). Avoids the "1 stashes"
 * grammar glitch in count labels across the dashboard, settings and graph.
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
