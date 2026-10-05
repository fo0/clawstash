// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SearchOverlay from '../SearchOverlay';
import type { StashListItem } from '../../types';

const listStashes = vi.fn();
vi.mock('../../api', () => ({
  api: {
    listStashes: (...args: unknown[]) => listStashes(...args),
  },
}));

const STORAGE_KEY = 'clawstash_recent_searches';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  listStashes.mockReset();
  localStorage.clear();
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

function renderOverlay() {
  const onSelectStash = vi.fn();
  const onSearchAll = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <SearchOverlay
      open
      onClose={onClose}
      onSelectStash={onSelectStash}
      onSearchAll={onSearchAll}
    />,
  );
  return { ...view, onSelectStash, onSearchAll, onClose };
}

describe('SearchOverlay recent searches', () => {
  it('shows no chip row before anything was searched', () => {
    renderOverlay();
    expect(screen.queryByText('Recent searches')).toBeNull();
  });

  it('remembers a query once a result is opened', async () => {
    listStashes.mockResolvedValue({ stashes: [stash(1)], total: 1 });
    const { onSelectStash } = renderOverlay();
    fireEvent.change(screen.getByLabelText('Search stashes'), { target: { value: '  docker  ' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(1));
    fireEvent.click(screen.getByRole('option'));
    expect(onSelectStash).toHaveBeenCalledWith('id-1');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['docker']);
  });

  it('does not remember a query that was typed and abandoned', async () => {
    listStashes.mockResolvedValue({ stashes: [stash(1)], total: 1 });
    renderOverlay();
    fireEvent.change(screen.getByLabelText('Search stashes'), { target: { value: 'docker' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(1));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('re-runs a remembered query in one click, without the typing debounce', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['docker', 'nginx']));
    listStashes.mockResolvedValue({ stashes: [stash(1), stash(2)], total: 2 });
    renderOverlay();
    const group = screen.getByRole('group', { name: 'Recent searches' });
    expect(group.querySelectorAll('button')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'nginx' }));
    expect(listStashes).toHaveBeenCalledWith({ search: 'nginx', limit: 12 });
    expect((screen.getByLabelText('Search stashes') as HTMLInputElement).value).toBe('nginx');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(2));
    // The chips belong to the empty field only.
    expect(screen.queryByText('Recent searches')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Search stashes'));
  });

  it('forgets every remembered query on Clear', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['docker']));
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('Recent searches')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Search stashes'));
  });

  it('remembers the query handed to "Show all"', async () => {
    listStashes.mockResolvedValue({
      stashes: Array.from({ length: 12 }, (_, i) => stash(i)),
      total: 40,
    });
    const { onSearchAll } = renderOverlay();
    fireEvent.change(screen.getByLabelText('Search stashes'), { target: { value: 'config' } });
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(12));
    fireEvent.click(screen.getByRole('button', { name: /show all 40/i }));
    expect(onSearchAll).toHaveBeenCalledWith('config');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['config']);
  });
});
