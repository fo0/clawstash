import { useRef } from 'react';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
} from '../utils/sidebar-width';

interface Props {
  width: number;
  /** Called continuously while dragging — the parent owns the live width. */
  onResize: (width: number) => void;
  /** Called once the gesture ends, so the preference is written only once. */
  onCommit: (width: number) => void;
}

/** Keyboard step, in pixels. Coarse enough to cross the range in a few taps. */
const KEY_STEP = 16;

/**
 * Drag handle on the sidebar's trailing edge.
 *
 * It is a real `separator` widget rather than a bare div: the same resize is
 * reachable with Arrow keys, Home/End jump to the bounds, and a double-click
 * restores the default — so the sidebar can be widened without a pointer and
 * cannot be left in a state the user has no way back from.
 */
export default function SidebarResizer({ width, onResize, onCommit }: Props) {
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only the primary button drags; a right-click would otherwise capture the
    // pointer and never see a matching pointerup.
    if (e.button !== 0) return;
    dragStart.current = { x: e.clientX, width };
    e.currentTarget.setPointerCapture(e.pointerId);
    // Stops the drag from selecting the sidebar text it passes over.
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    onResize(clampSidebarWidth(dragStart.current.width + (e.clientX - dragStart.current.x)));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    dragStart.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onCommit(width);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = width - KEY_STEP;
    else if (e.key === 'ArrowRight') next = width + KEY_STEP;
    else if (e.key === 'Home') next = SIDEBAR_MIN_WIDTH;
    else if (e.key === 'End') next = SIDEBAR_MAX_WIDTH;
    else if (e.key === 'Enter' || e.key === ' ') next = SIDEBAR_DEFAULT_WIDTH;
    if (next === null) return;
    e.preventDefault();
    // Global single-key hotkeys live on window; a plain Home/End here would
    // otherwise also reach them.
    e.stopPropagation();
    const clamped = clampSidebarWidth(next);
    onResize(clamped);
    onCommit(clamped);
  };

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      // A `separator` carrying aria-valuenow is a focusable window splitter per
      // the ARIA APG, not decoration; the rule only knows the non-interactive
      // flavour of the role.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable window splitter
      tabIndex={0}
      title="Drag to resize the sidebar — double-click or press Enter to reset"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => {
        onResize(SIDEBAR_DEFAULT_WIDTH);
        onCommit(SIDEBAR_DEFAULT_WIDTH);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}
