/**
 * Escape a string for safe inclusion in HTML body text or attribute values.
 * Escapes the four characters HTML treats as syntactically significant.
 *
 * The ampersand replacement runs first so subsequent entity insertions
 * (`&amp;`, `&lt;`, etc.) are not double-escaped.
 *
 * Centralised here so all callers (markdown rendering, code highlighting,
 * stash view) cannot drift on the escape set.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
