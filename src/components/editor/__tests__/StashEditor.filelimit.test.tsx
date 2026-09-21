// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StashEditor from '../StashEditor';
import type { Stash, StashFile } from '../../../types';

// The editor loads tag / metadata-key suggestions on mount. Stub fetch so the
// test neither hits the network nor depends on the rejection timing.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

/** Mirrors `MAX_FILES` in `src/server/validation.ts`. */
const MAX_FILES = 100;

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
    name: 'Big stash',
    description: '',
    tags: [],
    metadata: {},
    version: 1,
    archived: false,
    backup_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    files: Array.from({ length: fileCount }, (_, i) => file(i)),
  };
}

function fileRowCount(container: HTMLElement): number {
  return container.querySelectorAll('.editor-file').length;
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

describe('StashEditor file-count limit', () => {
  it('leaves both ways of adding a file open below the cap', () => {
    const { container } = render(
      <StashEditor stash={stashWith(MAX_FILES - 1)} onSave={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(button('Add File').disabled).toBe(false);
    expect(button('Import Files').disabled).toBe(false);
    expect(container.querySelector('.files-count')?.textContent).toBe(`99 / ${MAX_FILES}`);
  });

  it('stands both down at the cap and refuses a keyboard-raced add', () => {
    const { container } = render(
      <StashEditor stash={stashWith(MAX_FILES)} onSave={vi.fn()} onCancel={vi.fn()} />,
    );

    const add = button('Add File');
    expect(add.disabled).toBe(true);
    expect(button('Import Files').disabled).toBe(true);

    const count = container.querySelector('.files-count');
    expect(count?.textContent).toBe(`${MAX_FILES} / ${MAX_FILES}`);
    expect(count?.className).toContain('files-count-warn');

    // The guard inside addFile, not just the disabled attribute.
    fireEvent.click(add);
    expect(fileRowCount(container)).toBe(MAX_FILES);
  });

  it('imports only as many files as the stash can still hold and names the rest', async () => {
    const { container } = render(
      <StashEditor stash={stashWith(MAX_FILES - 1)} onSave={vi.fn()} onCancel={vi.fn()} />,
    );

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('No file input');

    fireEvent.change(input, {
      target: {
        files: [
          new File(['first'], 'a.txt', { type: 'text/plain' }),
          new File(['second'], 'b.txt', { type: 'text/plain' }),
          new File(['third'], 'c.txt', { type: 'text/plain' }),
        ],
      },
    });

    await waitFor(() => expect(fileRowCount(container)).toBe(MAX_FILES));

    const skipped = container.querySelector('.editor-import-skipped');
    expect(skipped?.textContent).toContain('b.txt');
    expect(skipped?.textContent).toContain('c.txt');
    expect(skipped?.textContent).toContain(`— a stash holds at most ${MAX_FILES} files.`);
    // The one that fit is really in the form, not just counted: filenames
    // live in input values, so read the last row's field rather than text.
    const filenames = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[id^="stash-file-name-"]'),
    ).map((input) => input.value);
    expect(filenames.at(-1)).toBe('a.txt');
    expect(filenames).not.toContain('b.txt');
  });
});
