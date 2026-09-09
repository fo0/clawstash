import { describe, it, expect } from 'vitest';
import { resolveGraphBack } from '../graph-nav';

describe('resolveGraphBack', () => {
  it('goes home when the graph was opened from the dashboard', () => {
    expect(resolveGraphBack(null, null)).toEqual({ type: 'home' });
    expect(resolveGraphBack(null, 'other')).toEqual({ type: 'home' });
  });

  it('switches back to the origin stash when it is already loaded', () => {
    expect(resolveGraphBack('a', 'a')).toEqual({ type: 'switch', stashId: 'a' });
  });

  it('fetches the origin stash on a deep link or reload', () => {
    expect(resolveGraphBack('a', undefined)).toEqual({ type: 'fetch', stashId: 'a' });
    expect(resolveGraphBack('a', null)).toEqual({ type: 'fetch', stashId: 'a' });
  });

  it('fetches when another stash is loaded, so back never keeps the wrong one', () => {
    expect(resolveGraphBack('a', 'b')).toEqual({ type: 'fetch', stashId: 'a' });
  });
});
