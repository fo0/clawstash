// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import StashViewer from '../StashViewer';
import type { Stash } from '../../types';
import type { StashNeighbors } from '../../utils/stash-neighbors';

afterEach(cleanup);

const STASH: Stash = {
  id: 'abc',
  name: 'My stash',
  description: '',
  tags: [],
  metadata: {},
  version: 1,
  archived: false,
  backup_enabled: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  files: [
    {
      id: 'f1',
      stash_id: 'abc',
      filename: 'a.txt',
      content: 'hello',
      language: 'text',
      sort_order: 0,
    },
  ],
};

const BOTH: StashNeighbors = {
  previous: { id: 'prev', title: 'Earlier stash' },
  next: { id: 'next', title: 'Later stash' },
};

function renderViewer(neighbors: StashNeighbors | null, onOpenStash = vi.fn()) {
  const view = render(
    <StashViewer
      stash={STASH}
      onEdit={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onArchive={vi.fn()}
      onBack={vi.fn()}
      onAnalyzeStash={vi.fn()}
      onFilterTag={vi.fn()}
      isFavorite={false}
      onToggleFavorite={vi.fn()}
      neighbors={neighbors}
      onOpenStash={onOpenStash}
    />,
  );
  return { ...view, onOpenStash };
}

const press = (key: string, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('StashViewer previous / next stash', () => {
  it('names the neighbours on the buttons and opens them on click', () => {
    const { getByRole, onOpenStash } = renderViewer(BOTH);
    getByRole('button', { name: 'Previous stash: Earlier stash' }).click();
    getByRole('button', { name: 'Next stash: Later stash' }).click();
    expect(onOpenStash.mock.calls).toEqual([['prev'], ['next']]);
  });

  it('disables the button for the missing side at an end of the list', () => {
    const { getByRole } = renderViewer({ previous: null, next: BOTH.next });
    expect((getByRole('button', { name: 'Previous stash' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (getByRole('button', { name: 'Next stash: Later stash' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('hides the controls when the stash is not in the list or stands alone', () => {
    const { container, unmount } = renderViewer(null);
    expect(container.querySelector('.viewer-stash-nav')).toBeNull();
    unmount();
    const alone = renderViewer({ previous: null, next: null });
    expect(alone.container.querySelector('.viewer-stash-nav')).toBeNull();
  });

  it('steps with `k` / `j`', () => {
    const { onOpenStash } = renderViewer(BOTH);
    press('k');
    press('j');
    expect(onOpenStash.mock.calls).toEqual([['prev'], ['next']]);
  });

  it('does nothing on `j` at the end of the list', () => {
    const { onOpenStash } = renderViewer({ previous: BOTH.previous, next: null });
    press('j');
    expect(onOpenStash).not.toHaveBeenCalled();
  });

  it('leaves `j` / `k` alone while typing, with a modifier, or behind a dialog', () => {
    const { onOpenStash } = renderViewer(BOTH);
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('j', input);
    input.remove();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }));
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    press('k');
    dialog.remove();
    expect(onOpenStash).not.toHaveBeenCalled();
  });
});
