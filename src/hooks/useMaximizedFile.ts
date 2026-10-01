import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useBodyScrollLock } from './useBodyScrollLock';
import { useFocusTrap } from './useFocusTrap';

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
 * - Body scroll lock, a focus trap, focus moved into the dialog on open and
 *   handed back to the triggering button on every close path.
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
      // `querySelector` only searches descendants, so the maximized box's own
      // role="dialog" never matches here.
      if (maximizedRef.current?.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      e.stopPropagation();
      setEntry(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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
