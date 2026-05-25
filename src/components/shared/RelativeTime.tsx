import { useState, useCallback } from 'react';
import { formatRelativeTime } from '../../utils/format';

interface Props {
  dateStr: string;
  className?: string;
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

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowAbsolute((prev) => !prev);
    },
    [],
  );

  const absoluteStr = new Date(dateStr).toLocaleString();
  const relativeStr = formatRelativeTime(dateStr);

  return (
    <span
      className={`relative-time${className ? ' ' + className : ''}`}
      onClick={toggle}
      title={showAbsolute ? 'Click to show relative time' : absoluteStr}
      aria-label={showAbsolute ? relativeStr : absoluteStr}
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
