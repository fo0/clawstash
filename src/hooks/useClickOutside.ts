import { useEffect, type RefObject } from 'react';

/**
 * Hook that calls a callback when a pointer-down occurs outside the
 * referenced element, OR when Escape is pressed. Optionally accepts an
 * `enabled` flag to conditionally attach the listeners.
 *
 * Uses `pointerdown` instead of `mousedown` so touch-only browsers (iOS
 * Safari, Android Chrome) reliably close dropdowns when the user taps
 * outside. `pointerdown` covers mouse, touch, and pen in a single event.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  callback: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handlePointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callback();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') callback();
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [ref, callback, enabled]);
}
