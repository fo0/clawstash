/**
 * Sanitize an attacker-influenced request value (client IP, User-Agent) for
 * interpolation into a single-line stdout log message.
 *
 * Strips C0 control characters (0x00–0x1F, including CR/LF), DEL + C1
 * controls (0x7F–0x9F, e.g. 8-bit CSI), the Unicode line separators
 * U+2028/U+2029 (treated as newlines by some JS-based log viewers), and
 * bidi direction controls (U+200E/F, U+202A–U+202E, U+2066–U+2069, which
 * can visually reorder a log line in bidi-aware viewers, Trojan-source
 * style) so a crafted header cannot forge additional log lines, smuggle
 * terminal escape sequences, or spoof what a human reads in the audit
 * trail (log forging, OWASP A09). Returns 'unknown' when the value is
 * missing or empty after stripping, matching the audit-log convention for
 * absent values.
 *
 * The regex uses explicit \xNN / \uNNNN escapes on purpose — literal
 * control bytes are invisible and silently break when an editor or
 * formatter strips non-printables.
 *
 * The DB `access_log` is intentionally NOT routed through this: values are
 * stored raw via bound parameters and rendered safely by the UI.
 */
export function sanitizeLogValue(value: string | undefined): string {
  if (!value) return 'unknown';
  const stripped = value.replace(
    /[\x00-\x1f\x7f-\x9f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    '',
  );
  return stripped === '' ? 'unknown' : stripped;
}

/**
 * Like {@link sanitizeLogValue}, but additionally wraps the result in double
 * quotes with backslash escaping (`\` -> `\\`, `"` -> `\"`).
 *
 * `sanitizeLogValue` only removes control/line/bidi characters, so printable
 * attacker text still lands mid-line: a User-Agent may legitimately (or
 * maliciously) contain the literal substring `[audit] admin export: ...` with
 * no control chars at all, which confuses an unanchored `grep '\[audit\]'`
 * over the logs (BACKLOG #121). Quoting bounds the attacker-influenced value
 * so it is unambiguously one field \u2014 `ua="...[audit]..."` reads as data, and
 * any embedded `"` is escaped so the value cannot be terminated early.
 *
 * Use for attacker-influenced fields (client IP, User-Agent) in single-line
 * audit log messages. The `unknown` fallback is also quoted (`"unknown"`) so
 * the field is always quoted regardless of input.
 */
export function quoteLogValue(value: string | undefined): string {
  const sanitized = sanitizeLogValue(value);
  return `"${sanitized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
