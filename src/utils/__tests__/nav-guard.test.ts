import { describe, it, expect } from 'vitest';
import { decidePopState } from '../nav-guard';

describe('decidePopState', () => {
  it('navigates without asking when the editor is clean', () => {
    let asked = false;
    const decision = decidePopState(false, '/stash/a/edit', () => {
      asked = true;
      return true;
    });
    expect(decision).toEqual({ type: 'proceed' });
    expect(asked).toBe(false);
  });

  it('restores the editor URL when the discard is declined', () => {
    expect(decidePopState(true, '/stash/a/edit', () => false)).toEqual({
      type: 'restore',
      path: '/stash/a/edit',
    });
  });

  it('navigates and stops asking once the discard is confirmed', () => {
    let dirty = true;
    const confirmDiscard = () => {
      dirty = false;
      return true;
    };
    expect(decidePopState(dirty, '/new', confirmDiscard)).toEqual({ type: 'proceed' });
    expect(dirty).toBe(false);
    expect(decidePopState(dirty, '/new', confirmDiscard)).toEqual({ type: 'proceed' });
  });

  it('proceeds when no restore path was recorded', () => {
    expect(decidePopState(true, null, () => false)).toEqual({ type: 'proceed' });
  });
});
