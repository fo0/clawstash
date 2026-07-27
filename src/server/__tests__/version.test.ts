import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPublicVersionInfo } from '../version';

// `/api/version` serves this shape to callers without the `read` scope once
// auth is enabled. Two properties matter and are easy to regress: it must not
// carry the build fingerprint, and building it must not touch the network —
// otherwise an anonymous caller could still trigger server-side egress to
// GitHub and burn the shared unauthenticated rate limit.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPublicVersionInfo', () => {
  it('withholds the build fingerprint', () => {
    const info = getPublicVersionInfo();
    expect(info.current).toBeNull();
    expect(info.latest).toBeNull();
    expect(info.update_available).toBe(false);
  });

  it('keeps the public repository URL and a timestamp', () => {
    const info = getPublicVersionInfo();
    expect(info.github_url).toBe('https://github.com/fo0/clawstash');
    expect(Number.isNaN(new Date(info.checked_at).getTime())).toBe(false);
  });

  it('performs no outbound request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    getPublicVersionInfo();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('serialises without exposing any build field', () => {
    const serialised = JSON.stringify(getPublicVersionInfo());
    expect(serialised).not.toContain('commit_sha');
    expect(serialised).not.toContain('build_date');
    expect(serialised).not.toContain('branch');
  });
});
