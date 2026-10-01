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

const FAILURE = /search failed/i;

/** Render the overlay and type a query whose first request is rejected. */
async function renderFailed(query = 'config') {
  listStashes.mockRejectedValueOnce(new Error('HTTP 502'));
  render(<SearchOverlay open onClose={vi.fn()} onSelectStash={vi.fn()} onSearchAll={vi.fn()} />);
  const input = screen.getByLabelText('Search stashes') as HTMLInputElement;
  fireEvent.change(input, { target: { value: query } });
  await screen.findByText(FAILURE);
  return input;
}

describe('SearchOverlay failed search', () => {
  it('reports a failed request as a failure, not as an empty result', async () => {
    await renderFailed();

    expect(screen.getByRole('alert').textContent).toMatch(FAILURE);
    expect(screen.queryByText('No stashes found')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('keeps the Retry button out of the alert', async () => {
    await renderFailed();
    // An alert that contains a control re-announces the control with the text.
    expect(screen.getByRole('alert').querySelector('button')).toBeNull();
  });

  it('re-runs the same query on Retry and hands focus back to the field', async () => {
    const input = await renderFailed('config');
    listStashes.mockResolvedValueOnce({ stashes: [stash(1), stash(2)], total: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    expect(listStashes).toHaveBeenCalledTimes(2);
    expect(listStashes).toHaveBeenLastCalledWith({ search: 'config', limit: 12 });
    expect(screen.queryByText(FAILURE)).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('retries on Enter, since there is no result to open', async () => {
    const input = await renderFailed('config');
    listStashes.mockResolvedValueOnce({ stashes: [stash(1)], total: 1 });

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(listStashes).toHaveBeenCalledTimes(2);
  });

  it('drops the failure when the field is cleared', async () => {
    await renderFailed();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.queryByText(FAILURE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('still says "No stashes found" for a search that succeeded empty', async () => {
    listStashes.mockResolvedValueOnce({ stashes: [], total: 0 });
    render(<SearchOverlay open onClose={vi.fn()} onSelectStash={vi.fn()} onSearchAll={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search stashes'), { target: { value: 'nothing' } });

    await screen.findByText('No stashes found');
    expect(screen.queryByText(FAILURE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
