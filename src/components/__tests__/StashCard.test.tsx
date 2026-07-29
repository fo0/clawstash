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
    const title = container.querySelector('button.stash-card-title') as HTMLButtonElement;
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('My stash');

    title.click();
    // Exactly once: the title button stops the click from also reaching the
    // container's pointer-convenience handler.
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
