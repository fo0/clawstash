// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SearchOverlay from '../SearchOverlay';
import type { StashListItem } from '../../types';

// jsdom implements no layout, so `Element.scrollIntoView` is missing — the
// overlay calls it whenever the arrow keys move the highlight.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const listStashes = vi.fn();
vi.mock('../../api', () => ({
  api: {
    listStashes: (...args: unknown[]) => listStashes(...args),
  },
}));

afterEach(() => {
  cleanup();
  listStashes.mockReset();
  localStorage.clear();
  vi.restoreAllMocks();
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

/** Render the overlay with two search results on screen. */
async function renderWithResults() {
  const onSelectStash = vi.fn();
  const onClose = vi.fn();
  listStashes.mockResolvedValue({ stashes: [stash(0), stash(1)], total: 2 });

  render(
    <SearchOverlay open onClose={onClose} onSelectStash={onSelectStash} onSearchAll={vi.fn()} />,
  );
  const input = screen.getByLabelText('Search stashes');
  fireEvent.change(input, { target: { value: 'stash' } });
  await waitFor(() => expect(screen.getAllByRole('option').length).toBe(2));
  return { input, onSelectStash, onClose };
}

describe('SearchOverlay open-in-new-tab', () => {
  it('renders each result as a deep link so the browser can open it in a new tab', async () => {
    await renderWithResults();
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.getAttribute('href'))).toEqual(['/stash/id-0', '/stash/id-1']);
  });

  it('navigates in place on a plain click', async () => {
    const { onSelectStash, onClose } = await renderWithResults();
    fireEvent.click(screen.getAllByRole('option')[0]);
    expect(onSelectStash).toHaveBeenCalledWith('id-0');
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves a modified click to the browser — no in-place navigation, overlay stays open', async () => {
    const { onSelectStash, onClose } = await renderWithResults();
    fireEvent.click(screen.getAllByRole('option')[0], { metaKey: true });
    expect(onSelectStash).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the highlighted result in a new tab on Ctrl+Enter and keeps the overlay open', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { input, onSelectStash, onClose } = await renderWithResults();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });

    expect(open).toHaveBeenCalledWith(
      `${window.location.origin}/stash/id-1`,
      '_blank',
      'noopener,noreferrer',
    );
    expect(onSelectStash).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still navigates in place on a plain Enter', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { input, onSelectStash, onClose } = await renderWithResults();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(open).not.toHaveBeenCalled();
    expect(onSelectStash).toHaveBeenCalledWith('id-0');
    expect(onClose).toHaveBeenCalled();
  });

  it('gives the "Recently viewed" shortcuts the same links', async () => {
    localStorage.setItem(
      'clawstash_recent_views',
      JSON.stringify([{ id: 'recent-1', title: 'Seen before' }]),
    );
    render(<SearchOverlay open onClose={vi.fn()} onSelectStash={vi.fn()} onSearchAll={vi.fn()} />);
    const option = await screen.findByRole('option', { name: /seen before/i });
    expect(option.getAttribute('href')).toBe('/stash/recent-1');
  });
});
