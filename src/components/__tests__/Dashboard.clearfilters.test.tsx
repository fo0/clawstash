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

interface Filters {
  stashes?: StashListItem[];
  search?: string;
  filterTag?: string;
  showArchived?: boolean;
}

function renderDashboard({
  stashes = [stash('a')],
  search = '',
  filterTag = '',
  showArchived = false,
}: Filters = {}) {
  const onClearFilters = vi.fn();
  render(
    <Dashboard
      stashes={stashes}
      total={stashes.length}
      layout="grid"
      sortMode="updated"
      loading={false}
      loadError={false}
      onReload={vi.fn()}
      search={search}
      onClearSearch={vi.fn()}
      hasMore={false}
      onLoadMore={vi.fn()}
      filterTag={filterTag}
      showArchived={showArchived}
      onClearFilters={onClearFilters}
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
  return { onClearFilters };
}

describe('Dashboard "Clear all filters"', () => {
  it('is not offered for a single filter — its own chip already clears it', () => {
    renderDashboard({ filterTag: 'infra' });

    expect(screen.queryByRole('button', { name: 'Clear all filters' })).toBeNull();
  });

  it('is offered once two filters are combined and clears them in one click', () => {
    const { onClearFilters } = renderDashboard({ search: 'deploy', filterTag: 'infra' });

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('counts "including archived" as a filter', () => {
    renderDashboard({ search: 'deploy', showArchived: true });

    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeTruthy();
  });

  it('is absent with no filter at all', () => {
    renderDashboard();

    expect(screen.queryByRole('button', { name: 'Clear all filters' })).toBeNull();
  });
});

describe('Dashboard filtered empty state', () => {
  it('offers "Clear filters" when a search hides every stash', () => {
    const { onClearFilters } = renderDashboard({ stashes: [], search: 'nothing-matches' });

    expect(screen.getByText('No stashes match "nothing-matches".')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
    // "New Stash" stays available next to it.
    expect(screen.getAllByRole('button', { name: /New Stash/ }).length).toBeGreaterThan(0);
  });

  it('offers "Clear filters" when a tag filter hides every stash', () => {
    renderDashboard({ stashes: [], filterTag: 'infra' });

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
  });

  it('has nothing to clear when "including archived" is the only filter', () => {
    // Including archived only ever widens the list: an empty result there
    // means there are no stashes at all, so a clear action would do nothing.
    renderDashboard({ stashes: [], showArchived: true });

    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('keeps the unfiltered empty state as it was', () => {
    renderDashboard({ stashes: [] });

    expect(screen.getByText('No stashes yet. Create your first one!')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });
});
