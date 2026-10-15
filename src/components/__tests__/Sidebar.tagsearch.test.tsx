// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Sidebar from '../Sidebar';
import type { TagInfo } from '../../types';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// More than five tags, so the dropdown offers its search field.
const TAGS: TagInfo[] = ['backend', 'docker', 'frontend', 'prompts', 'secrets', 'testing'].map(
  (tag, i) => ({ tag, count: i + 1 }),
);

function openTagSearch() {
  const onFilterTag = vi.fn();
  render(
    <Sidebar
      stashes={[]}
      total={0}
      sortMode="updated"
      favoriteIds={new Set<string>()}
      selectedId={null}
      search=""
      onSearch={vi.fn()}
      filterTag=""
      onFilterTag={onFilterTag}
      tags={TAGS}
      recentTags={[]}
      showArchived={false}
      onToggleShowArchived={vi.fn()}
      onSelectStash={vi.fn()}
      onNewStash={vi.fn()}
      onGoHome={vi.fn()}
      onGraphView={vi.fn()}
      onSettingsView={vi.fn()}
      isSettingsView={false}
      settingsSection="welcome"
      onSettingsSection={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /filter by tag/i }));
  const input = screen.getByRole('combobox', { name: 'Search tags' });
  return { input, onFilterTag };
}

describe('Sidebar tag search', () => {
  it('names the query when nothing matches and clears it in one click', () => {
    const { input } = openTagSearch();
    fireEvent.change(input, { target: { value: 'zzz' } });

    expect(document.querySelector('.sidebar-tag-empty')?.textContent).toContain('zzz');
    expect(screen.getByRole('status').textContent).toBe('No tags match "zzz"');

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.getAllByRole('option')).toHaveLength(TAGS.length);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('announces how many tags a query leaves', () => {
    const { input } = openTagSearch();
    fireEvent.change(input, { target: { value: 'end' } });

    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe(`2 of ${TAGS.length} tags`);
  });

  it('ignores surrounding whitespace in the query', () => {
    const { input, onFilterTag } = openTagSearch();
    fireEvent.change(input, { target: { value: 'docker ' } });

    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFilterTag).toHaveBeenCalledWith('docker');
  });
});
