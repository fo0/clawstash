import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSortMode, saveSortMode, sortStashes, SORT_OPTIONS } from '../sort';
import type { StashListItem } from '../../types';

const STORAGE_KEY = 'clawstash_sort';

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', stub);
  // load/saveSortMode also guard on `window`; provide a minimal stub.
  vi.stubGlobal('window', { localStorage: stub });
  return store;
}

function makeStash(overrides: Partial<StashListItem>): StashListItem {
  return {
    id: 'id',
    name: '',
    description: '',
    tags: [],
    version: 1,
    archived: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    total_size: 0,
    files: [],
    ...overrides,
  };
}

describe('loadSortMode', () => {
  beforeEach(() => installLocalStorageStub());
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to "updated" when nothing is stored', () => {
    expect(loadSortMode()).toBe('updated');
  });

  it('returns a previously saved valid mode', () => {
    localStorage.setItem(STORAGE_KEY, 'name');
    expect(loadSortMode()).toBe('name');
  });

  it('falls back to "updated" on an invalid/hand-edited value', () => {
    localStorage.setItem(STORAGE_KEY, 'bogus');
    expect(loadSortMode()).toBe('updated');
  });
});

describe('saveSortMode', () => {
  beforeEach(() => installLocalStorageStub());
  afterEach(() => vi.unstubAllGlobals());

  it('persists and round-trips through loadSortMode', () => {
    saveSortMode('size');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('size');
    expect(loadSortMode()).toBe('size');
  });
});

describe('sortStashes', () => {
  const a = makeStash({
    id: 'a',
    name: 'Banana',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    total_size: 100,
  });
  const b = makeStash({
    id: 'b',
    name: 'apple',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    total_size: 300,
  });
  const c = makeStash({
    id: 'c',
    name: 'cherry',
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    total_size: 200,
  });
  const list = [a, b, c];

  it('does not mutate the input array', () => {
    const input = [a, b, c];
    sortStashes(input, 'name');
    expect(input).toEqual([a, b, c]);
  });

  it('orders by updated_at descending (newest first)', () => {
    expect(sortStashes(list, 'updated').map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('orders by created_at descending (newest first)', () => {
    expect(sortStashes(list, 'created').map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders by name case-insensitively A–Z', () => {
    expect(sortStashes(list, 'name').map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('orders by total_size descending (largest first)', () => {
    expect(sortStashes(list, 'size').map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('uses first filename as the name fallback when name is empty', () => {
    const noName = makeStash({
      id: 'z',
      name: '',
      files: [{ filename: 'aaa.txt', language: 'text', size: 1 }],
    });
    const withName = makeStash({ id: 'y', name: 'zzz' });
    expect(sortStashes([withName, noName], 'name').map((s) => s.id)).toEqual(['z', 'y']);
  });

  it('breaks ties deterministically by id', () => {
    const t1 = makeStash({ id: 'x2', total_size: 50 });
    const t2 = makeStash({ id: 'x1', total_size: 50 });
    expect(sortStashes([t1, t2], 'size').map((s) => s.id)).toEqual(['x1', 'x2']);
  });

  it('treats unparseable dates as oldest for date sorts', () => {
    const bad = makeStash({ id: 'bad', updated_at: 'not-a-date' });
    const good = makeStash({ id: 'good', updated_at: '2026-05-01T00:00:00.000Z' });
    expect(sortStashes([bad, good], 'updated').map((s) => s.id)).toEqual(['good', 'bad']);
  });
});

describe('SORT_OPTIONS', () => {
  it('exposes a label for every sort mode', () => {
    expect(SORT_OPTIONS.map((o) => o.value)).toEqual(['updated', 'created', 'name', 'size']);
    for (const o of SORT_OPTIONS) expect(o.label.length).toBeGreaterThan(0);
  });
});
