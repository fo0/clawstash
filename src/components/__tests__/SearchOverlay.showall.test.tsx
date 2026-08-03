// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SearchOverlay from '../SearchOverlay';
import type { StashListItem } from '../../types';

const listStashes = vi.fn();
vi.mock('../../api', () => ({
  api: {
    listStashes: (...args: unknown[]) => listStashes(...args),
  },
}));

afterEach(() => {
  cleanup();
  listStashes.mockReset();
});

function stash(n: number): StashListItem {
  return {
    id: `id-${n}`,
    name: `Stash ${n}`,
    description: '',
    tags: [],
    version: 1,
    archived: false,
    backup_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    total_size: 1,
    files: [],
  };
}

/** Render the overlay and run a query that the server reports as capped. */
async function renderCapped(total: number, query = '  config  ') {
  const onSearchAll = vi.fn();
  const onClose = vi.fn();
  const results = Array.from({ length: 12 }, (_, i) => stash(i));
  listStashes.mockResolvedValue({ stashes: results, total });

  render(
    <SearchOverlay open onClose={onClose} onSelectStash={vi.fn()} onSearchAll={onSearchAll} />,
  );
  fireEvent.change(screen.getByLabelText('Search stashes'), { target: { value: query } });
  await waitFor(() => expect(screen.getAllByRole('option').length).toBe(12));
  return { onSearchAll, onClose };
}

describe('SearchOverlay "Show all" escape hatch', () => {
  it('offers the full result set when the list is capped', async () => {
    await renderCapped(84);
    expect(screen.getByRole('button', { name: /show all 84/i })).toBeTruthy();
    expect(screen.getByText(/Showing first 12 of 84 matches/)).toBeTruthy();
  });

  it('hands the trimmed query to the dashboard and closes', async () => {
    const { onSearchAll, onClose } = await renderCapped(84);
    fireEvent.click(screen.getByRole('button', { name: /show all 84/i }));
    expect(onSearchAll).toHaveBeenCalledWith('config');
    expect(onClose).toHaveBeenCalled();
  });

  it('stays hidden when every match is already on screen', async () => {
    await renderCapped(12);
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull();
    expect(screen.getByText('12 results')).toBeTruthy();
  });

  it('keeps the interactive control out of the live region', async () => {
    await renderCapped(84);
    // An `aria-live` region containing a button is re-announced on every
    // keystroke that changes the count — the button is a sibling of the text.
    const live = document.querySelector('.search-overlay-results-count [aria-live]')!;
    expect(live).toBeTruthy();
    expect(live.querySelector('button')).toBeNull();
    expect(document.querySelector('.search-overlay-show-all')).toBeTruthy();
  });
});
