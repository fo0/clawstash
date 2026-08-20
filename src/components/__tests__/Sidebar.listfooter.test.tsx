// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Sidebar from '../Sidebar';
import type { StashListItem } from '../../types';

// jsdom implements no layout, so `Element.scrollIntoView` is missing.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
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
    updated_at: `2026-01-0${9 - n}T00:00:00.000Z`,
    total_size: 1,
    files: [{ filename: `file-${n}.txt`, language: 'text', size: 1 }],
  };
}

type Overrides = Partial<React.ComponentProps<typeof Sidebar>>;

function renderSidebar(count: number, overrides: Overrides = {}) {
  const handlers = {
    onSearch: vi.fn(),
    onFilterTag: vi.fn(),
    onToggleShowArchived: vi.fn(),
    onNewStash: vi.fn(),
    onLoadMore: vi.fn(),
  };
  render(
    <Sidebar
      stashes={Array.from({ length: count }, (_, i) => stash(i))}
      total={count}
      sortMode="updated"
      favoriteIds={new Set<string>()}
      selectedId={null}
      search=""
      filterTag=""
      tags={[]}
      recentTags={[]}
      showArchived={false}
      onSelectStash={vi.fn()}
      onGoHome={vi.fn()}
      onGraphView={vi.fn()}
      onSettingsView={vi.fn()}
      isSettingsView={false}
      settingsSection="welcome"
      onSettingsSection={vi.fn()}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

/**
 * The sidebar's own controls (search clear, archive toggle, "New Stash") carry
 * the same accessible names as the empty-state actions, so every query below is
 * scoped to the empty state itself.
 */
function emptyState() {
  const node = document.querySelector<HTMLElement>('.sidebar-empty');
  if (!node) throw new Error('sidebar empty state not rendered');
  return within(node);
}

describe('Sidebar empty state', () => {
  it('names the active search and offers to clear it', () => {
    const { onSearch } = renderSidebar(0, { search: 'redis' });
    expect(emptyState().getByText('No stashes match "redis".')).toBeTruthy();
    fireEvent.click(emptyState().getByRole('button', { name: 'Clear search' }));
    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('names the active tag filter and offers to clear it', () => {
    const { onFilterTag } = renderSidebar(0, { filterTag: 'infra' });
    expect(emptyState().getByText('No stashes tagged "infra".')).toBeTruthy();
    fireEvent.click(emptyState().getByRole('button', { name: 'Clear tag filter' }));
    expect(onFilterTag).toHaveBeenCalledWith('infra');
  });

  it('names both filters when search and tag are combined', () => {
    renderSidebar(0, { search: 'redis', filterTag: 'infra' });
    expect(emptyState().getByText('No stashes match "redis" with tag "infra".')).toBeTruthy();
  });

  it('offers the archive toggle and New Stash when nothing is filtered', () => {
    const { onToggleShowArchived, onNewStash } = renderSidebar(0);
    expect(emptyState().getByText('No active stashes.')).toBeTruthy();
    fireEvent.click(emptyState().getByRole('button', { name: 'Show archived' }));
    expect(onToggleShowArchived).toHaveBeenCalled();
    fireEvent.click(emptyState().getByRole('button', { name: 'New Stash' }));
    expect(onNewStash).toHaveBeenCalled();
  });

  it('does not offer "Show archived" when archived stashes are already shown', () => {
    renderSidebar(0, { showArchived: true });
    expect(emptyState().getByText('No stashes yet.')).toBeTruthy();
    expect(emptyState().queryByRole('button', { name: 'Show archived' })).toBeNull();
  });
});

describe('Sidebar load more', () => {
  it('offers "Load more" while the rendered list is shorter than the total', () => {
    const { onLoadMore } = renderSidebar(3, { total: 12 });
    const button = screen.getByRole('button', { name: 'Load more (3 of 12)' });
    fireEvent.click(button);
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('hides "Load more" once every match is rendered', () => {
    renderSidebar(3, { total: 3 });
    expect(document.querySelector('.sidebar-load-more')).toBeNull();
  });

  it('disables "Load more" while a load is in flight', () => {
    renderSidebar(3, { total: 12, loading: true });
    const button = document.querySelector<HTMLButtonElement>('.sidebar-load-more');
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe('Loading…');
  });

  it('stays hidden without an onLoadMore handler', () => {
    renderSidebar(3, { total: 12, onLoadMore: undefined });
    expect(document.querySelector('.sidebar-load-more')).toBeNull();
  });
});
