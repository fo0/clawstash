// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import StashEditor from '../StashEditor';
import type { Stash } from '../../../types';

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

const STASH: Stash = {
  id: 'abc',
  name: 'Deploy notes',
  description: 'How we ship',
  tags: [],
  metadata: {},
  version: 1,
  archived: false,
  backup_enabled: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  files: [
    {
      id: 'f1',
      stash_id: 'abc',
      filename: 'deploy.md',
      content: '# Deploy\nstep one',
      language: 'markdown',
      sort_order: 0,
    },
    {
      id: 'f2',
      stash_id: 'abc',
      filename: 'rollback.md',
      content: '# Rollback',
      language: 'markdown',
      sort_order: 1,
    },
  ],
};

/** The mounted code editors — one per expanded file row. */
function editorCount(container: HTMLElement): number {
  return container.querySelectorAll('.code-editor-wrapper').length;
}

function collapseToggle(container: HTMLElement, label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`No button labelled "${label}"`);
  return button;
}

describe('StashEditor file collapse', () => {
  it('folds a single file away and back without touching its content', () => {
    const { container } = render(<StashEditor stash={STASH} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(editorCount(container)).toBe(2);

    fireEvent.click(collapseToggle(container, 'Collapse deploy.md'));
    expect(editorCount(container)).toBe(1);
    // The filename input stays editable while the file is folded.
    expect(
      Array.from(container.querySelectorAll<HTMLInputElement>('input')).map((el) => el.value),
    ).toContain('deploy.md');

    fireEvent.click(collapseToggle(container, 'Expand deploy.md'));
    expect(editorCount(container)).toBe(2);
    expect(
      Array.from(container.querySelectorAll('textarea')).some((t) =>
        t.value.includes('# Deploy\nstep one'),
      ),
    ).toBe(true);
  });

  it('collapses and expands every file from the master toggle', () => {
    const { container } = render(<StashEditor stash={STASH} onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(collapseToggle(container, 'Collapse all files'));
    expect(editorCount(container)).toBe(0);
    // Each folded row summarizes what it hides instead of vanishing silently.
    expect(container.querySelectorAll('.editor-file-collapsed-summary').length).toBe(2);

    fireEvent.click(collapseToggle(container, 'Expand all files'));
    expect(editorCount(container)).toBe(2);
  });

  it('offers no master toggle for a single-file stash', () => {
    const { container } = render(
      <StashEditor
        stash={{ ...STASH, files: [STASH.files[0]] }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.querySelector('.editor-files-collapse-all')).toBeNull();
    // The per-file toggle is still there — a single long file folds too.
    expect(collapseToggle(container, 'Collapse deploy.md')).toBeTruthy();
  });
});
