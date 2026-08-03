interface IconProps {
  size?: number;
}

/**
 * Lucide-style copy icon (two overlapping rounded rectangles).
 *
 * Canonical copy icon for the whole app — `src/components/api/icons.tsx`
 * re-exports this so REST/MCP tabs share the same glyph as the rest of
 * the UI (was previously two divergent SVG paths).
 */
export function CopyIcon({ size = 12 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

/** Octicon-style checkmark icon. */
export function CheckIcon({ size = 12 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

interface StarIconProps extends IconProps {
  /** Solid star when the item is a favorite, outline when it is not. */
  filled: boolean;
}

/**
 * Octicon-style star icon for the favorite ("pin to top") toggle.
 *
 * Shared by `StashCard` and `StashViewer` so the same stash renders the same
 * glyph on the dashboard and in the viewer.
 */
export function StarIcon({ filled, size = 14 }: StarIconProps) {
  if (filled) {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M8 1.25 9.882 5.065l4.21.612-3.046 2.97.719 4.192L8 10.86l-3.765 1.98.72-4.194L1.908 5.677l4.21-.612L8 1.25Z" />
    </svg>
  );
}

/** Octicon-style X/cross icon for error states. */
export function XIcon({ size = 12 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}
