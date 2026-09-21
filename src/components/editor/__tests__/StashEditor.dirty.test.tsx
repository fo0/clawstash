// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
      content: '# Deploy',
      language: 'markdown',
      sort_order: 0,
    },
  ],
};

function dirtyBadge(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.editor-dirty-badge');
}

describe('StashEditor unsaved-changes indicator', () => {
  it('stays hidden until the form is actually edited', () => {
    const { container } = render(<StashEditor stash={STASH} onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(dirtyBadge(container)).toBeNull();
  });

  it('appears on the first edit and reports it to assistive tech', () => {
    const { container } = render(<StashEditor stash={STASH} onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Deploy notes v2' } });

    const badge = dirtyBadge(container);
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Unsaved changes');
    expect(badge?.getAttribute('role')).toBe('status');
  });

  it('tracks the same state the unload guard uses — an edit anywhere in the form arms it', () => {
    const { container } = render(<StashEditor stash={STASH} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(dirtyBadge(container)).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'changed' } });

    expect(dirtyBadge(container)).not.toBeNull();
  });
});
