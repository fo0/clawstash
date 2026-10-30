import { describe, it, expect } from 'vitest';
import { buildCurlCommand, buildStashUrl } from '../stash-url';

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

describe('buildCurlCommand', () => {
  it('builds a GET with the token placeholder and the absolute, quoted URL', () => {
    expect(buildCurlCommand('https://stash.example', '/api/stashes/abc')).toBe(
      'curl -H "Authorization: Bearer YOUR_TOKEN" "https://stash.example/api/stashes/abc"',
    );
  });

  it('trims trailing slashes on the origin', () => {
    expect(buildCurlCommand('http://localhost:3000//', '/api/stashes/abc')).toBe(
      'curl -H "Authorization: Bearer YOUR_TOKEN" "http://localhost:3000/api/stashes/abc"',
    );
  });

  it('keeps an encoded path as given and falls back to it without an origin', () => {
    expect(buildCurlCommand('', '/api/stashes/abc/files/my%20file.txt/raw')).toBe(
      'curl -H "Authorization: Bearer YOUR_TOKEN" "/api/stashes/abc/files/my%20file.txt/raw"',
    );
  });
});
