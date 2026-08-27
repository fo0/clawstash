// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import VersionDiff from '../VersionDiff';
import type { StashVersion } from '../../types';

afterEach(cleanup);

function version(n: number, files: Record<string, string>): StashVersion {
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
    files: Object.entries(files).map(([filename, content], i) => ({
      filename,
      content,
      language: 'text',
      sort_order: i,
    })),
  };
}

const V1 = version(1, { 'a.txt': 'one\ntwo\n', 'b.txt': 'alpha\n' });
const V2 = version(2, { 'a.txt': 'one\nTWO\n', 'b.txt': 'alpha\nbeta\n' });

function renderDiff() {
  render(<VersionDiff v1={V1} v2={V2} />);
}

describe('VersionDiff per-file collapse', () => {
  it('renders every changed file expanded by default', () => {
    renderDiff();
    expect(screen.getByRole('region', { name: 'Diff for a.txt' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Diff for b.txt' })).toBeTruthy();
  });

  it('folds a single file away and back without touching the others', () => {
    renderDiff();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse a.txt' }));

    expect(screen.queryByRole('region', { name: 'Diff for a.txt' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Diff for b.txt' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Expand a.txt' }));
    expect(screen.getByRole('region', { name: 'Diff for a.txt' })).toBeTruthy();
  });

  it('keeps the per-file line counts visible while collapsed', () => {
    renderDiff();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse b.txt' }));

    const header = screen.getByRole('button', { name: 'Expand b.txt' }).parentElement;
    expect(header?.textContent).toContain('+1');
    expect(header?.textContent).toContain('-0');
  });

  it('collapses and expands every file at once', () => {
    renderDiff();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all file diffs' }));

    expect(screen.queryByRole('region', { name: 'Diff for a.txt' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Diff for b.txt' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand all file diffs' }));
    expect(screen.getByRole('region', { name: 'Diff for a.txt' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Diff for b.txt' })).toBeTruthy();
  });
});
