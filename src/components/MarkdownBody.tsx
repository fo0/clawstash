import { memo } from 'react';
import type { MouseEvent } from 'react';
import { useCodeBlockCopy } from '../hooks/useCodeBlockCopy';

interface Props {
  /** Pre-rendered, sanitised Markdown HTML. */
  html: string;
}

/**
 * The actual HTML blob, memoised on the HTML string.
 *
 * This memo is load-bearing for inline Mermaid diagrams (#286). StashViewer
 * re-renders many times during a full page load (sidebar list resolves, the
 * admin-session check resolves, etc.). React re-applies `dangerouslySetInnerHTML`
 * on each of those re-renders, which tears down the inline
 * `.mermaid-placeholder` nodes — and any SVG already hydrated into them — and
 * recreates fresh, empty ones. Because the final re-apply lands AFTER the
 * hydration effect has run, the diagrams stayed blank on F5 / direct URL (but
 * worked via SPA navigation, where the app is idle and no re-render storm
 * occurs).
 *
 * Memoising on the HTML string means the blob is written to the DOM once and
 * the placeholder nodes survive long enough to be hydrated and stay hydrated.
 * `React.memo`'s shallow prop compare treats the (stable) string by value, so a
 * parent re-render with unchanged content is a no-op here; a real content
 * change still re-renders and re-hydrates.
 *
 * `onClick` must therefore stay referentially stable — `useCodeBlockCopy`
 * guarantees that. The copy-status state it owns lives in the wrapper below,
 * outside this memo, so status updates cannot re-apply the blob either.
 */
const MarkdownHtml = memo(function MarkdownHtml({
  html,
  onClick,
}: {
  html: string;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className="file-rendered markdown-body"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/**
 * Renders a block of pre-sanitised Markdown HTML.
 *
 * Fenced code blocks inside the blob carry a copy button emitted by the
 * Markdown renderer (`wrapCodeBlockWithCopy`); the single delegated click
 * handler below is what makes them work.
 */
export default function MarkdownBody({ html }: Props) {
  const { handleClick, announcement } = useCodeBlockCopy();
  return (
    <>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      <MarkdownHtml html={html} onClick={handleClick} />
    </>
  );
}
