import { useEffect, useState } from 'react';
import { QUICK_SEARCH_HINT_DEFAULT, quickSearchHint } from '../utils/platform';

/**
 * The quick-search accelerator label for the current platform.
 *
 * Resolved after mount on purpose: `navigator` does not exist during the
 * server render, so reading it inline would make the server and the first
 * client render disagree and trip React's hydration check. Starts at the
 * non-Mac label and refines to "⌘K" on Apple platforms.
 */
export function useQuickSearchHint(): string {
  const [hint, setHint] = useState(QUICK_SEARCH_HINT_DEFAULT);
  useEffect(() => {
    setHint(quickSearchHint());
  }, []);
  return hint;
}
