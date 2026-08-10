// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import StashCard from '../StashCard';
import type { StashListItem } from '../../types';

afterEach(cleanup);

const STASH: StashListItem = {
  id: 'abc',
  name: 'My stash',
  description: '',
  tags: ['alpha'],
  version: 1,
  archived: false,
  backup_enabled: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  total_size: 1,
  files: [{ filename: 'a.txt', language: 'text', size: 1 }],
};

function renderCard(onClick = vi.fn()) {
  const view = render(
    <StashCard
      stash={STASH}
      layout="grid"
      isFavorite={false}
      onClick={onClick}
      onFilterTag={vi.fn()}
      onToggleFavorite={vi.fn()}
    />,
  );
  return { ...view, onClick };
}

describe('StashCard ARIA structure (#132)', () => {
  it('does not make the card container a button around interactive descendants', () => {
    const { container } = renderCard();
    const card = container.querySelector('.stash-card')!;
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('tabindex')).toBeNull();
  });

  it('exposes the title as the keyboard-reachable primary action', () => {
    const { container, onClick } = renderCard();
    const title = container.querySelector('a.stash-card-title') as HTMLAnchorElement;
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('My stash');

    title.click();
    // Exactly once: the title link stops the click from also reaching the
    // container's pointer-convenience handler.
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('StashCard new-tab support', () => {
  it('renders the title as a link to the stash deep link', () => {
    const { container } = renderCard();
    const title = container.querySelector('a.stash-card-title') as HTMLAnchorElement;
    expect(title.getAttribute('href')).toBe('/stash/abc');
  });

  it('navigates in-app on a plain click and prevents the default navigation', () => {
    const { container, onClick } = renderCard();
    const title = container.querySelector('a.stash-card-title') as HTMLAnchorElement;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    title.dispatchEvent(event);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a Ctrl/Cmd-click to the browser so the stash opens in a new tab', () => {
    const { container, onClick } = renderCard();
    const title = container.querySelector('a.stash-card-title') as HTMLAnchorElement;
    // Capture-phase cancel: jsdom cannot follow a link and would log
    // "Not implemented: navigation". The component's own handler ignores
    // defaultPrevented, so this only suppresses the (unimplemented) navigation.
    const stopNavigation = (e: Event) => e.preventDefault();
    document.addEventListener('click', stopNavigation, true);
    title.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
    );
    document.removeEventListener('click', stopNavigation, true);
    // No in-app navigation: the browser gets to open the href in a new tab.
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not navigate in-app when the card body is Ctrl/Cmd-clicked', () => {
    const { container, onClick } = renderCard();
    const card = container.querySelector('.stash-card') as HTMLElement;
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
