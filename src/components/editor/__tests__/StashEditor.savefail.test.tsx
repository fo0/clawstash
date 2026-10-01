// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StashEditor from '../StashEditor';
import type { Stash } from '../../../types';

// jsdom has no layout engine, so `scrollIntoView` does not exist by default.
const scrollIntoView = vi.fn();

/**
 * Tag / metadata-key suggestions answer with an empty list; the stash update
 * answers with whatever `patchResponse` returns.
 */
let patchResponse: () => Response;

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  patchResponse = () => new Response('{}', { status: 200 });
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'PATCH' ? patchResponse() : new Response('[]', { status: 200 }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  scrollIntoView.mockReset();
  cleanup();
});

const STASH: Stash = {
  id: 'abc',
  name: 'Notes',
  description: '',
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
      filename: 'notes.md',
      content: '# Notes',
      language: 'markdown',
      sort_order: 0,
    },
  ],
};

function pressSave(target: Element | Window = window) {
  fireEvent.keyDown(target, { key: 's', ctrlKey: true });
}

/** How many scrolls landed on the error banner itself. */
function bannerScrolls(): number {
  return scrollIntoView.mock.contexts.filter(
    (el) => el instanceof HTMLElement && el.classList.contains('error-banner'),
  ).length;
}

describe('StashEditor failed save', () => {
  it('brings a refused save into view, without moving focus', () => {
    // A new stash with an empty file row: nothing to save yet.
    render(<StashEditor stash={null} onSave={vi.fn()} onCancel={vi.fn()} />);
    const name = screen.getByLabelText(/^Name/) as HTMLInputElement;
    name.focus();

    pressSave(name);

    expect(screen.getByRole('alert').textContent).toBe(
      'At least one file with a filename is required.',
    );
    expect(bannerScrolls()).toBe(1);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(document.activeElement).toBe(name);
  });

  it('scrolls again when the same refusal repeats', () => {
    render(<StashEditor stash={null} onSave={vi.fn()} onCancel={vi.fn()} />);

    pressSave();
    pressSave();

    // The message did not change, so only the attempt count can drive this.
    expect(bannerScrolls()).toBe(2);
  });

  it('brings a server-side failure into view once the request comes back', async () => {
    patchResponse = () =>
      new Response(JSON.stringify({ error: 'Database is locked' }), { status: 500 });
    const onSave = vi.fn();
    render(<StashEditor stash={STASH} onSave={onSave} onCancel={vi.fn()} />);

    pressSave();

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Database is locked'));
    expect(bannerScrolls()).toBe(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not scroll on a save that succeeds', async () => {
    const onSave = vi.fn();
    render(<StashEditor stash={STASH} onSave={onSave} onCancel={vi.fn()} />);

    pressSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('abc'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(bannerScrolls()).toBe(0);
  });
});
