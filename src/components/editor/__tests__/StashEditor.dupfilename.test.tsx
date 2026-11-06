// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StashEditor from '../StashEditor';
import type { Stash } from '../../../types';

// Two rows sharing a filename used to surface only as a refused save. The
// rows themselves now say so while typing, with the same rule as the save
// check: trimmed, exact (case-sensitive) match.

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  localStorage.clear();
});

const STASH: Stash = {
  id: 'abc',
  name: 'Deploy notes',
  description: '',
  tags: [],
  metadata: {},
  version: 1,
  archived: false,
  backup_enabled: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  files: [
    { id: 'f1', stash_id: 'abc', filename: 'a.md', content: 'A', language: '', sort_order: 0 },
    { id: 'f2', stash_id: 'abc', filename: 'b.md', content: 'B', language: '', sort_order: 1 },
  ],
};

function nameInput(n: number): HTMLInputElement {
  return screen.getByRole('textbox', { name: `File ${n} filename` }) as HTMLInputElement;
}

describe('StashEditor duplicate filename warning', () => {
  it('flags both rows while two files share a name, and clears on rename', () => {
    const { container } = render(<StashEditor stash={STASH} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(container.querySelector('.editor-file-name-warning')).toBeNull();
    expect(nameInput(1).getAttribute('aria-invalid')).toBeNull();

    // Surrounding whitespace is trimmed before saving, so it still clashes.
    fireEvent.change(nameInput(2), { target: { value: ' a.md ' } });

    const warnings = container.querySelectorAll<HTMLElement>('.editor-file-name-warning');
    expect(warnings).toHaveLength(2);
    expect(warnings[0].textContent).toContain('also named “a.md”');
    for (const n of [1, 2]) {
      const input = nameInput(n);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      const described = input.getAttribute('aria-describedby');
      expect(described && document.getElementById(described)?.textContent).toContain('a.md');
    }

    fireEvent.change(nameInput(2), { target: { value: 'c.md' } });
    expect(container.querySelector('.editor-file-name-warning')).toBeNull();
    expect(nameInput(2).getAttribute('aria-invalid')).toBeNull();
  });

  it('refuses the save with the clashing name, without calling onSave', () => {
    // jsdom has no layout engine; the refused save scrolls its banner into view.
    Element.prototype.scrollIntoView = vi.fn();
    const onSave = vi.fn();
    render(<StashEditor stash={STASH} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(nameInput(2), { target: { value: ' a.md ' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Stash/ }));

    expect(screen.getByRole('alert').textContent).toBe(
      'Duplicate filename "a.md" — filenames must be unique within a stash.',
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('treats names that differ only in case as distinct, like the save check', () => {
    const { container } = render(<StashEditor stash={STASH} onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(nameInput(2), { target: { value: 'A.md' } });
    expect(container.querySelector('.editor-file-name-warning')).toBeNull();
  });
});
