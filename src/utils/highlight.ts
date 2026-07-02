export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Split `text` into consecutive segments, flagging the ones that
 * case-insensitively match `query`. Used to <mark> the search term inside
 * quick-search results so users can see *why* a stash matched.
 *
 * The query is treated as a literal (no regex), so arbitrary user input is
 * safe; matched slices are taken from the original `text` to preserve the
 * source casing. Rendering the segments as React text nodes keeps it
 * XSS-safe — never feed them into dangerouslySetInnerHTML.
 */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  if (!text) return [];
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];

  const segments: HighlightSegment[] = [];
  const haystack = text.toLowerCase();
  let start = 0;
  let idx = haystack.indexOf(needle, start);
  while (idx !== -1) {
    if (idx > start) segments.push({ text: text.slice(start, idx), match: false });
    segments.push({ text: text.slice(idx, idx + needle.length), match: true });
    start = idx + needle.length;
    idx = haystack.indexOf(needle, start);
  }
  if (start < text.length) segments.push({ text: text.slice(start), match: false });
  return segments;
}
