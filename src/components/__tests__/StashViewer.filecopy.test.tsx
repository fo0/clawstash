// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StashViewer from '../StashViewer';
import type { Stash, StashFile } from '../../types';

// Every file row carries a button that reads just "Copy". Pin that each one
// is named after its file (visible text first, WCAG 2.5.3) and that the
// polite status names the file that was copied — or failed to be.

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  writeText = vi.fn().mockResolvedValue(undefined);
  // jsdom implements neither the async clipboard nor execCommand.
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
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

function renderViewer() {
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
    files: [file(0), file(1)],
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

function liveRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector<HTMLElement>('.sr-only[aria-live="polite"]');
  if (!region) throw new Error('copy status region not found');
  return region;
}

describe('StashViewer per-file Copy button', () => {
  it('names each button after its file, visible text first', () => {
    renderViewer();
    expect(screen.getByRole('button', { name: 'Copy file-0.txt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy file-1.txt' })).toBeTruthy();
  });

  it('copies that file and announces which one was copied', async () => {
    const { container } = renderViewer();

    fireEvent.click(screen.getByRole('button', { name: 'Copy file-1.txt' }));

    await waitFor(() =>
      expect(liveRegion(container).textContent).toContain('file-1.txt copied to clipboard'),
    );
    expect(writeText).toHaveBeenCalledWith('content 1');
    // The name keeps the file while the button shows its confirmation.
    expect(screen.getByRole('button', { name: 'Copied! file-1.txt' })).toBeTruthy();
  });

  it('names the file when the copy fails', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    // The util falls back to execCommand when the clipboard API rejects.
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => false),
      configurable: true,
    });
    const { container } = renderViewer();

    fireEvent.click(screen.getByRole('button', { name: 'Copy file-0.txt' }));

    await waitFor(() =>
      expect(liveRegion(container).textContent).toContain('Copying file-0.txt failed'),
    );
  });
});
