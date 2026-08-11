import { useState, useCallback, useEffect } from 'react';
import { formatRelativeTime } from '../../utils/format';

interface Props {
  dateStr: string;
  className?: string;
}

/** Re-render cadence keeping the relative label current on long-lived views. */
const RELATIVE_TICK_MS = 60 * 1000;

/**
 * One shared interval for every mounted `<RelativeTime>`.
 *
 * The dashboard renders one instance per stash card (STASH_PAGE_SIZE = 50, more
 * after "Load more") and the viewer's access-log tab adds one per entry, so a
 * per-instance `setInterval` meant dozens of independent timers waking the main
 * thread at staggered offsets — dozens of separate re-render passes per minute
 * instead of one. A single module-level timer notifies all subscribers together
 * and stops itself when the last instance unmounts.
 */
const tickSubscribers = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function subscribeToTick(listener: () => void): () => void {
  tickSubscribers.add(listener);
  if (tickTimer === null) {
    tickTimer = setInterval(() => {
      // Iterate a copy: a listener may unsubscribe while being notified.
      for (const notify of [...tickSubscribers]) notify();
    }, RELATIVE_TICK_MS);
  }
  return () => {
    tickSubscribers.delete(listener);
    if (tickSubscribers.size === 0 && tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

/**
 * Displays a relative timestamp ("3d ago") that toggles to the full locale
 * date-time on click. Click again to switch back. The full date is always
 * visible as a tooltip regardless of toggle state.
 *
 * Pure UI concern — no localStorage persistence needed since the absolute
 * form is also discoverable via the existing title attribute hover.
 */
export default function RelativeTime({ dateStr, className }: Props) {
  const [showAbsolute, setShowAbsolute] = useState(false);
  // Ticks every minute so a dashboard left open doesn't show "just now"
  // forever — the state value is unused, only the re-render matters.
  const [, setTick] = useState(0);

  useEffect(() => subscribeToTick(() => setTick((t) => t + 1)), []);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAbsolute((prev) => !prev);
  }, []);

  const absoluteStr = new Date(dateStr).toLocaleString();
  const relativeStr = formatRelativeTime(dateStr);

  return (
    <span
      className={`relative-time${className ? ' ' + className : ''}`}
      onClick={toggle}
      // Tooltip carries the alternate representation and advertises the
      // click-toggle in BOTH states.
      title={
        showAbsolute
          ? `${relativeStr} — click to show relative time`
          : `${absoluteStr} — click to show absolute time`
      }
      // Announce exactly what is displayed; the alternate form lives in the
      // title above.
      aria-label={showAbsolute ? absoluteStr : relativeStr}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setShowAbsolute((prev) => !prev);
        }
      }}
    >
      {showAbsolute ? absoluteStr : relativeStr}
    </span>
  );
}
