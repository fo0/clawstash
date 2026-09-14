import { describe, expect, it } from 'vitest';
import { moveItem } from '../array-move';

describe('moveItem', () => {
  it('moves an item up and down by one', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'c', 'b']);
  });

  it('moves across the whole array, not just neighbours', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('never mutates the input', () => {
    const input = ['a', 'b', 'c'];
    const result = moveItem(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
    expect(result).not.toBe(input);
  });

  it('returns an unchanged copy for a no-op or an out-of-range index', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 0, 2)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(moveItem([], 0, 0)).toEqual([]);
  });
});
