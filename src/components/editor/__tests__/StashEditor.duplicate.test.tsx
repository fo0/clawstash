// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
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
  tags: ['ops'],
  metadata: { owner: 'fo0' },
  version: 3,
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

function values(container: HTMLElement, selector: string): string[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>(selector)).map((el) => el.value);
}

describe('StashEditor duplicate template', () => {
  it('pre-fills a new stash from the template', () => {
    const { container } = render(
      <StashEditor
        stash={null}
        template={{ ...STASH, name: 'Deploy notes (copy)' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.querySelector('h2')?.textContent).toBe('Duplicate Stash');
    // Name + description + the file row come from the template.
    expect(values(container, 'input')).toContain('Deploy notes (copy)');
    expect(values(container, 'input')).toContain('deploy.md');
    expect(
      Array.from(container.querySelectorAll('textarea')).some((t) =>
        t.value.includes('How we ship'),
      ),
    ).toBe(true);
  });

  it('renders a blank form without a template', () => {
    const { container } = render(
      <StashEditor stash={null} template={null} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.querySelector('h2')?.textContent).toBe('New Stash');
    expect(values(container, 'input').every((v) => v === '')).toBe(true);
  });

  it('ignores the template while editing an existing stash', () => {
    const { container } = render(
      <StashEditor
        stash={STASH}
        template={{ ...STASH, id: 'other', name: 'Should not win' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.querySelector('h2')?.textContent).toBe('Edit Stash');
    expect(values(container, 'input')).toContain('Deploy notes');
    expect(values(container, 'input')).not.toContain('Should not win');
  });
});
