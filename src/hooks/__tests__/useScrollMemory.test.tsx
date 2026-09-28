// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useScrollMemory } from '../useScrollMemory';

afterEach(() => {
  cleanup();
});

function Host({
  container,
  active,
  listKey,
}: {
  container: HTMLElement | null;
  active: boolean;
  listKey: string;
}) {
  useScrollMemory(container, active, listKey);
  return null;
}

/** Scroll the container the way a user would: move it, then report it. */
function scrollTo(el: HTMLElement, top: number) {
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll'));
}

describe('useScrollMemory', () => {
  it('restores the offset when the view comes back to the same list', () => {
    const main = document.createElement('main');
    const view = render(<Host container={main} active listKey="k" />);
    scrollTo(main, 640);

    // Another view takes over the shared container and moves it.
    view.rerender(<Host container={main} active={false} listKey="k" />);
    scrollTo(main, 90);

    view.rerender(<Host container={main} active listKey="k" />);
    expect(main.scrollTop).toBe(640);
  });

  it('starts at the top when the list changed while the view was away', () => {
    const main = document.createElement('main');
    const view = render(<Host container={main} active listKey="all" />);
    scrollTo(main, 640);

    view.rerender(<Host container={main} active={false} listKey="all" />);
    scrollTo(main, 90);
    // e.g. a tag picked in the sidebar while a stash was open
    view.rerender(<Host container={main} active={false} listKey="tag:infra" />);

    view.rerender(<Host container={main} active listKey="tag:infra" />);
    expect(main.scrollTop).toBe(0);
  });

  it('ignores scrolls that happen while the view is away', () => {
    const main = document.createElement('main');
    const view = render(<Host container={main} active listKey="k" />);
    scrollTo(main, 300);

    view.rerender(<Host container={main} active={false} listKey="k" />);
    // The browser clamps scrollTop when shorter content replaces the list and
    // reports it as a scroll; the next view then scrolls on its own.
    scrollTo(main, 12);
    scrollTo(main, 0);

    view.rerender(<Host container={main} active listKey="k" />);
    expect(main.scrollTop).toBe(300);
  });

  it('keeps the offset across a key change made while the view is shown', () => {
    const main = document.createElement('main');
    const view = render(<Host container={main} active listKey="sort:updated" />);
    scrollTo(main, 500);
    // Re-sorting keeps the container where it is, without a scroll event.
    view.rerender(<Host container={main} active listKey="sort:name" />);

    view.rerender(<Host container={main} active={false} listKey="sort:name" />);
    scrollTo(main, 0);
    view.rerender(<Host container={main} active listKey="sort:name" />);
    expect(main.scrollTop).toBe(500);
  });

  it('starts recording once the container mounts after the first render', () => {
    // App renders nothing until the session check resolves, so <main> is null
    // on the first pass and only arrives later — with nothing else changing.
    const main = document.createElement('main');
    const view = render(<Host container={null} active listKey="k" />);
    view.rerender(<Host container={main} active listKey="k" />);
    scrollTo(main, 420);

    view.rerender(<Host container={main} active={false} listKey="k" />);
    scrollTo(main, 0);
    view.rerender(<Host container={main} active listKey="k" />);
    expect(main.scrollTop).toBe(420);
  });

  it('does not move the container on the first render', () => {
    const main = document.createElement('main');
    main.scrollTop = 75;
    render(<Host container={main} active listKey="k" />);
    expect(main.scrollTop).toBe(75);
  });
});
