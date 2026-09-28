import { useLayoutEffect, useRef } from 'react';

/**
 * Remember how far a shared scroll container was scrolled while one view was
 * on screen, and put it back when that view returns — as long as the view
 * still shows the same thing (`key`).
 *
 * App renders every view into the same `<main>` and unmounts the ones not
 * showing, so the container's `scrollTop` belongs to no view in particular:
 * opening a stash from deep in the dashboard and going back started the list
 * at the top again — the reader's place in a long list was simply lost. This
 * hook keeps the view's own offset instead.
 *
 * - While `active`, every scroll of the container is recorded together with
 *   the current `key` (the list's search / filter / sort / layout signature).
 * - When `active` turns true again, the recorded offset is restored if the
 *   key still matches. A different key means a different list — its old
 *   offset means nothing there, so the container starts at the top instead of
 *   at the offset the previous view happened to leave behind.
 *
 * Both effects are layout effects on purpose: the restore has to land before
 * the first paint of the returning view (no visible jump from the top), and
 * the scroll listener has to be gone before the next view's content replaces
 * this one's — the browser clamps `scrollTop` when the content shrinks and
 * reports that as a scroll event, which must not overwrite the saved offset.
 *
 * The container is passed as an element (from a callback ref held in state),
 * not a ref object: App renders nothing until the session check resolves and
 * then the login screen, so `<main>` mounts well after the first render — a
 * ref object would not re-run the effects when it finally gets its node, and
 * the listener would never be attached.
 */
export function useScrollMemory(container: HTMLElement | null, active: boolean, key: string): void {
  const savedRef = useRef<{ top: number; key: string } | null>(null);
  const wasActiveRef = useRef(active);

  // Restore on the way back in. Declared before the recorder so it runs first
  // when both fire in the same commit.
  useLayoutEffect(() => {
    if (container && active && !wasActiveRef.current) {
      const saved = savedRef.current;
      container.scrollTop = saved && saved.key === key ? saved.top : 0;
    }
    wasActiveRef.current = active;
  }, [container, active, key]);

  // Record while on screen. Also re-records on a key change without a scroll
  // (a new sort order keeps the offset), so the next return compares against
  // the list that was actually showing.
  useLayoutEffect(() => {
    if (!container || !active) return;
    const record = () => {
      savedRef.current = { top: container.scrollTop, key };
    };
    record();
    container.addEventListener('scroll', record, { passive: true });
    return () => container.removeEventListener('scroll', record);
  }, [container, active, key]);
}
