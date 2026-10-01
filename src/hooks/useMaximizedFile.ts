import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useBodyScrollLock } from './useBodyScrollLock';
import { useFocusTrap } from './useFocusTrap';
import { containsAppModal, isInsideAppModal } from '../utils/nested-modal';

interface MaximizedEntry {
  stashId: string;
  fileId: string;
}

export interface MaximizedFile {
  /** The file currently blown up to fill the viewport, or `null`. */
  maximizedFileId: string | null;
  /** Attach to the maximized file's box only — it is the dialog element. */
  maximizedRef: RefObject<HTMLDivElement | null>;
  /**
   * Maximize `fileId`, or restore it when it already is. `trigger` is the
   * button that asked; focus returns to it when the file is restored.
   */
  toggleMaximized: (fileId: string, trigger: HTMLElement) => void;
  /** Restore whichever file is maximized (backdrop click). */
  closeMaximized: () => void;
}

/**
 * Per-file "Maximize" state for the stash viewer's Content tab.
 *
 * A maximized file keeps its own DOM box — the caller only switches it to a
 * fixed-position dialog via CSS and ARIA — so a Mermaid diagram's zoom state
 * and an HTML preview's iframe survive the toggle instead of remounting.
 * This hook owns everything a modal needs on top of that:
 *
 * - One file at a time. The entry is cleared as soon as it stops describing
 *   something on screen: another stash, the Content tab left (`enabled`
 *   false), or the file gone from `files`. The returned id is derived, so the
 *   stale entry is already hidden in the render that makes it stale.
 * - Escape restores the file and is consumed (`stopPropagation`) so it never
 *   reaches App's window-level Escape→home hotkey — the overlay contract in
 *   MEMORY.md. A dialog nested inside the maximized file (MermaidDiagram's
 *   own fullscreen) owns that Escape instead: both listeners sit on
 *   `document`, and this one registers first, so it steps aside rather than
 *   closing both layers with one key press.
 * - Body scroll lock, a focus trap (plus a `focusin` guard for focus that
 *   leaves through the HTML preview iframe), focus moved into the dialog on
 *   open and handed back to the triggering button on every close path.
 */
export function useMaximizedFile(
  stashId: string,
  files: readonly { id: string }[],
  enabled: boolean,
): MaximizedFile {
  const [entry, setEntry] = useState<MaximizedEntry | null>(null);
  const maximizedRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const maximizedFileId =
    entry !== null &&
    enabled &&
    entry.stashId === stashId &&
    files.some((f) => f.id === entry.fileId)
      ? entry.fileId
      : null;
  const active = maximizedFileId !== null;

  // Drop a stale entry for good — otherwise it would come back when the user
  // returns to the Content tab or to the stash it was set on.
  useEffect(() => {
    if (entry !== null && maximizedFileId === null) setEntry(null);
  }, [entry, maximizedFileId]);

  const toggleMaximized = useCallback(
    (fileId: string, trigger: HTMLElement) => {
      triggerRef.current = trigger;
      setEntry((prev) =>
        prev?.stashId === stashId && prev.fileId === fileId ? null : { stashId, fileId },
      );
    },
    [stashId],
  );

  const closeMaximized = useCallback(() => setEntry(null), []);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Descendants only, so the maximized box's own role="dialog" never
      // matches; a role="dialog" in rendered Markdown does not count either.
      const box = maximizedRef.current;
      if (box && containsAppModal(box, '[role="dialog"]')) return;
      e.preventDefault();
      e.stopPropagation();
      setEntry(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);

  // The Tab trap only sees keys pressed in this document. Tab out of the
  // sandboxed HTML preview iframe never reaches it, and focus would land on a
  // control behind the backdrop — so pull any focus that leaves the box back
  // in, unless another app-owned modal took it.
  //
  // Decided one task later, from where focus ended up rather than where it
  // went: code that borrows focus and hands it back in the same task must be
  // left alone. The clipboard fallback (`copyToClipboard` without
  // `navigator.clipboard`, i.e. plain HTTP) focuses a hidden textarea on
  // <body>, selects it, copies and restores focus; refocusing the box on that
  // focusin dropped the selection and the copy failed. A microtask would
  // also run after that synchronous restore; `setTimeout` additionally runs
  // after every microtask the task queued, so a restore that follows an
  // `await` on an already-settled promise is left alone as well.
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pullBack = () => {
      timer = null;
      const box = maximizedRef.current;
      const current = document.activeElement;
      if (!box || (current && (box.contains(current) || isInsideAppModal(current)))) return;
      box.focus({ preventScroll: true });
    };
    const onFocusIn = (e: FocusEvent) => {
      const box = maximizedRef.current;
      const target = e.target;
      if (!box || !(target instanceof Element) || box.contains(target)) return;
      if (timer === null) timer = setTimeout(pullBack, 0);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      if (timer !== null) clearTimeout(timer);
    };
  }, [active]);

  // Keyed on the id, not `active`: switching straight from one maximized file
  // to another has to hand focus back to the first file's button and then
  // move it into the second file.
  useEffect(() => {
    if (maximizedFileId === null) return;
    // Captured per open — `triggerRef` is overwritten by the next toggle.
    const trigger = triggerRef.current;
    maximizedRef.current?.focus({ preventScroll: true });
    return () => {
      // Runs for every close path: Escape, the Restore button, the backdrop,
      // and the auto-clear above. A detached trigger (stash switched, tab
      // left) cannot take focus.
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [maximizedFileId]);

  useBodyScrollLock(active);
  // Trap only — the effect above restores focus to the trigger itself, which
  // the hook's own restore cannot do when one maximized file replaces another.
  useFocusTrap(maximizedRef, active, false);

  return { maximizedFileId, maximizedRef, toggleMaximized, closeMaximized };
}
