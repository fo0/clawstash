// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StashViewer from '../StashViewer';
import type { Stash } from '../../types';

// Details & API: next to each endpoint's Copy (relative path) sits a "curl"
// button that copies a ready-to-run call — absolute URL plus token header.

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
      filename: 'my notes.md',
      content: '# hi',
      language: 'markdown',
      sort_order: 0,
    },
  ],
};

function renderDetails() {
  const view = render(
    <StashViewer
      stash={STASH}
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
  fireEvent.click(screen.getByRole('tab', { name: /Details/ }));
  return view;
}

describe('StashViewer "curl" buttons', () => {
  it('names each button after its endpoint, visible text first', () => {
    renderDetails();
    expect(screen.getByRole('button', { name: 'curl command for this stash' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'curl command for raw my notes.md' })).toBeTruthy();
  });

  it('copies the stash GET as a curl call with the absolute URL', async () => {
    const { container } = renderDetails();
    fireEvent.click(screen.getByRole('button', { name: 'curl command for this stash' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `curl -H "Authorization: Bearer YOUR_TOKEN" "${window.location.origin}/api/stashes/abc"`,
      ),
    );
    await waitFor(() =>
      expect(container.querySelector('.sr-only[aria-live="polite"]')?.textContent).toContain(
        'curl command copied to clipboard',
      ),
    );
  });

  it('encodes the filename in the raw-file call', async () => {
    renderDetails();
    fireEvent.click(screen.getByRole('button', { name: 'curl command for raw my notes.md' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `curl -H "Authorization: Bearer YOUR_TOKEN" "${window.location.origin}/api/stashes/abc/files/my%20notes.md/raw"`,
      ),
    );
  });
});
