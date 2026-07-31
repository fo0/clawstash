import { useEffect } from 'react';

/**
 * Freeze background scrolling while a modal is open.
 *
 * Without it the page behind the backdrop still scrolls under the wheel and
 * under keyboard paging, so the dialog appears to drift and the user loses
 * their place in the list they came from.
 *
 * Nested/stacked modals are handled with a reference count: each active lock
 * increments it and only the last one to release restores the original
 * `overflow`, so an inner dialog closing cannot unlock the page while an
 * outer one is still open.
 */
let lockCount = 0;
let previousOverflow = '';

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount++;
    return () => {
      lockCount--;
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [active]);
}
