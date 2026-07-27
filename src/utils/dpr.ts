/** Minimal slice of `window` the watcher needs — keeps it unit-testable. */
export interface DprWindow {
  devicePixelRatio: number;
  matchMedia(query: string): MediaQueryList;
}

/**
 * Call `onChange` whenever `devicePixelRatio` changes.
 *
 * Canvas code sizes its bitmap by DPR, but DPR can change without any layout
 * resize: dragging the window to a monitor with a different scale factor, or a
 * browser zoom step. `ResizeObserver` does not fire for either, so the bitmap
 * stays scaled for the old ratio and pointer hit tests are offset until the
 * next real resize.
 *
 * There is no `devicePixelRatio` change event. The idiom is a `(resolution:
 * Ndppx)` media query, which stops matching the moment the ratio changes — so
 * the listener must re-arm itself against the new ratio after every hit.
 *
 * Returns a cleanup function; safe to call during SSR (no-op without a
 * `window`).
 */
export function watchDevicePixelRatio(onChange: () => void, win?: DprWindow): () => void {
  const target = win ?? (typeof window !== 'undefined' ? window : null);
  if (!target || typeof target.matchMedia !== 'function') return () => {};

  let query: MediaQueryList | null = null;

  const handleChange = () => {
    arm();
    onChange();
  };

  const arm = () => {
    query?.removeEventListener('change', handleChange);
    query = target.matchMedia(`(resolution: ${target.devicePixelRatio}dppx)`);
    query.addEventListener('change', handleChange);
  };

  arm();

  return () => {
    query?.removeEventListener('change', handleChange);
    query = null;
  };
}
