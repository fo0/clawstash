import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { copyToClipboard } from '../utils/clipboard';
import { COPY_TOAST_DURATION_MS } from '../utils/constants';
import { findCodeCopyTarget, setCodeCopyState } from '../utils/code-copy';

interface UseCodeBlockCopyReturn {
  /** Attach to the element that holds the rendered Markdown HTML. */
  handleClick: (event: MouseEvent<HTMLElement>) => void;
  /** Screen-reader status text; render inside an `aria-live` region. */
  announcement: string;
}

/**
 * Delegated copy handler for the copy buttons emitted into rendered Markdown
 * by `wrapCodeBlockWithCopy`.
 *
 * One handler per Markdown container instead of one listener per block: the
 * buttons live inside a `dangerouslySetInnerHTML` blob, so there is no React
 * element to attach to and any per-node listener would have to be re-attached
 * every time the blob is re-applied.
 *
 * `handleClick` is referentially stable (state is kept in refs), so it can be
 * passed to a memoised child without defeating the memo — load-bearing for
 * `MarkdownBody`, whose memo keeps inline Mermaid diagrams alive (#286).
 */
export function useCodeBlockCopy(): UseCodeBlockCopyReturn {
  const [announcement, setAnnouncement] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeButtonRef = useRef<HTMLElement | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (activeButtonRef.current) {
      setCodeCopyState(activeButtonRef.current, null);
      activeButtonRef.current = null;
    }
  }, []);

  useEffect(() => reset, [reset]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      // React nulls `currentTarget` once dispatch finishes — capture it before
      // the await below.
      const root = event.currentTarget;
      const found = findCodeCopyTarget(event.target as Element | null, root);
      if (!found) return;
      event.preventDefault();
      void copyToClipboard(found.code).then((success) => {
        // Clear the previous button's feedback first — rapid clicks across
        // different blocks would otherwise leave a stale "Copied!" behind.
        reset();
        if (!document.contains(found.button)) return;
        activeButtonRef.current = found.button;
        setCodeCopyState(found.button, success ? 'copied' : 'failed');
        setAnnouncement(success ? 'Code copied to clipboard' : 'Copy failed');
        timerRef.current = setTimeout(() => {
          reset();
          setAnnouncement('');
        }, COPY_TOAST_DURATION_MS);
      });
    },
    [reset],
  );

  return { handleClick, announcement };
}
