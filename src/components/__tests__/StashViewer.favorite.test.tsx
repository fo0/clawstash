// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import StashViewer from '../StashViewer';
import type { Stash } from '../../types';

afterEach(cleanup);

const STASH: Stash = {
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
  files: [
    {
      id: 'f1',
      stash_id: 'abc',
      filename: 'a.txt',
      content: 'hello',
      language: 'text',
      sort_order: 0,
    },
  ],
};

function renderViewer(isFavorite: boolean, onToggleFavorite = vi.fn()) {
  const view = render(
    <StashViewer
      stash={STASH}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onArchive={vi.fn()}
      onBack={vi.fn()}
      onAnalyzeStash={vi.fn()}
      onFilterTag={vi.fn()}
      isFavorite={isFavorite}
      onToggleFavorite={onToggleFavorite}
    />,
  );
  return { ...view, onToggleFavorite };
}

describe('StashViewer favorite toggle', () => {
  it('renders the toggle in the unpinned state', () => {
    const { container } = renderViewer(false);
    const btn = container.querySelector('[data-testid="viewer-favorite-toggle"]')!;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.className).not.toContain('is-favorite');
    expect(btn.getAttribute('aria-label')).toBe('Pin "My stash" to top');
  });

  it('reflects the pinned state', () => {
    const { container } = renderViewer(true);
    const btn = container.querySelector('[data-testid="viewer-favorite-toggle"]')!;
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.className).toContain('is-favorite');
    expect(btn.getAttribute('aria-label')).toBe('Unpin "My stash" from top');
  });

  it('reports the stash id so the shell can persist the change', () => {
    const { container, onToggleFavorite } = renderViewer(false);
    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="viewer-favorite-toggle"]',
    )!;
    btn.click();
    expect(onToggleFavorite).toHaveBeenCalledWith('abc');
  });
});
