import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  addRecentSearch,
  loadRecentSearches,
  recordRecentSearch,
  saveRecentSearches,
  MAX_RECENT_SEARCHES,
  MAX_RECENT_SEARCH_LENGTH,
} from '../recent-searches';

const STORAGE_KEY = 'clawstash_recent_searches';

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
  vi.stubGlobal('window', { localStorage: stub });
  return store;
}

describe('addRecentSearch (pure)', () => {
  it('prepends the trimmed query', () => {
    expect(addRecentSearch(['a'], '  b  ')).toEqual(['b', 'a']);
  });

  it('dedupes case-insensitively and keeps the newest spelling', () => {
    expect(addRecentSearch(['Docker', 'b'], 'docker')).toEqual(['docker', 'b']);
  });

  it('caps the list at MAX_RECENT_SEARCHES', () => {
    let list: readonly string[] = [];
    for (let i = 0; i < MAX_RECENT_SEARCHES + 2; i++) list = addRecentSearch(list, `q${i}`);
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0]).toBe(`q${MAX_RECENT_SEARCHES + 1}`);
  });

  it('returns the same list for a blank or over-long query', () => {
    const list = ['a'];
    expect(addRecentSearch(list, '   ')).toBe(list);
    expect(addRecentSearch(list, 'x'.repeat(MAX_RECENT_SEARCH_LENGTH + 1))).toBe(list);
  });
});

describe('load/save/record (localStorage)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installLocalStorageStub();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns an empty list when nothing is stored', () => {
    expect(loadRecentSearches()).toEqual([]);
  });

  it('drops non-string and blank entries and survives bad JSON', () => {
    store.set(STORAGE_KEY, JSON.stringify(['a', 1, '  ', null, 'b']));
    expect(loadRecentSearches()).toEqual(['a', 'b']);
    store.set(STORAGE_KEY, '{nope');
    expect(loadRecentSearches()).toEqual([]);
  });

  it('records newest first and persists it', () => {
    recordRecentSearch('first');
    expect(recordRecentSearch('second')).toEqual(['second', 'first']);
    expect(loadRecentSearches()).toEqual(['second', 'first']);
  });

  it('removes the key when an empty list is saved', () => {
    saveRecentSearches(['a']);
    saveRecentSearches([]);
    expect(store.has(STORAGE_KEY)).toBe(false);
  });
});
