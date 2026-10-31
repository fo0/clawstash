// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import VersionDiff from '../VersionDiff';
import type { StashVersion } from '../../types';

afterEach(cleanup);

function version(n: number, content: string): StashVersion {
  return {
    id: `v-${n}`,
    stash_id: 'abc',
    name: 'Stash',
    description: '',
    tags: [],
    metadata: {},
    version: n,
    created_by: 'admin',
    created_at: '2026-01-01T00:00:00.000Z',
    files: [{ filename: 'long.txt', content, language: 'text', sort_order: 0 }],
  };
}

// 40 lines, line 20 changed: 19 unchanged lines above it, 20 below.
const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
const OLD = lines.join('\n') + '\n';
const NEW = lines.map((l, i) => (i === 19 ? 'line 20 edited' : l)).join('\n') + '\n';

describe('VersionDiff unchanged-line folding', () => {
  it('folds long unchanged runs around a change and keeps 3 lines of context', () => {
    render(<VersionDiff v1={version(1, OLD)} v2={version(2, NEW)} />);

    expect(screen.getByText('line 20 edited')).toBeTruthy();
    expect(screen.getByText('line 17')).toBeTruthy();
    expect(screen.getByText('line 23')).toBeTruthy();
    expect(screen.queryByText('line 1')).toBeNull();
    expect(screen.queryByText('line 40')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show 16 unchanged lines' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show 17 unchanged lines' })).toBeTruthy();
  });

  it('opens a fold on click and keeps focus inside the file', () => {
    render(<VersionDiff v1={version(1, OLD)} v2={version(2, NEW)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show 16 unchanged lines' }));

    expect(screen.getByText('line 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show 16 unchanged lines' })).toBeNull();
    // The other fold stays closed.
    expect(screen.queryByText('line 40')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Diff for long.txt' }));
  });
});
