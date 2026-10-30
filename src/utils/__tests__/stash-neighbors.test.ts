import { describe, expect, it } from 'vitest';
import { findStashNeighbors } from '../stash-neighbors';

const item = (id: string, name = id, filenames: string[] = []) => ({
  id,
  name,
  files: filenames.map((filename) => ({ filename })),
});

describe('findStashNeighbors', () => {
  const list = [item('a'), item('b'), item('c')];

  it('returns both sides for a stash in the middle', () => {
    expect(findStashNeighbors(list, 'b')).toEqual({
      previous: { id: 'a', title: 'a' },
      next: { id: 'c', title: 'c' },
    });
  });

  it('leaves the missing side null at either end instead of wrapping', () => {
    expect(findStashNeighbors(list, 'a')).toEqual({
      previous: null,
      next: { id: 'b', title: 'b' },
    });
    expect(findStashNeighbors(list, 'c')).toEqual({
      previous: { id: 'b', title: 'b' },
      next: null,
    });
  });

  it('returns null when the stash is not in the list', () => {
    expect(findStashNeighbors(list, 'zzz')).toBeNull();
    expect(findStashNeighbors([], 'a')).toBeNull();
  });

  it('titles an unnamed neighbour by its first file, then "Untitled"', () => {
    const unnamed = [item('a'), item('b', '', ['notes.md', 'x.txt']), item('c', '')];
    expect(findStashNeighbors(unnamed, 'a')?.next?.title).toBe('notes.md');
    expect(findStashNeighbors(unnamed, 'b')?.next?.title).toBe('Untitled');
  });
});
