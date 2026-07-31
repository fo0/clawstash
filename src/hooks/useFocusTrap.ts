import { useEffect, type RefObject } from 'react';

/**
 * Elements that can receive keyboard focus by default. `[tabindex]` is matched
 * broadly and narrowed afterwards via `el.tabIndex >= 0`, which also excludes
 * the `tabindex="-1"` containers used as programmatic focus targets.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

/**
 * Hidden subtrees must not swallow focus. `hidden` is what this codebase uses
 * to keep tab panels mounted-but-inert (BackupSection, ApiManager), so an
 * inactive panel's controls would otherwise become part of the tab cycle.
 * `aria-hidden` is honoured for the same reason.
 *
 * Deliberately no `getClientRects()` / `offsetParent` check: both are layout
 * driven and always report "invisible" under jsdom, which would make the trap
 * untestable while adding nothing for the modals in this app.
 */
function isInert(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return true;
  if (el.closest('[hidden]')) return true;
  if (el.closest('[aria-hidden="true"]')) return true;
  return false;
}

/**
 * Focusable descendants of `container`, in DOM order — i.e. the order Tab
 * walks them, since none of the modals here set a positive `tabindex`.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.tabIndex >= 0 && !isInert(el),
  );
}

/**
 * Keep Tab focus inside an open modal and restore it on close.
 *
 * `aria-modal="true"` is a promise to assistive technology, not a browser
 * behaviour: without a trap, Tab walks straight out of the dialog into the
 * page behind the backdrop, where the content is still focusable and still
 * wired to the app's single-key hotkeys.
 *
 * @param containerRef Element that owns the dialog's focusable content.
 * @param active       Whether the modal is currently open.
 * @param restoreFocus Return focus to the pre-open element on close. Pass
 *                     `false` when the caller already restores focus itself.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  restoreFocus = true,
): void {
  useEffect(() => {
    if (!active) return;

    // Captured before focus moves into the dialog. Read once per open — the
    // effect intentionally depends only on `active` so a re-render cannot
    // re-capture an element that is already inside the dialog.
    const previouslyFocused = restoreFocus ? (document.activeElement as HTMLElement | null) : null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.defaultPrevented) return;
      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        // Nothing inside to land on — swallow Tab rather than let it escape.
        e.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const current = document.activeElement as HTMLElement | null;

      // Focus sitting outside the dialog (e.g. on <body> after a click on the
      // backdrop) must be pulled back in rather than continue through the page.
      if (!current || !container.contains(current)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Capture phase: the dialogs also handle keydown on the way up, and the
    // trap must win before a bubble-phase handler can act on the same Tab.
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Skip <body>: focusing it is a no-op that only clears the current
      // focus, and a detached node cannot be focused at all.
      if (
        previouslyFocused &&
        previouslyFocused !== document.body &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef, restoreFocus]);
}
