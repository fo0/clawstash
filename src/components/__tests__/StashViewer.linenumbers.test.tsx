// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StashViewer from '../StashViewer';
import type { Stash, StashFile } from '../../types';

// The raw code view's "Lines" toggle wraps every source line in a
// `code-line` span (numbered by CSS) and persists the choice globally.

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

function file(n: number, content: string): StashFile {
  return {
    id: `f${n}`,
    stash_id: 'abc',
    filename: `file-${n}.txt`,
    content,
    language: 'text',
    sort_order: n,
  };
}

function renderViewer(files: StashFile[]) {
  const stash: Stash = {
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
    files,
  };
  return render(
    <StashViewer
      stash={stash}
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

const TWELVE_LINES = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

describe('StashViewer line numbers', () => {
  it('is off by default and leaves the code view unchanged', () => {
    const { container } = renderViewer([file(0, 'a\nb\n')]);
    const toggle = screen.getByRole('button', { name: 'Show line numbers' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.file-content-numbered')).toBeNull();
    expect(container.querySelector('.code-line')).toBeNull();
  });

  it('numbers every line of every file, sized to the highest number', () => {
    const { container } = renderViewer([file(0, TWELVE_LINES), file(1, 'only\n')]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Show line numbers' })[0]);

    const pres = container.querySelectorAll<HTMLElement>('pre.file-content-numbered');
    expect(pres).toHaveLength(2);
    expect(pres[0].querySelectorAll('.code-line')).toHaveLength(12);
    expect(pres[0].style.getPropertyValue('--line-gutter')).toBe('2ch');
    expect(pres[1].querySelectorAll('.code-line')).toHaveLength(1);
    expect(pres[1].style.getPropertyValue('--line-gutter')).toBe('1ch');
    // The text itself is untouched, only split into lines.
    expect(pres[0].querySelector('.code-line')?.textContent).toBe('line 1');

    for (const button of screen.getAllByRole('button', { name: 'Hide line numbers' })) {
      expect(button.getAttribute('aria-pressed')).toBe('true');
    }
    expect(localStorage.getItem('clawstash-line-numbers')).toBe('true');
  });

  it('restores the persisted choice and can be switched off again', () => {
    localStorage.setItem('clawstash-line-numbers', 'true');
    const { container } = renderViewer([file(0, 'a\nb\n')]);
    expect(container.querySelectorAll('.code-line')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Hide line numbers' }));
    expect(container.querySelector('.code-line')).toBeNull();
    expect(container.querySelector('pre.file-content')?.textContent).toBe('a\nb\n');
    expect(localStorage.getItem('clawstash-line-numbers')).toBe('false');
  });
});
