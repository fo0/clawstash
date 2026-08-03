import { describe, expect, it } from 'vitest';
import { QUICK_SEARCH_HINT_DEFAULT, QUICK_SEARCH_HINT_MAC, quickSearchHint } from '../platform';

describe('quickSearchHint', () => {
  it('labels the accelerator with the command key on Apple platforms', () => {
    expect(quickSearchHint(true)).toBe(QUICK_SEARCH_HINT_MAC);
  });

  it('labels the accelerator with Ctrl elsewhere', () => {
    expect(quickSearchHint(false)).toBe(QUICK_SEARCH_HINT_DEFAULT);
  });

  it('defaults to the non-Mac label when there is no navigator (SSR)', () => {
    // The module is imported in a node environment, so `navigator` detection
    // must not throw and must not produce a Mac label on the server — a
    // mismatch with the first client render would trip hydration.
    expect(quickSearchHint()).toBe(QUICK_SEARCH_HINT_DEFAULT);
  });
});
