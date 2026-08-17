// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StashViewer from '../StashViewer';
import type { Stash, StashFile } from '../../types';

// jsdom has no layout engine, so neither `scrollIntoView` nor `matchMedia`
// (read for the reduced-motion scroll behaviour) exists by default.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function file(n: number): StashFile {
  return {
    id: `f${n}`,
    stash_id: 'abc',
    filename: `file-${n}.txt`,
    content: `content ${n}`,
    language: 'text',
    sort_order: n,
  };
}

function stashWith(fileCount: number): Stash {
  return {
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
    files: Array.from({ length: fileCount }, (_, i) => file(i)),
  };
}

function renderViewer(fileCount: number) {
  return render(
    <StashViewer
      stash={stashWith(fileCount)}
      onEdit={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onArchive={vi.fn()}
      onBack={vi.fn()}
      onAnalyzeStash={vi.fn()}
      onFilterTag={vi.fn()}
      isFavorite={false}
      onToggleFavorite={vi.fn()}
    />,
  );
}

describe('StashViewer file quick-jump bar', () => {
  it('offers one chip per file on a multi-file stash', () => {
    renderViewer(3);
    const bar = screen.getByRole('navigation', { name: 'Jump to file' });
    const chips = bar.querySelectorAll('.viewer-file-jump-chip');
    expect(Array.from(chips).map((c) => c.textContent)).toEqual([
      'file-0.txt',
      'file-1.txt',
      'file-2.txt',
    ]);
  });

  it('stays out of the way for a single-file stash', () => {
    renderViewer(1);
    expect(screen.queryByRole('navigation', { name: 'Jump to file' })).toBeNull();
  });

  it('scrolls to the file the chip names', () => {
    const { container } = renderViewer(3);
    const target = container.querySelector('#stash-file-2')!;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getByTitle('Jump to file-2.txt'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('expands a collapsed file before scrolling to it', () => {
    const { container } = renderViewer(3);
    // Collapse file 1 through its own header toggle.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse file-1.txt' }));
    expect(screen.getByRole('button', { name: 'Expand file-1.txt' })).toBeTruthy();
    expect(container.querySelector('#stash-file-1 .file-content')).toBeNull();

    fireEvent.click(screen.getByTitle('Jump to file-1.txt'));
    // Back to expanded — the content is rendered again and the toggle flipped.
    expect(screen.getByRole('button', { name: 'Collapse file-1.txt' })).toBeTruthy();
    expect(container.querySelector('#stash-file-1 .file-content')).toBeTruthy();
  });
});
