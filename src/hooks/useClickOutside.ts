import { useEffect, type RefObject } from 'react';

/**
 * Hook that calls a callback when a click occurs outside the referenced element.
 * Optionally accepts an `enabled` flag to conditionally attach the listener.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  callback: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callback();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [ref, callback, enabled]);
}
