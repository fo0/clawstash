/**
 * Format a date string as "MM/DD/YYYY, HH:MM" (used in token lists, etc.)
 */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Format a date string as "M/D/YYYY" (used in sidebar, cards)
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  });
}

/**
 * Format a date string as relative time ("just now", "5m ago", "3d ago")
 * Falls back to date-only format for dates older than 30 days.
 */
export function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
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
