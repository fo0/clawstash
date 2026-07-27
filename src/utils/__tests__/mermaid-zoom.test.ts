import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ZOOM_STORAGE_PREFIX,
  MAX_STORED_ZOOM_KEYS,
  loadStoredScale,
  saveScale,
  clearStoredScale,
  pruneStoredScales,
} from '../mermaid-zoom';

/** In-memory Storage double with the insertion order localStorage exposes. */
function createStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _keys: () => [...map.keys()],
  };
}

describe('loadStoredScale', () => {
  it('reads the new "scale|timestamp" format', () => {
    const s = createStorage({ [`${ZOOM_STORAGE_PREFIX}a`]: '2.5|1700000000000' });
    expect(loadStoredScale('a', s)).toBe(2.5);
  });

  it('still reads legacy bare-scale entries', () => {
    const s = createStorage({ [`${ZOOM_STORAGE_PREFIX}a`]: '1.75' });
    expect(loadStoredScale('a', s)).toBe(1.75);
  });

  it('rejects out-of-range and unparseable values', () => {
    const s = createStorage({
      [`${ZOOM_STORAGE_PREFIX}big`]: '999|1',
      [`${ZOOM_STORAGE_PREFIX}small`]: '0.001|1',
      [`${ZOOM_STORAGE_PREFIX}junk`]: 'nope|1',
    });
    expect(loadStoredScale('big', s)).toBeNull();
    expect(loadStoredScale('small', s)).toBeNull();
    expect(loadStoredScale('junk', s)).toBeNull();
  });

  it('returns null without a key or storage', () => {
    expect(loadStoredScale(undefined, createStorage())).toBeNull();
    expect(loadStoredScale('a', null)).toBeNull();
  });
});

describe('saveScale / clearStoredScale', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('round-trips through the timestamped format', () => {
    const s = createStorage();
    saveScale('a', 1.5, s);
    expect(s.getItem(`${ZOOM_STORAGE_PREFIX}a`)).toBe(`1.5|${Date.now()}`);
    expect(loadStoredScale('a', s)).toBe(1.5);
  });

  it('removes a single entry', () => {
    const s = createStorage({ [`${ZOOM_STORAGE_PREFIX}a`]: '1|1' });
    clearStoredScale('a', s);
    expect(loadStoredScale('a', s)).toBeNull();
  });
});

describe('pruneStoredScales', () => {
  it('keeps the store untouched below the cap', () => {
    const s = createStorage();
    for (let i = 0; i < MAX_STORED_ZOOM_KEYS; i++) {
      s.setItem(`${ZOOM_STORAGE_PREFIX}k${i}`, `1|${1000 + i}`);
    }
    expect(pruneStoredScales(s)).toBe(0);
    expect(s.length).toBe(MAX_STORED_ZOOM_KEYS);
  });

  it('evicts the least recently written entries above the cap', () => {
    const s = createStorage();
    for (let i = 0; i < MAX_STORED_ZOOM_KEYS + 10; i++) {
      s.setItem(`${ZOOM_STORAGE_PREFIX}k${i}`, `1|${1000 + i}`);
    }
    expect(pruneStoredScales(s)).toBe(10);
    expect(s.length).toBe(MAX_STORED_ZOOM_KEYS);
    // k0..k9 were the oldest writes.
    expect(s.getItem(`${ZOOM_STORAGE_PREFIX}k0`)).toBeNull();
    expect(s.getItem(`${ZOOM_STORAGE_PREFIX}k9`)).toBeNull();
    expect(s.getItem(`${ZOOM_STORAGE_PREFIX}k10`)).not.toBeNull();
  });

  it('evicts legacy timestamp-less entries first', () => {
    const s = createStorage();
    s.setItem(`${ZOOM_STORAGE_PREFIX}legacy`, '1.25');
    for (let i = 0; i < MAX_STORED_ZOOM_KEYS; i++) {
      s.setItem(`${ZOOM_STORAGE_PREFIX}k${i}`, `1|${1000 + i}`);
    }
    expect(pruneStoredScales(s)).toBe(1);
    expect(s.getItem(`${ZOOM_STORAGE_PREFIX}legacy`)).toBeNull();
  });

  it('ignores unrelated localStorage keys', () => {
    const s = createStorage({ clawstash_theme: 'dark', other: 'x' });
    for (let i = 0; i < MAX_STORED_ZOOM_KEYS + 5; i++) {
      s.setItem(`${ZOOM_STORAGE_PREFIX}k${i}`, `1|${1000 + i}`);
    }
    pruneStoredScales(s);
    expect(s.getItem('clawstash_theme')).toBe('dark');
    expect(s.getItem('other')).toBe('x');
    expect(s._keys().filter((k) => k.startsWith(ZOOM_STORAGE_PREFIX))).toHaveLength(
      MAX_STORED_ZOOM_KEYS,
    );
  });

  it('caps the store when writing through saveScale', () => {
    const s = createStorage();
    for (let i = 0; i < MAX_STORED_ZOOM_KEYS + 20; i++) {
      saveScale(`k${i}`, 1 + i / 100, s);
    }
    expect(s._keys().filter((k) => k.startsWith(ZOOM_STORAGE_PREFIX))).toHaveLength(
      MAX_STORED_ZOOM_KEYS,
    );
    // The most recent write always survives.
    expect(loadStoredScale(`k${MAX_STORED_ZOOM_KEYS + 19}`, s)).not.toBeNull();
  });
});
