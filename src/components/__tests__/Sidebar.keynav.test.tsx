// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Sidebar from '../Sidebar';
import type { StashListItem } from '../../types';

// jsdom implements no layout, so `Element.scrollIntoView` is missing — the
// keep-in-view call in the navigation handler would throw without a stub.
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
    // Descending so the default 'updated' sort keeps the render order stable.
    updated_at: `2026-01-0${9 - n}T00:00:00.000Z`,
    total_size: 1,
    files: [{ filename: `file-${n}.txt`, language: 'text', size: 1 }],
  };
}

function renderSidebar(count = 3) {
  const onSelectStash = vi.fn();
  render(
    <Sidebar
      stashes={Array.from({ length: count }, (_, i) => stash(i))}
      total={count}
      sortMode="updated"
      favoriteIds={new Set<string>()}
      selectedId={null}
      search=""
      onSearch={vi.fn()}
      filterTag=""
      onFilterTag={vi.fn()}
      tags={[]}
      recentTags={[]}
      showArchived={false}
      onToggleShowArchived={vi.fn()}
      onSelectStash={onSelectStash}
      onNewStash={vi.fn()}
      onGoHome={vi.fn()}
      onGraphView={vi.fn()}
      onSettingsView={vi.fn()}
      isSettingsView={false}
      settingsSection="welcome"
      onSettingsSection={vi.fn()}
    />,
  );
  const input = screen.getByLabelText('Search stashes');
  const rows = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.sidebar-item'));
  return { input, rows, onSelectStash };
}

describe('Sidebar stash-list keyboard navigation', () => {
  it('steps from the search field into the first row on ArrowDown', () => {
    const { input, rows } = renderSidebar();
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[0]);
  });

  it('walks the list with ArrowDown / ArrowUp and stops at the last row', () => {
    const { input, rows } = renderSidebar();
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: 'ArrowDown' });
    fireEvent.keyDown(rows[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[1]);
  });

  it('Home / End jump to the ends of the list', () => {
    const { input, rows } = renderSidebar();
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(rows[0], { key: 'End' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2], { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
  });

  it('hands focus back to the search field on ArrowUp from the first row', () => {
    const { input, rows } = renderSidebar();
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(input);
  });

  it('leaves the search field alone when the list is empty', () => {
    const { input } = renderSidebar(0);
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(input);
  });

  it('opens the focused row on click, as before', () => {
    const { rows, onSelectStash } = renderSidebar();
    fireEvent.click(rows[1]);
    expect(onSelectStash).toHaveBeenCalledWith('id-1');
  });
});
