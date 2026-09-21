// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Dashboard from '../Dashboard';
import type { StashListItem } from '../../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stash(id: string): StashListItem {
  return {
    id,
    name: `Stash ${id}`,
    description: '',
    tags: [],
    version: 1,
    archived: false,
    backup_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    total_size: 10,
    files: [{ filename: `${id}.txt`, language: 'text', size: 10 }],
  };
}

function renderDashboard(overrides: { loading?: boolean; onReload?: () => void } = {}) {
  const onReload = overrides.onReload ?? vi.fn();
  render(
    <Dashboard
      stashes={[stash('a')]}
      total={1}
      layout="grid"
      sortMode="updated"
      loading={overrides.loading ?? false}
      loadError={false}
      onReload={onReload}
      search=""
      onClearSearch={vi.fn()}
      hasMore={false}
      onLoadMore={vi.fn()}
      filterTag=""
      showArchived={false}
      favoriteIds={new Set()}
      onToggleShowArchived={vi.fn()}
      onLayoutChange={vi.fn()}
      onSortChange={vi.fn()}
      onSelectStash={vi.fn()}
      onNewStash={vi.fn()}
      onFilterTag={vi.fn()}
      onToggleFavorite={vi.fn()}
    />,
  );
  return { onReload };
}

describe('Dashboard refresh button', () => {
  it('re-fetches the stash list when clicked', () => {
    const { onReload } = renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh stash list' }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('is disabled while a load is already in flight', () => {
    const { onReload } = renderDashboard({ loading: true });

    const button = screen.getByRole('button', { name: 'Refresh stash list' });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);
    expect(onReload).not.toHaveBeenCalled();
  });

  it('keeps the failed-load retry on the same reload callback', () => {
    const onReload = vi.fn();
    render(
      <Dashboard
        stashes={[]}
        total={0}
        layout="grid"
        sortMode="updated"
        loading={false}
        loadError
        onReload={onReload}
        search=""
        onClearSearch={vi.fn()}
        hasMore={false}
        onLoadMore={vi.fn()}
        filterTag=""
        showArchived={false}
        favoriteIds={new Set()}
        onToggleShowArchived={vi.fn()}
        onLayoutChange={vi.fn()}
        onSortChange={vi.fn()}
        onSelectStash={vi.fn()}
        onNewStash={vi.fn()}
        onFilterTag={vi.fn()}
        onToggleFavorite={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
