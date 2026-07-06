import { describe, it, expect } from 'vitest';
import { buildStashUrl } from '../stash-url';

describe('buildStashUrl', () => {
  it('joins an origin and the stash path', () => {
    expect(buildStashUrl('https://stash.example', 'abc-123')).toBe(
      'https://stash.example/stash/abc-123',
    );
  });

  it('trims a single trailing slash on the origin', () => {
    expect(buildStashUrl('https://stash.example/', 'abc')).toBe('https://stash.example/stash/abc');
  });

  it('trims multiple trailing slashes on the origin', () => {
    expect(buildStashUrl('https://stash.example///', 'abc')).toBe(
      'https://stash.example/stash/abc',
    );
  });

  it('preserves a port in the origin', () => {
    expect(buildStashUrl('http://localhost:3000', 'id')).toBe('http://localhost:3000/stash/id');
  });

  it('falls back to a relative path when the origin is empty', () => {
    expect(buildStashUrl('', 'id')).toBe('/stash/id');
  });
});
