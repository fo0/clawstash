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

function renderViewer(fileCount: number, name = 'My stash') {
  const stash: Stash = {
    id: 'abc',
    name,
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

/**
 * Capture the download anchor the click produces. jsdom implements neither
 * `URL.createObjectURL` nor anchor navigation, so both are stubbed.
 */
function captureDownload() {
  const blobs: Blob[] = [];
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      blobs.push(blob);
      return 'blob:mock';
    },
    revokeObjectURL: vi.fn(),
  });
  const anchors: HTMLAnchorElement[] = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === 'a') {
      (el as HTMLAnchorElement).click = vi.fn();
      anchors.push(el as HTMLAnchorElement);
    }
    return el;
  });
  return { anchors, blobs };
}

describe('StashViewer download-all', () => {
  it('saves every file under a slug of the stash name', async () => {
    renderViewer(3);
    const { anchors, blobs } = captureDownload();

    fireEvent.click(screen.getByRole('button', { name: 'Download all 3 files as one text file' }));

    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe('my-stash.txt');
    expect(await blobs[0].text()).toBe(
      '// === file-0.txt ===\ncontent 0\n\n' +
        '// === file-1.txt ===\ncontent 1\n\n' +
        '// === file-2.txt ===\ncontent 2',
    );
  });

  it('stays out of the way for a single-file stash, which has its own download', () => {
    renderViewer(1);
    expect(screen.queryByRole('button', { name: /Download all/ })).toBeNull();
  });
});
