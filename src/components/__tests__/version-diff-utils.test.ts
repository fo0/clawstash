import { describe, it, expect } from 'vitest';
import {
  computeFileDiffs,
  diffAddedFile,
  diffRemovedFile,
  diffModifiedFile,
  STATUS_ORDER,
} from '../version-diff-utils';
import type { StashVersion, StashVersionFile } from '../../types';

// Minimal StashVersion fixture — only the fields `computeFileDiffs` reads.
function v(files: { filename: string; content: string }[]): StashVersion {
  const versionFiles: StashVersionFile[] = files.map((f, i) => ({
    filename: f.filename,
    content: f.content,
    language: '',
    sort_order: i,
  }));
  return {
    id: 'x',
    stash_id: 's',
    name: '',
    description: '',
    tags: [],
    metadata: {},
    version: 1,
    created_by: 'system',
    created_at: '2026-01-01T00:00:00Z',
    files: versionFiles,
  };
}

describe('STATUS_ORDER', () => {
  it('sorts modified < added < removed < unchanged', () => {
    expect(STATUS_ORDER.modified).toBeLessThan(STATUS_ORDER.added);
    expect(STATUS_ORDER.added).toBeLessThan(STATUS_ORDER.removed);
    expect(STATUS_ORDER.removed).toBeLessThan(STATUS_ORDER.unchanged);
  });
});

describe('diffAddedFile', () => {
  it('emits one add line per source line, 1-indexed by newLineNo', () => {
    const r = diffAddedFile('a.txt', 'hello\nworld');
    expect(r.status).toBe('added');
    expect(r.filename).toBe('a.txt');
    expect(r.hunks).toHaveLength(1);
    expect(r.hunks[0].lines).toEqual([
      { type: 'add', content: 'hello', newLineNo: 1 },
      { type: 'add', content: 'world', newLineNo: 2 },
    ]);
  });
});

describe('diffRemovedFile', () => {
  it('emits one remove line per source line, 1-indexed by oldLineNo', () => {
    const r = diffRemovedFile('a.txt', 'gone\naway');
    expect(r.status).toBe('removed');
    expect(r.hunks[0].lines).toEqual([
      { type: 'remove', content: 'gone', oldLineNo: 1 },
      { type: 'remove', content: 'away', oldLineNo: 2 },
    ]);
  });
});

describe('diffModifiedFile', () => {
  it('preserves context lines and tags adds/removes', () => {
    const r = diffModifiedFile('a.txt', 'a\nb\nc', 'a\nB\nc');
    expect(r.status).toBe('modified');
    const types = r.hunks[0].lines.map((l) => l.type);
    expect(types).toContain('add');
    expect(types).toContain('remove');
    expect(types).toContain('context');
  });

  it('counts old/new line numbers independently', () => {
    const r = diffModifiedFile('a.txt', 'keep\nold', 'keep\nnew\nextra');
    const adds = r.hunks[0].lines.filter((l) => l.type === 'add');
    const removes = r.hunks[0].lines.filter((l) => l.type === 'remove');
    expect(adds.length).toBeGreaterThan(0);
    expect(removes.length).toBeGreaterThan(0);
    // every add line carries newLineNo, every remove carries oldLineNo
    for (const a of adds) expect(typeof a.newLineNo).toBe('number');
    for (const rm of removes) expect(typeof rm.oldLineNo).toBe('number');
  });
});

describe('computeFileDiffs', () => {
  it('classifies added / removed / modified / unchanged across versions', () => {
    const v1 = v([
      { filename: 'kept.txt', content: 'same' },
      { filename: 'gone.txt', content: 'old' },
      { filename: 'changed.txt', content: 'a\nb' },
    ]);
    const v2 = v([
      { filename: 'kept.txt', content: 'same' },
      { filename: 'new.txt', content: 'fresh' },
      { filename: 'changed.txt', content: 'a\nB' },
    ]);
    const diffs = computeFileDiffs(v1, v2);
    const byName = Object.fromEntries(diffs.map((d) => [d.filename, d.status]));
    expect(byName).toEqual({
      'changed.txt': 'modified',
      'new.txt': 'added',
      'gone.txt': 'removed',
      'kept.txt': 'unchanged',
    });
  });

  it('sorts modified, then added, then removed, then unchanged', () => {
    const v1 = v([
      { filename: 'kept', content: 'x' },
      { filename: 'old', content: 'a' },
      { filename: 'changed', content: 'a' },
    ]);
    const v2 = v([
      { filename: 'kept', content: 'x' },
      { filename: 'new', content: 'b' },
      { filename: 'changed', content: 'b' },
    ]);
    const order = computeFileDiffs(v1, v2).map((d) => d.status);
    expect(order).toEqual(['modified', 'added', 'removed', 'unchanged']);
  });

  it('returns empty array when both versions have no files', () => {
    expect(computeFileDiffs(v([]), v([]))).toEqual([]);
  });

  it('treats identical-content same-name files as unchanged with empty hunks', () => {
    const v1 = v([{ filename: 'same.txt', content: 'foo\nbar' }]);
    const v2 = v([{ filename: 'same.txt', content: 'foo\nbar' }]);
    const diffs = computeFileDiffs(v1, v2);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].status).toBe('unchanged');
    expect(diffs[0].hunks).toEqual([]);
  });
});
