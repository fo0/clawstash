// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { canToggleQuickSearch } from '../quick-search-gate';

function root(html = ''): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const closed = { search: false, help: false };

describe('canToggleQuickSearch', () => {
  it('opens search when nothing else is open', () => {
    expect(canToggleQuickSearch(closed, root())).toBe(true);
  });

  it('closes an open search, whose own dialog is in the DOM', () => {
    expect(
      canToggleQuickSearch({ search: true, help: false }, root('<div role="dialog"></div>')),
    ).toBe(true);
  });

  it('is blocked by the shortcuts help', () => {
    expect(canToggleQuickSearch({ search: false, help: true }, root())).toBe(false);
  });

  it('is blocked by a dialog App does not track', () => {
    expect(canToggleQuickSearch(closed, root('<div role="dialog" aria-modal="true"></div>'))).toBe(
      false,
    );
  });

  it('is not blocked by a role="dialog" in rendered Markdown', () => {
    expect(
      canToggleQuickSearch(
        closed,
        root('<div class="markdown-body"><div role="dialog"></div></div>'),
      ),
    ).toBe(true);
  });
});
