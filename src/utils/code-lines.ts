/**
 * Line numbers for the stash viewer's raw code view.
 *
 * The viewer highlights a whole file with Prism in one pass and injects the
 * result as a single `dangerouslySetInnerHTML` blob. To number its lines, the
 * blob is split at every newline and each line is wrapped in a
 * `<span class="code-line">`; CSS paints the number with a counter in a
 * `::before`, so copying a selection never picks the numbers up.
 *
 * Prism emits tokens that span several lines (block comments, template
 * strings, multi-line strings). A naive split would leave a line with an
 * unclosed `<span>` and the next one with a stray `</span>`, so the splitter
 * tracks the open tags: each line is closed where it ends and the same tags
 * are re-opened at the start of the next one. The token colour therefore
 * carries over the line break exactly as before.
 *
 * Input is Prism output or `escapeHtml` output: text is entity-escaped, so a
 * literal `<` or `>` never appears outside a tag and `\n` never appears inside
 * one. Only the fixed `code-line` wrapper is added; no content is unescaped.
 */

export const CODE_LINE_CLASS = 'code-line';

const TOKEN_RE = /<\/[^>]*>|<[^>]*>|\n/g;
const TAG_NAME_RE = /^<([a-zA-Z][a-zA-Z0-9-]*)/;

/**
 * Split highlighted HTML into one balanced HTML fragment per source line.
 * A trailing newline does not produce an empty last line — a file saved with
 * a final newline has as many lines as an editor shows for it.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  // Open tags, outermost first: the full opening tag (to re-open it on the
  // next line) and its name (to close it at the end of this one).
  const open: { tag: string; name: string }[] = [];
  let current = '';
  let last = 0;

  for (const match of html.matchAll(TOKEN_RE)) {
    const token = match[0];
    current += html.slice(last, match.index);
    last = match.index + token.length;

    if (token === '\n') {
      const closers = open
        .slice()
        .reverse()
        .map((t) => `</${t.name}>`)
        .join('');
      lines.push(current + closers);
      current = open.map((t) => t.tag).join('');
    } else if (token.startsWith('</')) {
      open.pop();
      current += token;
    } else {
      const name = TAG_NAME_RE.exec(token)?.[1] ?? 'span';
      // Self-closing or void tags would never see a closer; Prism emits none,
      // but do not let one corrupt the stack if it ever does.
      if (!token.endsWith('/>')) open.push({ tag: token, name });
      current += token;
    }
  }
  current += html.slice(last);
  lines.push(current);

  if (lines.length > 1 && lines[lines.length - 1].replace(/<[^>]*>/g, '') === '') {
    lines.pop();
  }
  return lines;
}

/**
 * Wrap every line of highlighted HTML in a `code-line` span for the numbered
 * view. `lineCount` sizes the number gutter (digits of the highest number).
 */
export function toNumberedLinesHtml(html: string): { html: string; lineCount: number } {
  const lines = splitHighlightedLines(html);
  return {
    html: lines.map((line) => `<span class="${CODE_LINE_CLASS}">${line}</span>`).join(''),
    lineCount: lines.length,
  };
}
